import { describe, expect, it } from "vitest";
import { assertDedicatedTestDatabase, assertSafeTestDatabase } from "./database-safety";

describe("test database safety", () => {
  const testUrl = "postgresql://test:test@localhost:5432/upsa_collaboration_test?schema=public";

  it("allows the dedicated test database when it is separate from the application database", () => {
    expect(() => assertSafeTestDatabase(
      testUrl,
      "postgresql://app:app@localhost:5432/upsa_collaboration?schema=public",
    )).not.toThrow();
  });

  it("rejects the application database as the test target", () => {
    expect(() => assertSafeTestDatabase(
      "postgresql://app:app@localhost:5432/upsa_collaboration?schema=public",
      "postgresql://app:app@localhost:5432/upsa_collaboration?schema=public",
    )).toThrow("Tests may only use the dedicated upsa_collaboration_test database.");
  });

  it("rejects the same database reached through different credentials", () => {
    expect(() => assertSafeTestDatabase(
      testUrl,
      "postgresql://another:credential@localhost:5432/upsa_collaboration_test?schema=public",
    )).toThrow("DATABASE_URL_TEST must target a different database from DATABASE_URL.");
  });

  it("allows fixtures only when Prisma is configured for the dedicated test database", () => {
    expect(() => assertDedicatedTestDatabase(testUrl)).not.toThrow();
    expect(() => assertDedicatedTestDatabase(
      "postgresql://app:app@localhost:5432/upsa_collaboration",
    )).toThrow("Test fixtures may only modify the dedicated upsa_collaboration_test database.");
  });
});
