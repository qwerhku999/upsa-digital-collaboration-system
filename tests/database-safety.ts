const REQUIRED_TEST_DATABASE = "upsa_collaboration_test";
const ALLOWED_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

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
    host: url.hostname.toLowerCase().replace(/^\[|\]$/g, ""),
    port: url.port || "5432",
  };
}

function assertLocalTestHost(host: string, label = "DATABASE_URL_TEST") {
  if (!ALLOWED_TEST_HOSTS.has(host)) {
    throw new Error(`${label} must use localhost, 127.0.0.1, or ::1.`);
  }
}

/** Protects destructive test fixtures when Vitest has already replaced DATABASE_URL. */
export function assertDedicatedTestDatabase(databaseUrl: string | undefined) {
  if (!databaseUrl) throw new Error("DATABASE_URL must target the dedicated test database before test fixtures can run.");
  const identity = databaseIdentity(databaseUrl, "DATABASE_URL");
  assertLocalTestHost(identity.host, "DATABASE_URL");
  const { database } = identity;
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

  assertLocalTestHost(test.host);
  if (test.database !== REQUIRED_TEST_DATABASE) {
    throw new Error(`Tests may only use the dedicated ${REQUIRED_TEST_DATABASE} database.`);
  }
  const sameHost = test.host === app.host
    || (ALLOWED_TEST_HOSTS.has(test.host) && ALLOWED_TEST_HOSTS.has(app.host));
  if (sameHost && test.port === app.port && test.database === app.database) {
    throw new Error("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
  }
}
