import { afterAll, describe, expect, it } from "vitest";
import { createTestApp } from "./testing/test-app.js";

const apps: Awaited<ReturnType<typeof createTestApp>>[] = [];
afterAll(() => Promise.all(apps.map((a) => a.close())));

async function appWith(checkDb: () => Promise<void>) {
  const a = await createTestApp(checkDb);
  apps.push(a);
  return a.app;
}

describe("GET /api/health", () => {
  it("returns 200 when the database answers", async () => {
    const app = await appWith(async () => {});
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the database fails", async () => {
    const app = await appWith(async () => {
      throw new Error("connection refused");
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", db: "down" });
  });
});
