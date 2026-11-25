import { defineConfig } from "vitest/config";

export default defineConfig({
  // PGlite (real PostgreSQL in WebAssembly) needs a few seconds to start the first time.
  test: { testTimeout: 30_000, hookTimeout: 90_000 },
});
