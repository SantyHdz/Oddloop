import { describe, expect, it } from "vitest";
import { createAccounts } from "./accounts/service.js";
import { buildApp } from "./app.js";
import { createMemoryStore, fakeHasher } from "./testing/memory-store.js";

const accounts = () => createAccounts(createMemoryStore().store, fakeHasher);

describe("GET /api/health", () => {
  it("returns 200 when the database answers", async () => {
    const app = buildApp({ checkDb: async () => {}, accounts: accounts() });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the database fails", async () => {
    const app = buildApp({
      checkDb: async () => {
        throw new Error("connection refused");
      },
      accounts: accounts(),
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", db: "down" });
  });
});
