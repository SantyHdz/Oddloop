import type { users } from "../db/schema.js";

export type User = typeof users.$inferSelect;
export type Role = User["role"];
export const roles = ["admin", "leader", "member"] as const satisfies readonly Role[];

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuditEntry {
  actorId: number | null;
  action: string;
  target: string;
  payload?: unknown;
}

export interface Hasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

// Everything the business rules need from storage. The real one uses PostgreSQL,
// tests use an in-memory copy, so the rules never depend on HTTP or on a database.
export interface Store {
  findUserById(id: number): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  listUsers(): Promise<User[]>;
  countActiveAdmins(): Promise<number>;
  insertUser(data: NewUser): Promise<User>;
  updateUser(
    id: number,
    patch: Partial<Pick<User, "name" | "role" | "active" | "passwordHash" | "mustChangePassword" | "soundEnabled">>,
  ): Promise<User>;
  createSession(userId: number, tokenHash: string, expiresAt: Date): Promise<void>;
  findUserBySession(tokenHash: string, now: Date): Promise<User | undefined>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteUserSessions(userId: number, exceptTokenHash?: string): Promise<void>;
  deleteExpiredSessions(now: Date): Promise<void>;
  addAudit(entry: AuditEntry): Promise<void>;
}
