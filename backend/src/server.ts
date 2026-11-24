import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import pg from "pg";
import { z } from "zod";
import { buildApp } from "./app.js";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    PORT: z.coerce.number().default(3001),
  })
  .parse(process.env);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

// Apply pending migrations before accepting requests.
await migrate(db, { migrationsFolder: "drizzle" });

const app = buildApp(async () => {
  await db.execute(sql`select 1`);
}, true);

// Orderly shutdown (RNF-20): finish in-flight requests, then close the pool.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
}

await app.listen({ port: env.PORT, host: "0.0.0.0" });
