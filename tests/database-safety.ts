const REQUIRED_TEST_DATABASE = "upsa_collaboration_test";

function databaseIdentity(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid PostgreSQL connection URL.`);
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${label} must use PostgreSQL.`);
  }

  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error(`${label} must specify a database name.`);

  return {
    database,
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
  };
}

/** Protects destructive test fixtures when Vitest has already replaced DATABASE_URL. */
export function assertDedicatedTestDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL must target the dedicated test database before test fixtures can run.");
  const database = databaseIdentity(databaseUrl, "DATABASE_URL").database;
  if (database !== REQUIRED_TEST_DATABASE) {
    throw new Error(`Test fixtures may only modify the dedicated ${REQUIRED_TEST_DATABASE} database.`);
  }
}

/** Fails closed unless tests target the dedicated database, separate from the app database. */
export function assertSafeTestDatabase(testUrl: string | undefined, appUrl: string | undefined) {
  if (!testUrl || !appUrl) {
    throw new Error("Both DATABASE_URL and DATABASE_URL_TEST must be configured before tests can run.");
  }

  const test = databaseIdentity(testUrl, "DATABASE_URL_TEST");
  const app = databaseIdentity(appUrl, "DATABASE_URL");

  if (test.database !== REQUIRED_TEST_DATABASE) {
    throw new Error(`Tests may only use the dedicated ${REQUIRED_TEST_DATABASE} database.`);
  }
  if (test.host === app.host && test.port === app.port && test.database === app.database) {
    throw new Error("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
  }
}
