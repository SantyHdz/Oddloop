import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type Db = NodePgDatabase;
// Inside db.transaction(...) the callback receives a transaction, which has the same query methods.
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

// Drizzle wraps the driver error, so look for the PostgreSQL code in both places.
export function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}
