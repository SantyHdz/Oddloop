import Fastify from "fastify";

// Receives the DB check as a function so the route can be tested without a database.
export type DbCheck = () => Promise<void>;

export function buildApp(checkDb: DbCheck, logger = false) {
  const app = Fastify({ logger });

  app.get("/api/health", async (_request, reply) => {
    try {
      await checkDb();
      return { status: "ok", db: "up" };
    } catch (error) {
      app.log.error(error, "database check failed");
      return reply.code(503).send({ status: "error", db: "down" });
    }
  });

  return app;
}
