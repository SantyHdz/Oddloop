import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Role, User } from "../accounts/types.js";
import { users } from "../db/schema.js";
import type { Db } from "../db/types.js";

// A real PostgreSQL running inside Node (PGlite), with the project's real migrations applied.
// Starting it takes a few seconds, so each test file starts one and `reset()` empties it between tests.
export async function createTestDb() {
  const client = new PGlite();
  const pg = drizzle(client);
  await migrate(pg, { migrationsFolder: "drizzle" });
  // Same query methods as the production driver; only the type name differs.
  const db = pg as unknown as Db;

  const reset = async () => {
    await client.exec(
      `truncate table task_events, attachments, comment_mentions, comments, task_links, task_labels, tasks,
       labels, workflow_states, project_members, projects, audit_log, sessions, users restart identity cascade`,
    );
  };

  return { db, reset, close: () => client.close() };
}

let counter = 0;
export async function makeUser(db: Db, role: Role, name = `${role}${++counter}`): Promise<User> {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase()}@test.com`, name, role, passwordHash: "hashed:pw", mustChangePassword: false })
    .returning();
  return user!;
}
