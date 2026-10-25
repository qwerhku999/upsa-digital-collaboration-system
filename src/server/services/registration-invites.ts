import { notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createRegistrationInviteCode, hashRegistrationInviteCode } from "@/lib/registration-invitation";
import { parse, registrationInviteSettingsSchema } from "@/server/validation";
import { requireAdmin, type Actor } from "./access";
import { audit } from "./audit";

const DEFAULT_EXPIRY_DAYS = 7;
const DEFAULT_MAX_USES = 25;

export async function listRegistrationInvites(actor: Actor) {
  requireAdmin(actor);
  return prisma.registrationInviteCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, createdAt: true, expiresAt: true, maxUses: true, uses: true, revokedAt: true },
  });
}

export async function createRegistrationInvite(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const settings = parse(registrationInviteSettingsSchema, input);
  const code = createRegistrationInviteCode();
  const expiresAt = new Date(Date.now() + settings.expiresInDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const invite = await tx.registrationInviteCode.create({
      data: { codeHash: hashRegistrationInviteCode(code), createdById: actor.id, maxUses: settings.maxUses, expiresAt },
    });
    await audit(tx, actor.id, "registration_invite.created", "RegistrationInviteCode", invite.id, {
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });
  return code;
}

export async function rotateRegistrationInvites(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const settings = parse(registrationInviteSettingsSchema, input);
  const code = createRegistrationInviteCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + settings.expiresInDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<{ acquired: number }[]>`
      WITH advisory_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(73190421, 1)
      )
      SELECT 1::int AS acquired FROM advisory_lock
    `;
    await tx.registrationInviteCode.updateMany({
      where: { revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    const invite = await tx.registrationInviteCode.create({
      data: { codeHash: hashRegistrationInviteCode(code), createdById: actor.id, maxUses: settings.maxUses, expiresAt },
    });
    await audit(tx, actor.id, "registration_invite.rotated", "RegistrationInviteCode", invite.id, {
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt.toISOString(),
    });
  });
  return code;
}

export async function revokeRegistrationInvite(actor: Actor, id: string) {
  requireAdmin(actor);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const result = await tx.registrationInviteCode.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
    if (result.count !== 1) throw notFound("Registration invitation not found.");
    await audit(tx, actor.id, "registration_invite.revoked", "RegistrationInviteCode", id);
  });
}

export const registrationInviteDefaults = { expiresInDays: DEFAULT_EXPIRY_DAYS, maxUses: DEFAULT_MAX_USES };
