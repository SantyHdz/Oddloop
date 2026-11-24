import { describe, expect, it } from "vitest";
import { createMemoryStore, fakeHasher } from "../testing/memory-store.js";
import { ensureInitialAdmin } from "./seed.js";

const log = { info: () => {}, warn: () => {} };
const env = { ADMIN_EMAIL: " Boss@X.com ", ADMIN_NAME: "Boss", ADMIN_PASSWORD: "temp" };

describe("ensureInitialAdmin (REQUISITOS 9.2)", () => {
  it("creates the admin with a temporary password when none exists", async () => {
    const mem = createMemoryStore();
    await ensureInitialAdmin(mem.store, fakeHasher, env, log);
    expect(mem.users).toHaveLength(1);
    expect(mem.users[0]).toMatchObject({ email: "boss@x.com", role: "admin", mustChangePassword: true });
  });

  it("does nothing when an admin already exists", async () => {
    const mem = createMemoryStore();
    await ensureInitialAdmin(mem.store, fakeHasher, env, log);
    await ensureInitialAdmin(mem.store, fakeHasher, { ...env, ADMIN_EMAIL: "other@x.com" }, log);
    expect(mem.users).toHaveLength(1);
  });

  it("does nothing when the variables are missing", async () => {
    const mem = createMemoryStore();
    await ensureInitialAdmin(mem.store, fakeHasher, {}, log);
    expect(mem.users).toHaveLength(0);
  });
});
