import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
  globalIgnores(["dist", "drizzle"]),
  js.configs.recommended,
  tseslint.configs.recommended,
);
