import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Temporary table to prove data survives `docker compose down` / `up` (stage 1).
// Replaced by the real tables in stage 2.
export const smokeTest = pgTable("smoke_test", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  note: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
