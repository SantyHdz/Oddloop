import type { Hasher, Store } from "./types.js";

// REQUISITOS 9.2: creates the first administrator from env variables, only if no admin exists.
export async function ensureInitialAdmin(
  store: Store,
  hasher: Hasher,
  env: { ADMIN_EMAIL?: string; ADMIN_NAME?: string; ADMIN_PASSWORD?: string },
  log: { info(msg: string): void; warn(msg: string): void },
) {
  if ((await store.countActiveAdmins()) > 0) return;

  const { ADMIN_EMAIL: email, ADMIN_NAME: name, ADMIN_PASSWORD: password } = env;
  if (!email || !name || !password) {
    log.warn("No administrator exists and ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD are not all set");
    return;
  }
  const normalized = email.trim().toLowerCase();
  if (await store.findUserByEmail(normalized)) {
    log.warn("No administrator exists but ADMIN_EMAIL belongs to a non-admin user; not changing it");
    return;
  }
  await store.insertUser({
    email: normalized,
    name,
    role: "admin",
    passwordHash: await hasher.hash(password),
    mustChangePassword: true,
  });
  log.info("Initial administrator created");
}
