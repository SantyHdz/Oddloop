import { createHash, randomBytes } from "node:crypto";
import { can, type Action, type Actor } from "../auth/permissions.js";
import { AppError } from "../errors.js";
import type { Hasher, Role, Store, User } from "./types.js";

const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // RF-01: sessions last 7 days
const MAX_PASSWORD_LENGTH = 1024; // argon2 on a huge input would be a cheap way to slow the server

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function createAccounts(store: Store, hasher: Hasher, now: () => Date = () => new Date()) {
  function assertCan(actor: Actor, action: Action) {
    if (!can(actor, action)) throw new AppError(403, "forbidden", "You are not allowed to do this");
  }

  // The owner chose no password rules: anything except empty.
  function assertPassword(password: string) {
    if (password.length === 0 || password.length > MAX_PASSWORD_LENGTH) {
      throw new AppError(400, "invalid_password", "Invalid password");
    }
  }

  async function getUser(id: number) {
    const user = await store.findUserById(id);
    if (!user) throw new AppError(404, "not_found", "User not found");
    return user;
  }

  return {
    async login(email: string, password: string) {
      const user = await store.findUserByEmail(normalizeEmail(email));
      // Same error and similar time for "no such user", "wrong password" and "deactivated",
      // so the answer does not reveal which emails exist.
      if (!user) {
        await hasher.hash(password);
        throw new AppError(401, "invalid_credentials", "Invalid email or password");
      }
      const valid = await hasher.verify(user.passwordHash, password);
      if (!valid || !user.active) throw new AppError(401, "invalid_credentials", "Invalid email or password");

      const token = randomBytes(32).toString("base64url");
      await store.deleteExpiredSessions(now());
      await store.createSession(user.id, sha256(token), new Date(now().getTime() + SESSION_MS));
      return { user, token };
    },

    async authenticate(token: string): Promise<User | undefined> {
      const user = await store.findUserBySession(sha256(token), now());
      return user?.active ? user : undefined;
    },

    logout: (token: string) => store.deleteSession(sha256(token)),

    // Closes every other session of the person and keeps the one in use.
    async changeOwnPassword(user: User, token: string, currentPassword: string, newPassword: string) {
      assertPassword(newPassword);
      if (!(await hasher.verify(user.passwordHash, currentPassword))) {
        throw new AppError(400, "wrong_password", "Current password is wrong");
      }
      if (newPassword === currentPassword) throw new AppError(400, "same_password", "Choose a different password");
      const updated = await store.updateUser(user.id, {
        passwordHash: await hasher.hash(newPassword),
        mustChangePassword: false,
      });
      await store.deleteUserSessions(user.id, sha256(token));
      return updated;
    },

    updateProfile(user: User, patch: { name?: string; soundEnabled?: boolean }) {
      return store.updateUser(user.id, patch);
    },

    async listUsers(actor: Actor) {
      assertCan(actor, "user:list");
      return store.listUsers();
    },

    async createUser(actor: Actor, input: { email: string; name: string; role: Role; password: string }) {
      assertCan(actor, "user:create");
      assertPassword(input.password);
      const email = normalizeEmail(input.email);
      if (await store.findUserByEmail(email)) throw new AppError(409, "email_taken", "Email already in use");
      const user = await store.insertUser({
        email,
        name: input.name.trim(),
        role: input.role,
        passwordHash: await hasher.hash(input.password),
        mustChangePassword: true, // RF-02: the temporary password must be changed at first login
      });
      await store.addAudit({ actorId: actor.id, action: "user.create", target: `user:${user.id}`, payload: { role: user.role } });
      return user;
    },

    // Changes role and/or active state. RN-10: the last active admin cannot be demoted or deactivated.
    async updateUser(actor: Actor, id: number, patch: { role?: Role; active?: boolean }) {
      assertCan(actor, "user:update");
      const target = await getUser(id);
      const role = patch.role ?? target.role;
      const active = patch.active ?? target.active;

      const losesAdmin = target.role === "admin" && target.active && (role !== "admin" || !active);
      // shortcut: two admins demoting each other in the same instant could both pass this check; add a DB lock if that ever matters.
      if (losesAdmin && (await store.countActiveAdmins()) <= 1) {
        throw new AppError(409, "last_admin", "The last active administrator cannot be demoted or deactivated");
      }

      const updated = await store.updateUser(id, { role, active });
      if (role !== target.role) {
        await store.addAudit({ actorId: actor.id, action: "user.change_role", target: `user:${id}`, payload: { from: target.role, to: role } });
      }
      if (active !== target.active) {
        await store.addAudit({ actorId: actor.id, action: active ? "user.activate" : "user.deactivate", target: `user:${id}` });
        if (!active) await store.deleteUserSessions(id);
      }
      return updated;
    },

    async resetPassword(actor: Actor, id: number, password: string) {
      assertCan(actor, "user:reset-password");
      assertPassword(password);
      await getUser(id);
      await store.updateUser(id, { passwordHash: await hasher.hash(password), mustChangePassword: true });
      await store.deleteUserSessions(id);
      await store.addAudit({ actorId: actor.id, action: "user.reset_password", target: `user:${id}` });
    },
  };
}

export type Accounts = ReturnType<typeof createAccounts>;
