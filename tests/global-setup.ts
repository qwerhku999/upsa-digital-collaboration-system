import { execSync } from "node:child_process";
import { loadEnv } from "vite";

export default function setup() {
  const url = loadEnv("test", process.cwd(), "").DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set in .env (see .env.example).");
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error("DATABASE_URL_TEST must point to a database whose name contains 'test' (it is wiped by tests).");
  }
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
