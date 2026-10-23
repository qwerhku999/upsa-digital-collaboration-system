import { execSync } from "node:child_process";
import { loadEnv } from "vite";
import { assertSafeTestDatabase } from "./database-safety";

export default function setup() {
  const env = loadEnv("test", process.cwd(), "");
  const testUrl = env.DATABASE_URL_TEST;
  assertSafeTestDatabase(testUrl, env.DATABASE_URL);
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: testUrl } });
}
