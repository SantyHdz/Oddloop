import { AppError } from "../errors.js";
import type { AuditEntry, Hasher, Store, User } from "../accounts/types.js";

// Test-only helpers: an in-memory Store and a fake Hasher (no argon2 cost in tests).
export const fakeHasher: Hasher = {
  hash: async (password) => `hashed:${password}`,
  verify: async (hash, password) => hash === `hashed:${password}`,
};

export function createMemoryStore() {
  const users: User[] = [];
  const sessions: { userId: number; tokenHash: string; expiresAt: Date }[] = [];
  const audit: AuditEntry[] = [];
  let nextId = 1;

  // Return copies, like a real database does, so callers never share state with the store.
  const copy = (u: User | undefined) => (u ? { ...u } : undefined);

  const must = (id: number) => {
    const user = users.find((u) => u.id === id);
    if (!user) throw new Error(`no user ${id}`);
    return user;
  };

  const store: Store = {
    findUserById: async (id) => copy(users.find((u) => u.id === id)),
    findUserByEmail: async (email) => copy(users.find((u) => u.email === email)),
    listUsers: async () => users.map((u) => ({ ...u })),
    countActiveAdmins: async () => users.filter((u) => u.role === "admin" && u.active).length,
    insertUser: async (data) => {
      if (users.some((u) => u.email === data.email)) throw new AppError(409, "email_taken", "Email already in use");
      const now = new Date();
      const user: User = { ...data, id: nextId++, active: true, soundEnabled: true, createdAt: now, updatedAt: now };
      users.push(user);
      return { ...user };
    },
    updateUser: async (id, patch) => ({ ...Object.assign(must(id), patch, { updatedAt: new Date() }) }),
    createSession: async (userId, tokenHash, expiresAt) => void sessions.push({ userId, tokenHash, expiresAt }),
    findUserBySession: async (tokenHash, now) => {
      const s = sessions.find((x) => x.tokenHash === tokenHash && x.expiresAt > now);
      return s && copy(users.find((u) => u.id === s.userId));
    },
    deleteSession: async (tokenHash) => {
      const i = sessions.findIndex((s) => s.tokenHash === tokenHash);
      if (i >= 0) sessions.splice(i, 1);
    },
    deleteUserSessions: async (userId, except) => {
      for (let i = sessions.length - 1; i >= 0; i--) {
        const s = sessions[i]!;
        if (s.userId === userId && s.tokenHash !== except) sessions.splice(i, 1);
      }
    },
    deleteExpiredSessions: async (now) => {
      for (let i = sessions.length - 1; i >= 0; i--) if (sessions[i]!.expiresAt <= now) sessions.splice(i, 1);
    },
    addAudit: async (entry) => void audit.push(entry),
  };

  return { store, users, sessions, audit };
}
