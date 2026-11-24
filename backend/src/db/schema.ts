import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// Temporary table that proved data survives `docker compose down` / `up` (stage 1).
export const smokeTest = pgTable("smoke_test", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  note: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const roleEnum = pgEnum("role", ["admin", "leader", "member"]);

export const users = pgTable("users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(),
  name: text().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum().notNull(),
  active: boolean().notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable("sessions", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  // Only the SHA-256 of the token is stored: a leaked table cannot be used to log in.
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const auditLog = pgTable("audit_log", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  actorId: integer("actor_id").references(() => users.id),
  action: text().notNull(),
  target: text().notNull(),
  payload: jsonb(),
  ...timestamps,
});
