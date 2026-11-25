import { and, count, eq, gt, lt, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError } from "../errors.js";
import { isUniqueViolation } from "../db/types.js";
import { auditLog, sessions, users } from "../db/schema.js";
import type { Store } from "./types.js";

export function createDrizzleStore(db: NodePgDatabase): Store {
  return {
    async findUserById(id) {
      return (await db.select().from(users).where(eq(users.id, id)))[0];
    },
    async findUserByEmail(email) {
      return (await db.select().from(users).where(eq(users.email, email)))[0];
    },
    listUsers: () => db.select().from(users).orderBy(users.name),
    async countActiveAdmins() {
      const [row] = await db
        .select({ n: count() })
        .from(users)
        .where(and(eq(users.role, "admin"), eq(users.active, true)));
      return row?.n ?? 0;
    },
    async insertUser(data) {
      try {
        const [row] = await db.insert(users).values(data).returning();
        return row!;
      } catch (error) {
        // Backstop for two accounts being created with the same email at the same time.
        if (isUniqueViolation(error)) throw new AppError(409, "email_taken", "Email already in use");
        throw error;
      }
    },
    async updateUser(id, patch) {
      const [row] = await db
        .update(users)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning();
      return row!;
    },
    async createSession(userId, tokenHash, expiresAt) {
      await db.insert(sessions).values({ userId, tokenHash, expiresAt });
    },
    async findUserBySession(tokenHash, now) {
      const rows = await db
        .select({ user: users })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)));
      return rows[0]?.user;
    },
    async deleteSession(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async deleteUserSessions(userId, exceptTokenHash) {
      await db
        .delete(sessions)
        .where(and(eq(sessions.userId, userId), exceptTokenHash ? ne(sessions.tokenHash, exceptTokenHash) : undefined));
    },
    async deleteExpiredSessions(now) {
      await db.delete(sessions).where(lt(sessions.expiresAt, now));
    },
    async addAudit(entry) {
      await db.insert(auditLog).values(entry);
    },
  };
}
