import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";

describe("GET /api/health", () => {
  it("returns 200 when the database answers", async () => {
    const app = buildApp(async () => {});
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: "up" });
  });

  it("returns 503 when the database fails", async () => {
    const app = buildApp(async () => {
      throw new Error("connection refused");
    });
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", db: "down" });
  });
});
