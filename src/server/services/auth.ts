import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { AppError, conflict, isUniqueViolation } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hashRegistrationInviteCode } from "@/lib/registration-invitation";
import { hit, resetLimit } from "@/lib/rate-limit";
import { deleteUserSessions } from "@/lib/session-store";
import { changePasswordSchema, loginSchema, parse, registerSchema } from "@/server/validation";
import type { Actor } from "./access";
import { audit } from "./audit";

const BCRYPT_COST = 12;
let dummyHash: Promise<string> | undefined;

/** Public registration only creates a STUDENT and atomically consumes a valid invitation. */
export async function registerStudent(input: unknown, source: string) {
  if (!isIP(source)) throw new AppError("RATE_LIMITED", "Unable to verify the request source. Please try again.");
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if ((await hit(`register:source:${sourceHash}`, 900)) > 10) {
    throw new AppError("RATE_LIMITED", "Too many registration attempts. Please try again in 15 minutes.");
  }
  const d = parse(registerSchema, input);
  const codeHash = hashRegistrationInviteCode(d.inviteCode);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const invite = await tx.registrationInviteCode.findUnique({ where: { codeHash }, select: { id: true, maxUses: true } });
      if (!invite) throw new AppError("VALIDATION", "This registration invitation is invalid or no longer available.");

      const consumed = await tx.registrationInviteCode.updateMany({
        where: {
          id: invite.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
          uses: { lt: invite.maxUses },
        },
        data: { uses: { increment: 1 } },
      });
      if (consumed.count !== 1) throw new AppError("VALIDATION", "This registration invitation is invalid or no longer available.");

      const created = await tx.user.create({
        data: { name: d.name, email: d.email, passwordHash: await bcrypt.hash(d.password, BCRYPT_COST), role: "STUDENT" },
        select: { id: true, name: true, email: true, role: true },
      });
      await audit(tx, created.id, "auth.register", "User", created.id);
      return created;
    });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("An account with that email already exists.");
    throw e;
  }
}

/** Same error and comparable timing for unknown email, wrong password, and deactivated account. */
export async function authenticate(input: unknown) {
  const d = parse(loginSchema, input);
  const key = `login:${d.email}`;
  if ((await hit(key, 900)) > 10) throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Please wait 15 minutes and try again.");
  const user = await prisma.user.findUnique({ where: { email: d.email } });
  let ok = false;
  if (user) ok = await bcrypt.compare(d.password, user.passwordHash);
  else await bcrypt.compare(d.password, await (dummyHash ??= bcrypt.hash("dummy-password-1", BCRYPT_COST)));
  if (!user || !ok || !user.active) {
    await audit(prisma, user?.id ?? null, "auth.login_failed", "User", user?.id ?? null, { reason: !user ? "unknown_email" : !ok ? "bad_password" : "inactive" });
    throw new AppError("UNAUTHENTICATED", "Email or password is incorrect.");
  }
  await resetLimit(key);
  await audit(prisma, user.id, "auth.login", "User", user.id);
  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword };
}

export async function changePassword(actor: Actor, input: unknown) {
  const d = parse(changePasswordSchema, input);
  const user = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!user || !(await bcrypt.compare(d.current, user.passwordHash))) throw new AppError("VALIDATION", "Your current password is incorrect.");
  if (d.current === d.next) throw new AppError("VALIDATION", "Choose a password different from the current one.");
  const passwordHash = await bcrypt.hash(d.next, BCRYPT_COST);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.id }, data: { passwordHash, mustChangePassword: false } });
    await deleteUserSessions(actor.id, tx); // every existing session is revoked; the caller starts a fresh one
    await audit(tx, actor.id, "auth.password_changed", "User", actor.id);
  });
}
