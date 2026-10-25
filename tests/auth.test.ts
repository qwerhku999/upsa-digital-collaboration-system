import { beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashRegistrationInviteCode } from "@/lib/registration-invitation";
import { createSessionRecord, deleteSessionByToken, deleteUserSessions, findSessionUser } from "@/lib/session-store";
import { authenticate, changePassword, registerStudent } from "@/server/services/auth";
import { createRegistrationInvite, revokeRegistrationInvite, rotateRegistrationInvites } from "@/server/services/registration-invites";
import { PASSWORD, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

const TEST_CLIENT_IP = "203.0.113.10";
const register = (input: unknown, source = TEST_CLIENT_IP) => registerStudent(input, source);

async function makeInvite(maxUses = 5, expiresAt = new Date(Date.now() + 60_000)) {
  const admin = await makeUser("ADMIN");
  const code = randomBytes(16).toString("hex").toUpperCase();
  await prisma.registrationInviteCode.create({
    data: {
      codeHash: hashRegistrationInviteCode(code),
      createdById: admin.id,
      maxUses,
      expiresAt,
    },
  });
  return { admin, code };
}

describe("registration", () => {
  it("creates a STUDENT with a hashed password", async () => {
    const { code } = await makeInvite();
    const u = await register({ name: "Ama Mensah", email: "Ama@Test.Example", password: "Strong-pass-1", inviteCode: code });
    expect(u.role).toBe("STUDENT");
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.email).toBe("ama@test.example");
    expect(row.passwordHash).not.toContain("Strong-pass-1");
    expect(row.passwordHash.startsWith("$2")).toBe(true);
    const invite = await prisma.registrationInviteCode.findUniqueOrThrow({ where: { codeHash: hashRegistrationInviteCode(code) } });
    expect(invite.codeHash).not.toBe(code);
    expect(invite.uses).toBe(1);
  });
  it("cannot be used to self-register as an administrator or supervisor", async () => {
    for (const role of ["ADMIN", "SUPERVISOR"] as const) {
      const { code } = await makeInvite();
      const u = await register({ name: "Eve Evil", email: `${role.toLowerCase()}@test.example`, password: "Strong-pass-1", role, inviteCode: code });
      expect(u.role).toBe("STUDENT");
    }
  });
  it("rejects duplicate emails, weak passwords and bad input", async () => {
    const { code } = await makeInvite();
    await register({ name: "Ama Mensah", email: "ama@test.example", password: "Strong-pass-1", inviteCode: code });
    await expect(register({ name: "Other", email: "AMA@test.example", password: "Strong-pass-1", inviteCode: code })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(register({ name: "X Y", email: "x@test.example", password: "weak", inviteCode: code })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(register({ name: "X Y", email: "not-an-email", password: "Strong-pass-1", inviteCode: code })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(register({ name: "X Y", email: "x@test.example", password: "Strong-pass-1" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("rejects invalid, expired, and revoked invitation codes", async () => {
    const { admin, code } = await makeInvite(5, new Date(Date.now() - 1000));
    const input = { name: "Student One", email: "one@test.example", password: "Strong-pass-1", inviteCode: code };
    await expect(register({ ...input, inviteCode: "A".repeat(32) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(register(input)).rejects.toMatchObject({ code: "VALIDATION" });

    const current = await createRegistrationInvite(admin, { expiresInDays: 7, maxUses: 5 });
    const row = await prisma.registrationInviteCode.findUniqueOrThrow({ where: { codeHash: hashRegistrationInviteCode(current) } });
    await revokeRegistrationInvite(admin, row.id);
    await expect(register({ ...input, inviteCode: current })).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("enforces usage limits and atomically permits only one concurrent final use", async () => {
    const { code } = await makeInvite(1);
    const first = { name: "First Student", email: "first@test.example", password: "Strong-pass-1", inviteCode: code };
    await register(first);
    await expect(register({ ...first, email: "second@test.example" })).rejects.toMatchObject({ code: "VALIDATION" });

    const { code: concurrentCode } = await makeInvite(1);
    const results = await Promise.allSettled([
      register({ ...first, email: "concurrent-one@test.example", inviteCode: concurrentCode }),
      register({ ...first, email: "concurrent-two@test.example", inviteCode: concurrentCode }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const invite = await prisma.registrationInviteCode.findUniqueOrThrow({ where: { codeHash: hashRegistrationInviteCode(concurrentCode) } });
    expect(invite.uses).toBe(1);
  });
  it("lets administrators create and rotate codes while storing only hashes", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    await expect(createRegistrationInvite(student, { expiresInDays: 7, maxUses: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const oldCode = await createRegistrationInvite(admin, { expiresInDays: 7, maxUses: 5 });
    const oldInvite = await prisma.registrationInviteCode.findUniqueOrThrow({ where: { codeHash: hashRegistrationInviteCode(oldCode) } });
    expect(oldInvite.codeHash).not.toBe(oldCode);

    const newCode = await rotateRegistrationInvites(admin, { expiresInDays: 3, maxUses: 2 });
    await expect(register({ name: "Old Code", email: "old@test.example", password: "Strong-pass-1", inviteCode: oldCode })).rejects.toMatchObject({ code: "VALIDATION" });
    const created = await register({ name: "New Code", email: "new@test.example", password: "Strong-pass-1", inviteCode: newCode });
    expect(created.role).toBe("STUDENT");
  });
  it("serializes concurrent rotations so only the last replacement remains active", async () => {
    const admin = await makeUser("ADMIN");
    const firstCode = await createRegistrationInvite(admin, { expiresInDays: 7, maxUses: 5 });
    const secondCode = await createRegistrationInvite(admin, { expiresInDays: 7, maxUses: 5 });

    let releaseLock!: () => void;
    let signalLockAcquired!: () => void;
    const lockReleased = new Promise<void>((resolve) => { releaseLock = resolve; });
    const lockAcquired = new Promise<void>((resolve) => { signalLockAcquired = resolve; });
    const lockHolder = prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ acquired: number }[]>`
        WITH advisory_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(73190421, 1)
        )
        SELECT 1::int AS acquired FROM advisory_lock
      `;
      signalLockAcquired();
      await lockReleased;
    });

    let rotations: Promise<string[]> | undefined;
    let bothWaiting = false;
    let rotationError: unknown;
    try {
      await Promise.race([
        lockAcquired,
        lockHolder.then(() => {
          throw new Error("Lock-holder transaction completed before acquiring the advisory lock.");
        }),
      ]);
      rotations = Promise.all([
        rotateRegistrationInvites(admin, { expiresInDays: 7, maxUses: 5 }),
        rotateRegistrationInvites(admin, { expiresInDays: 7, maxUses: 5 }),
      ]);
      const waitDeadline = Date.now() + 5000;
      while (Date.now() < waitDeadline) {
        const [{ waiting }] = await prisma.$queryRaw<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting
          FROM pg_stat_activity
          WHERE wait_event_type = 'Lock'
            AND query LIKE '%pg_advisory_xact_lock%'
        `;
        if (waiting >= 2) {
          bothWaiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    } finally {
      releaseLock();
      try {
        await lockHolder;
      } finally {
        if (rotations) {
          try {
            await rotations;
          } catch (error) {
            rotationError = error;
          }
        }
      }
    }
    if (rotationError) throw rotationError;
    const rotatedCodes = await rotations!;
    expect(bothWaiting).toBe(true);

    const activeInvites = await prisma.registrationInviteCode.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      select: { codeHash: true },
    });

    expect(activeInvites).toHaveLength(1);
    expect(rotatedCodes.map(hashRegistrationInviteCode)).toContain(activeInvites[0].codeHash);
    const previousInvites = await prisma.registrationInviteCode.findMany({
      where: { codeHash: { in: [firstCode, secondCode].map(hashRegistrationInviteCode) } },
      select: { revokedAt: true },
    });
    expect(previousInvites).toHaveLength(2);
    expect(previousInvites.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });
  it("rate-limits repeated registration attempts from one source", async () => {
    const input = { name: "Student One", email: "one@test.example", password: "Strong-pass-1", inviteCode: "A".repeat(32) };
    let lastError: unknown;
    for (let i = 0; i < 11; i++) {
      lastError = await register({ ...input, email: `student-${i}@test.example` }, "198.51.100.20").catch((error: unknown) => error);
    }
    expect(lastError).toMatchObject({ code: "RATE_LIMITED" });
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
