import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parse } from "dotenv";

const APP_DATABASE = "upsa_collaboration";
const TEST_DATABASE = "upsa_collaboration_test";
const DEMO_DATABASE = "upsa_collaboration_demo";
const DEMO_PORT = "3002";

function identity(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is missing from .env.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} in .env is not a valid database URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${name} in .env must use PostgreSQL.`);
  }
  return {
    url,
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

async function main() {
  const env = parse(readFileSync(resolve(".env")));
  const app = identity(env.DATABASE_URL, "DATABASE_URL");
  const test = identity(env.DATABASE_URL_TEST, "DATABASE_URL_TEST");

  if (app.database !== APP_DATABASE || test.database !== TEST_DATABASE) {
    throw new Error("Demo startup requires the expected separate app and test database names in .env.");
  }
  if (app.host !== "localhost" || test.host !== app.host || test.port !== app.port) {
    throw new Error("Demo startup is restricted to the configured local PostgreSQL server.");
  }

  const demoUrl = new URL(app.url);
  demoUrl.pathname = `/${DEMO_DATABASE}`;
  const demo = new PrismaClient({ datasources: { db: { url: demoUrl.toString() } } });
  let connectedDatabase: string;
  try {
    const rows = await demo.$queryRaw<{ database: string }[]>`SELECT current_database() AS database`;
    connectedDatabase = rows[0]?.database ?? "";
  } finally {
    await demo.$disconnect();
  }
  if (connectedDatabase !== DEMO_DATABASE) {
    throw new Error("Demo database identity check failed; refusing to start.");
  }

  console.log(`Starting demo app on http://127.0.0.1:${DEMO_PORT} using ${DEMO_DATABASE}.`);
  const child = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", DEMO_PORT],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: demoUrl.toString() },
      stdio: "inherit",
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("error", (error) => {
    console.error(`Could not start the demo app: ${error.message}`);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not verify the demo database.");
  process.exitCode = 1;
});
