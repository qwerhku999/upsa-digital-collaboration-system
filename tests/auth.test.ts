import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionRecord, deleteSessionByToken, deleteUserSessions, findSessionUser } from "@/lib/session-store";
import { authenticate, changePassword, registerStudent } from "@/server/services/auth";
import { PASSWORD, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("registration", () => {
  it("creates a STUDENT with a hashed password", async () => {
    const u = await registerStudent({ name: "Ama Mensah", email: "Ama@Test.Example", password: "Strong-pass-1" });
    expect(u.role).toBe("STUDENT");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.email).toBe("ama@test.example");
    expect(row.passwordHash).not.toContain("Strong-pass-1");
    expect(row.passwordHash.startsWith("$2")).toBe(true);
  });
  it("cannot be used to become an administrator", async () => {
    const u = await registerStudent({ name: "Eve Evil", email: "eve@test.example", password: "Strong-pass-1", role: "ADMIN" });
    expect(u.role).toBe("STUDENT");
  });
  it("rejects duplicate emails, weak passwords and bad input", async () => {
    await registerStudent({ name: "Ama Mensah", email: "ama@test.example", password: "Strong-pass-1" });
    await expect(registerStudent({ name: "Other", email: "AMA@test.example", password: "Strong-pass-1" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(registerStudent({ name: "X Y", email: "x@test.example", password: "weak" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(registerStudent({ name: "X Y", email: "not-an-email", password: "Strong-pass-1" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("login", () => {
  it("signs in with correct credentials", async () => {
    const u = await makeUser("STUDENT");
    expect((await authenticate({ email: u.email.toUpperCase(), password: PASSWORD })).id).toBe(u.id);
  });
  it("gives the same error for wrong password, unknown email and deactivated users", async () => {
    const u = await makeUser("STUDENT");
    const off = await makeUser("STUDENT", "Inactive", { active: false });
    const errs = await Promise.all([
      authenticate({ email: u.email, password: "Wrong-password-1" }).catch((e) => e),
      authenticate({ email: "nobody@test.example", password: "Wrong-password-1" }).catch((e) => e),
      authenticate({ email: off.email, password: PASSWORD }).catch((e) => e),
    ]);
    for (const e of errs) expect(e).toMatchObject({ code: "UNAUTHENTICATED", message: "Email or password is incorrect." });
  });
  it("rate-limits repeated attempts for one account", async () => {
    const u = await makeUser("STUDENT");
    let last: unknown;
    for (let i = 0; i < 12; i++) last = await authenticate({ email: u.email, password: "Wrong-password-1" }).catch((e) => e);
    expect(last).toMatchObject({ code: "RATE_LIMITED" });
  });
  it("records failed and successful logins in the audit log without secrets", async () => {
    const u = await makeUser("STUDENT");
    await authenticate({ email: u.email, password: "Wrong-password-1" }).catch(() => null);
    await authenticate({ email: u.email, password: PASSWORD });
    const logs = await prisma.auditLog.findMany();
    expect(logs.map((l) => l.action).sort()).toEqual(["auth.login", "auth.login_failed"]);
    expect(JSON.stringify(logs)).not.toContain(PASSWORD);
  });
});

describe("sessions", () => {
  it("stores only a hash and validates live sessions", async () => {
    const u = await makeUser("SUPERVISOR");
    const { token } = await createSessionRecord(u.id);
    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect((await findSessionUser(token))?.role).toBe("SUPERVISOR");
    expect(await findSessionUser("garbage")).toBeNull();
  });
  it("expires, can be revoked, and dies with deactivation", async () => {
    const u = await makeUser("STUDENT");
    const a = await createSessionRecord(u.id);
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await findSessionUser(a.token)).toBeNull();
    const b = await createSessionRecord(u.id);
    await deleteSessionByToken(b.token);
    expect(await findSessionUser(b.token)).toBeNull();
    const c = await createSessionRecord(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { active: false } });
    expect(await findSessionUser(c.token)).toBeNull();
  });
  it("password change revokes every session", async () => {
    const u = await makeUser("STUDENT");
    const { token } = await createSessionRecord(u.id);
    await expect(changePassword(u, { current: "wrong-password-1", next: "New-password-123" })).rejects.toMatchObject({ code: "VALIDATION" });
    await changePassword(u, { current: PASSWORD, next: "New-password-123" });
    expect(await findSessionUser(token)).toBeNull();
    expect((await authenticate({ email: u.email, password: "New-password-123" })).id).toBe(u.id);
    await deleteUserSessions(u.id);
  });
});
