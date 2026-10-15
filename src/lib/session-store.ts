import { createHash, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export type SessionUser = { id: string; name: string; email: string; role: UserRole; mustChangePassword: boolean };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Only the hash of the random token is stored, so a database leak cannot be replayed as cookies. */
export async function createSessionRecord(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

/** Returns the user only for a live session of an active account. Never loads the password hash. */
export async function findSessionUser(token: string): Promise<SessionUser | null> {
  const id = hashToken(token);
  const s = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true } } },
  });
  if (!s) return null;
  if (s.expiresAt <= new Date() || !s.user.active) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  const { active: _active, ...user } = s.user;
  void _active;
  return user;
}

export async function deleteSessionByToken(token: string) {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

export async function deleteUserSessions(userId: string, db: PrismaClient | Prisma.TransactionClient = prisma) {
  await db.session.deleteMany({ where: { userId } });
}
