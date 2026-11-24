import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryStore, fakeHasher } from "../testing/memory-store.js";
import { createAccounts } from "./service.js";
import type { Role, User } from "./types.js";

let clock: Date;
let mem: ReturnType<typeof createMemoryStore>;
let accounts: ReturnType<typeof createAccounts>;

async function addUser(role: Role, email: string, password = "pw") {
  return mem.store.insertUser({ email, name: email, role, passwordHash: `hashed:${password}`, mustChangePassword: false });
}

const fails = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code });

beforeEach(() => {
  clock = new Date("2026-01-01T00:00:00Z");
  mem = createMemoryStore();
  accounts = createAccounts(mem.store, fakeHasher, () => clock);
});

describe("login and sessions (RF-01)", () => {
  it("logs in, authenticates by token and logs out", async () => {
    const admin = await addUser("admin", "a@x.com");
    const { token } = await accounts.login(" A@X.com ", "pw"); // email is trimmed and lowercased
    expect((await accounts.authenticate(token))?.id).toBe(admin.id);
    await accounts.logout(token);
    expect(await accounts.authenticate(token)).toBeUndefined();
  });

  it("gives the same error for wrong password, unknown email and deactivated user", async () => {
    await addUser("admin", "a@x.com");
    const gone = await addUser("member", "gone@x.com");
    await accounts.updateUser((await mem.store.findUserByEmail("a@x.com"))!, gone.id, { active: false });
    await fails(accounts.login("a@x.com", "bad"), "invalid_credentials");
    await fails(accounts.login("nobody@x.com", "pw"), "invalid_credentials");
    await fails(accounts.login("gone@x.com", "pw"), "invalid_credentials");
  });

  it("expires the session after 7 days", async () => {
    await addUser("admin", "a@x.com");
    const { token } = await accounts.login("a@x.com", "pw");
    clock = new Date("2026-01-07T23:59:00Z");
    expect(await accounts.authenticate(token)).toBeDefined();
    clock = new Date("2026-01-08T00:01:00Z");
    expect(await accounts.authenticate(token)).toBeUndefined();
  });
});

describe("account management", () => {
  let admin: User;
  beforeEach(async () => {
    admin = await addUser("admin", "admin@x.com");
  });

  it("admin creates a user with a temporary password and an audit entry (RF-02)", async () => {
    const user = await accounts.createUser(admin, { email: "New@X.com", name: " Ana ", role: "member", password: "temp" });
    expect(user).toMatchObject({ email: "new@x.com", name: "Ana", mustChangePassword: true });
    expect(user.passwordHash).not.toBe("temp"); // never stored in plain text
    expect(mem.audit.map((a) => a.action)).toEqual(["user.create"]);
  });

  it("leader and member cannot manage accounts", async () => {
    const leader = await addUser("leader", "l@x.com");
    const member = await addUser("member", "m@x.com");
    for (const actor of [leader, member]) {
      await fails(accounts.listUsers(actor), "forbidden");
      await fails(accounts.createUser(actor, { email: "z@x.com", name: "Z", role: "member", password: "p" }), "forbidden");
      await fails(accounts.updateUser(actor, admin.id, { role: "member" }), "forbidden");
      await fails(accounts.resetPassword(actor, admin.id, "p"), "forbidden");
    }
  });

  it("rejects a duplicate email and an empty password", async () => {
    await fails(accounts.createUser(admin, { email: "ADMIN@x.com", name: "D", role: "member", password: "p" }), "email_taken");
    await fails(accounts.createUser(admin, { email: "e@x.com", name: "E", role: "member", password: "" }), "invalid_password");
  });

  it("accepts any non-empty password, even a short one", async () => {
    await expect(accounts.createUser(admin, { email: "e@x.com", name: "E", role: "member", password: "a" })).resolves.toBeDefined();
  });

  it("changes a role and records who and what changed (RF-03)", async () => {
    const member = await addUser("member", "m@x.com");
    await accounts.updateUser(admin, member.id, { role: "leader" });
    expect((await mem.store.findUserById(member.id))?.role).toBe("leader");
    expect(mem.audit.at(-1)).toMatchObject({ action: "user.change_role", payload: { from: "member", to: "leader" } });
  });

  it("deactivating closes sessions, blocks login and keeps the user (RF-04)", async () => {
    const member = await addUser("member", "m@x.com");
    const { token } = await accounts.login("m@x.com", "pw");
    await accounts.updateUser(admin, member.id, { active: false });
    expect(await accounts.authenticate(token)).toBeUndefined();
    await fails(accounts.login("m@x.com", "pw"), "invalid_credentials");
    expect(await mem.store.findUserById(member.id)).toBeDefined();
    expect(mem.audit.at(-1)?.action).toBe("user.deactivate");
  });

  it("reset password forces a change and closes the person's sessions", async () => {
    const member = await addUser("member", "m@x.com");
    const { token } = await accounts.login("m@x.com", "pw");
    await accounts.resetPassword(admin, member.id, "new-temp");
    expect(await accounts.authenticate(token)).toBeUndefined();
    const again = await accounts.login("m@x.com", "new-temp");
    expect(again.user.mustChangePassword).toBe(true);
  });
});

describe("last administrator (RN-10)", () => {
  it("cannot be demoted or deactivated", async () => {
    const admin = await addUser("admin", "a@x.com");
    await fails(accounts.updateUser(admin, admin.id, { role: "leader" }), "last_admin");
    await fails(accounts.updateUser(admin, admin.id, { active: false }), "last_admin");
    expect((await mem.store.findUserById(admin.id))?.role).toBe("admin");
  });

  it("can be demoted once another active admin exists", async () => {
    const first = await addUser("admin", "a@x.com");
    await addUser("admin", "b@x.com");
    await accounts.updateUser(first, first.id, { role: "member" });
    expect((await mem.store.findUserById(first.id))?.role).toBe("member");
  });

  it("a deactivated admin does not count as another admin", async () => {
    const a = await addUser("admin", "a@x.com");
    const b = await addUser("admin", "b@x.com");
    await accounts.updateUser(a, b.id, { active: false });
    await fails(accounts.updateUser(a, a.id, { role: "member" }), "last_admin");
  });
});

describe("own password change", () => {
  it("clears the temporary flag, keeps this session and closes the others", async () => {
    const user = await mem.store.insertUser({ email: "m@x.com", name: "M", role: "member", passwordHash: "hashed:temp", mustChangePassword: true });
    const first = await accounts.login("m@x.com", "temp");
    const other = await accounts.login("m@x.com", "temp");
    const updated = await accounts.changeOwnPassword(user, first.token, "temp", "mine");
    expect(updated.mustChangePassword).toBe(false);
    expect(await accounts.authenticate(first.token)).toBeDefined();
    expect(await accounts.authenticate(other.token)).toBeUndefined();
    await expect(accounts.login("m@x.com", "mine")).resolves.toBeDefined();
  });

  it("requires the current password and a different new one", async () => {
    const user = await addUser("member", "m@x.com", "old");
    const { token } = await accounts.login("m@x.com", "old");
    await fails(accounts.changeOwnPassword(user, token, "wrong", "new"), "wrong_password");
    await fails(accounts.changeOwnPassword(user, token, "old", "old"), "same_password");
    await fails(accounts.changeOwnPassword(user, token, "old", ""), "invalid_password");
  });
});
