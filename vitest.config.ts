import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { assertSafeTestDatabase } from "./tests/database-safety";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  assertSafeTestDatabase(env.DATABASE_URL_TEST, env.DATABASE_URL);
  return {
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    test: {
      include: ["tests/**/*.test.ts"],
      environment: "node",
      env: { ...env, DATABASE_URL: env.DATABASE_URL_TEST },
      globalSetup: ["tests/global-setup.ts"],
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  };
});
