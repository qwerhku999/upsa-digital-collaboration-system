import { describe, expect, it } from "vitest";
import { assertDedicatedTestDatabase, assertSafeTestDatabase } from "./database-safety";

describe("test database safety", () => {
  const testUrl = "postgresql://test:test@localhost:5432/upsa_collaboration_test?schema=public";
  const appUrl = "postgresql://app:app@localhost:5432/upsa_collaboration?schema=public";

  it("allows the dedicated test database when it is separate from the application database", () => {
    expect(() => assertSafeTestDatabase(testUrl, appUrl)).not.toThrow();
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("allows loopback host %s", (host) => {
    const url = `postgresql://test:test@${host}:5432/upsa_collaboration_test`;
    expect(() => assertSafeTestDatabase(url, appUrl)).not.toThrow();
    expect(() => assertDedicatedTestDatabase(url)).not.toThrow();
  });

  it("rejects the application database as the test target", () => {
    expect(() => assertSafeTestDatabase(
      "postgresql://app:app@localhost:5432/upsa_collaboration",
      "postgresql://app:app@localhost:5432/upsa_collaboration",
    )).toThrow("Tests may only use the dedicated upsa_collaboration_test database.");
  });

  it("rejects the same database reached through different credentials", () => {
    expect(() => assertSafeTestDatabase(
      testUrl,
      "postgresql://different:different@localhost:5432/upsa_collaboration_test?schema=public",
    )).toThrow("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
  });

  it("rejects the same loopback database through different host aliases", () => {
    expect(() => assertSafeTestDatabase(
      "postgresql://localhost:5432/upsa_collaboration_test",
      "postgresql://127.0.0.1:5432/upsa_collaboration_test",
    )).toThrow("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
    expect(() => assertSafeTestDatabase(
      "postgresql://[::1]:5432/upsa_collaboration_test",
      "postgresql://localhost:5432/upsa_collaboration_test",
    )).toThrow("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
  });

  it("rejects remote test hosts before migrations or fixture resets", () => {
    const remoteUrl = "postgresql://test:test@db.example.net:5432/upsa_collaboration_test";
    expect(() => assertSafeTestDatabase(remoteUrl, appUrl)).toThrow(
      "DATABASE_URL_TEST must use localhost, 127.0.0.1, or ::1.",
    );
    expect(() => assertDedicatedTestDatabase(remoteUrl)).toThrow(
      "DATABASE_URL must use localhost, 127.0.0.1, or ::1.",
    );
  });

  it.each([
    ["malformed", "not-a-url"],
    ["unexpected protocol", "https://localhost/upsa_collaboration_test"],
    ["missing database name", "postgresql://test:test@localhost:5432"],
  ])("rejects %s test URLs", (_label, url) => {
    expect(() => assertSafeTestDatabase(url, appUrl)).toThrow();
    expect(() => assertDedicatedTestDatabase(url)).toThrow();
  });

  it("rejects missing test configuration", () => {
    expect(() => assertSafeTestDatabase(undefined, appUrl)).toThrow(
      "Both DATABASE_URL and DATABASE_URL_TEST must be configured before tests can run.",
    );
    expect(() => assertDedicatedTestDatabase(undefined)).toThrow(
      "DATABASE_URL must target the dedicated test database before test fixtures can run.",
    );
  });

  it("allows fixture resets only for the local dedicated test database", () => {
    expect(() => assertDedicatedTestDatabase(testUrl)).not.toThrow();
    expect(() => assertDedicatedTestDatabase(
      "postgresql://test:test@localhost:5432/upsa_collaboration",
    )).toThrow("Test fixtures may only modify the dedicated upsa_collaboration_test database.");
  });
});
