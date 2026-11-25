import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { z } from "zod";
import { buildApp } from "./app.js";
import { argon2Hasher } from "./accounts/argon2-hasher.js";
import { ensureInitialAdmin } from "./accounts/seed.js";
import { createAccounts } from "./accounts/service.js";
import { createDrizzleStore } from "./accounts/store.js";
import { createProjects } from "./projects/service.js";
import { createTasks } from "./tasks/service.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(3001),
    ATTACHMENTS_DIR: z.string().default("/data/attachments"),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_NAME: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
  })
  .parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

// Apply pending migrations before accepting requests.
await migrate(db, { migrationsFolder: "drizzle" });

await mkdir(env.ATTACHMENTS_DIR, { recursive: true });

const store = createDrizzleStore(db);
const app = buildApp(
  {
    checkDb: async () => {
      await db.execute(sql`select 1`);
    },
    accounts: createAccounts(store, argon2Hasher),
    projects: createProjects(db),
    tasks: createTasks(db),
    attachmentsDir: env.ATTACHMENTS_DIR,
  },
  true,
);

await ensureInitialAdmin(store, argon2Hasher, env, app.log);

// Orderly shutdown (RNF-20): finish in-flight requests, then close the pool.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: env.PORT, host: "0.0.0.0" });
