import { beforeEach, describe, expect, it } from "vitest";
import { createAccounts } from "./accounts/service.js";
import type { Role } from "./accounts/types.js";
import { buildApp } from "./app.js";
import { createMemoryStore, fakeHasher } from "./testing/memory-store.js";

let mem: ReturnType<typeof createMemoryStore>;
let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  mem = createMemoryStore();
  app = buildApp({ checkDb: async () => {}, accounts: createAccounts(mem.store, fakeHasher) });
});

const addUser = (role: Role, email: string, mustChangePassword = false) =>
  mem.store.insertUser({ email, name: email, role, passwordHash: "hashed:pw", mustChangePassword });

async function login(email: string, password = "pw") {
  const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  const cookie = String(res.headers["set-cookie"] ?? "").split(";")[0] ?? "";
  return { res, cookie };
}

const call = (method: "GET" | "POST" | "PATCH", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: { cookie }, payload });

describe("login", () => {
  it("sets an httpOnly, SameSite=Lax cookie and never returns the hash", async () => {
    await addUser("admin", "a@x.com");
    const { res } = await login("a@x.com");
    expect(res.statusCode).toBe(200);
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(setCookie).not.toMatch(/Secure/i);
    expect(JSON.stringify(res.json())).not.toContain("hashed");
  });

  it("answers 401 invalid_credentials for a wrong password", async () => {
    await addUser("admin", "a@x.com");
    const { res } = await login("a@x.com", "nope");
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("invalid_credentials");
  });

  it("answers 400 for malformed input", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "not-an-email", password: "" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_input");
  });
});

describe("protected routes", () => {
  it("returns 401 without a session cookie", async () => {
    for (const url of ["/api/me", "/api/users"]) {
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    }
  });

  it("GET /api/users: admin 200, leader and member 403 (RNF-08)", async () => {
    await addUser("admin", "a@x.com");
    await addUser("leader", "l@x.com");
    await addUser("member", "m@x.com");
    expect((await call("GET", "/api/users", (await login("a@x.com")).cookie)).statusCode).toBe(200);
    expect((await call("GET", "/api/users", (await login("l@x.com")).cookie)).statusCode).toBe(403);
    expect((await call("GET", "/api/users", (await login("m@x.com")).cookie)).statusCode).toBe(403);
  });

  it("a member cannot create users or change roles", async () => {
    const admin = await addUser("admin", "a@x.com");
    await addUser("member", "m@x.com");
    const { cookie } = await login("m@x.com");
    const create = await call("POST", "/api/users", cookie, { email: "z@x.com", name: "Z", role: "admin", password: "p" });
    expect(create.statusCode).toBe(403);
    expect((await call("PATCH", `/api/users/${admin.id}`, cookie, { role: "member" })).statusCode).toBe(403);
  });

  it("admin creates a user (201) and the last admin cannot be deactivated (409)", async () => {
    const admin = await addUser("admin", "a@x.com");
    const { cookie } = await login("a@x.com");
    const created = await call("POST", "/api/users", cookie, { email: "n@x.com", name: "N", role: "member", password: "tmp" });
    expect(created.statusCode).toBe(201);
    const blocked = await call("PATCH", `/api/users/${admin.id}`, cookie, { active: false });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe("last_admin");
  });
});

describe("temporary password", () => {
  it("blocks everything except changing the password until it is changed (RF-02)", async () => {
    await addUser("admin", "a@x.com", true);
    const { cookie } = await login("a@x.com");
    expect((await call("GET", "/api/me", cookie)).statusCode).toBe(200);
    const blocked = await call("GET", "/api/users", cookie);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("password_change_required");

    const changed = await call("POST", "/api/me/password", cookie, { currentPassword: "pw", newPassword: "mine" });
    expect(changed.statusCode).toBe(200);
    expect((await call("GET", "/api/users", cookie)).statusCode).toBe(200);
  });
});

describe("logout", () => {
  it("invalidates the session", async () => {
    await addUser("member", "m@x.com");
    const { cookie } = await login("m@x.com");
    expect((await call("POST", "/api/auth/logout", cookie)).statusCode).toBe(204);
    expect((await call("GET", "/api/me", cookie)).statusCode).toBe(401);
  });
});
