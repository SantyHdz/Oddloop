import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { Accounts } from "./accounts/service.js";
import { AppError } from "./errors.js";
import { registerRoutes } from "./routes.js";

// Receives the DB check as a function so the route can be tested without a database.
export type DbCheck = () => Promise<void>;

export function buildApp(deps: { checkDb: DbCheck; accounts: Accounts }, logger = false) {
  const app = Fastify({ logger });
  app.register(cookie);

  // Every error leaves as { error: { code, message } }; the frontend translates the code.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.status).send({ error: { code: error.code, message: error.message } });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: { code: "invalid_input", message: "Invalid input" } });
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({ error: { code: status >= 500 ? "internal_error" : "bad_request", message: "Request failed" } });
  });

  app.get("/api/health", async (_request, reply) => {
    try {
      await deps.checkDb();
      return { status: "ok", db: "up" };
    } catch (error) {
      app.log.error(error, "database check failed");
      return reply.code(503).send({ status: "error", db: "down" });
    }
  });

  registerRoutes(app, deps.accounts);
  return app;
}
