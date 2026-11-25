import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { ZodError } from "zod";
import type { Accounts } from "./accounts/service.js";
import { createRequireAuth } from "./auth/hook.js";
import { AppError } from "./errors.js";
import { registerProjectRoutes } from "./projects/routes.js";
import type { Projects } from "./projects/service.js";
import { registerRoutes } from "./routes.js";
import { MAX_ATTACHMENT_BYTES, registerTaskRoutes } from "./tasks/routes.js";
import type { TasksService } from "./tasks/service.js";

// Receives the DB check as a function so the route can be tested without a database.
export type DbCheck = () => Promise<void>;

export interface AppDeps {
  checkDb: DbCheck;
  accounts: Accounts;
  projects: Projects;
  tasks: TasksService;
  attachmentsDir: string;
}

export function buildApp(deps: AppDeps, logger = false) {
  const app = Fastify({ logger });
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 } });

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

  const requireAuth = createRequireAuth(deps.accounts);
  registerRoutes(app, deps.accounts, requireAuth);
  registerProjectRoutes(app, requireAuth, deps.projects);
  registerTaskRoutes(app, requireAuth, deps.tasks, deps.attachmentsDir);
  return app;
}
