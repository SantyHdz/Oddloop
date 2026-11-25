import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAccounts } from "../accounts/service.js";
import { createDrizzleStore } from "../accounts/store.js";
import { buildApp, type DbCheck } from "../app.js";
import { createProjects } from "../projects/service.js";
import { createTasks } from "../tasks/service.js";
import { fakeHasher } from "./memory-store.js";
import { createTestDb } from "./test-db.js";

// The whole application (routes, services, real PostgreSQL via PGlite) with a fake password hasher
// and a throw-away folder for attachments.
export async function createTestApp(checkDb: DbCheck = async () => {}) {
  const t = await createTestDb();
  const store = createDrizzleStore(t.db);
  const attachmentsDir = await mkdtemp(path.join(tmpdir(), "oddloop-att-"));
  const app = buildApp({
    checkDb,
    accounts: createAccounts(store, fakeHasher),
    projects: createProjects(t.db),
    tasks: createTasks(t.db),
    attachmentsDir,
  });
  return {
    app,
    store,
    db: t.db,
    // Empty the database and the attachments folder between tests.
    reset: async () => {
      await t.reset();
      await rm(attachmentsDir, { recursive: true, force: true });
      await mkdir(attachmentsDir);
    },
    attachmentsDir,
    close: async () => {
      await app.close();
      await t.close();
      await rm(attachmentsDir, { recursive: true, force: true });
    },
  };
}
