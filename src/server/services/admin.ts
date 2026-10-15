import bcrypt from "bcryptjs";
import type { Prisma, UserRole } from "@prisma/client";
import { conflict, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { deleteUserSessions } from "@/lib/session-store";
import { adminCreateUserSchema, parse, passwordSchema } from "@/server/validation";
import { requireAdmin, type Actor } from "./access";
import { PAGE_SIZE, audit, paginate } from "./audit";

export async function listUsers(actor: Actor, opts: { q?: string; role?: UserRole; active?: boolean; page?: number } = {}) {
  requireAdmin(actor);
  const where: Prisma.UserWhereInput = {
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }] } : {}),
    ...(opts.role ? { role: opts.role } : {}),
    ...(opts.active === undefined ? {} : { active: opts.active }),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, ...paginate(opts.page ?? 1) }),
    prisma.user.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Controlled provisioning of supervisors/admins. The person must change the password at first sign-in. */
export async function createUser(actor: Actor, input: unknown) {
  requireAdmin(actor);
  const d = parse(adminCreateUserSchema, input);
  try {
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name: d.name, email: d.email, role: d.role, passwordHash: await bcrypt.hash(d.password, 12), mustChangePassword: true },
        select: { id: true, email: true, role: true },
      });
      await audit(tx, actor.id, "user.created", "User", u.id, { role: u.role });
      return u;
    });
    return user;
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("An account with that email already exists.");
    throw e;
  }
}

async function activeAdminCountExcluding(userId: string) {
  return prisma.user.count({ where: { role: "ADMIN", active: true, id: { not: userId } } });
}

export async function setUserRole(actor: Actor, userId: string, role: UserRole) {
  requireAdmin(actor);
  if (userId === actor.id) throw invalid("You cannot change your own role.");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User not found.");
  if (target.role === role) return;
  if (target.role === "ADMIN" && (await activeAdminCountExcluding(userId)) === 0) throw invalid("There must always be at least one active administrator.");
  if (target.role === "STUDENT" && (await prisma.projectMember.count({ where: { userId } })) > 0) throw invalid("Remove this student from all projects before changing their role.");
  if (target.role === "SUPERVISOR" && (await prisma.project.count({ where: { supervisorId: userId } })) > 0) throw invalid("Reassign this supervisor's projects before changing their role.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { role } });
    await deleteUserSessions(userId, tx); // privileges changed: force a fresh sign-in
    await audit(tx, actor.id, "user.role_changed", "User", userId, { from: target.role, to: role });
  });
}

export async function setUserActive(actor: Actor, userId: string, active: boolean) {
  requireAdmin(actor);
  if (userId === actor.id) throw invalid("You cannot deactivate your own account.");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw notFound("User not found.");
  if (!active && target.role === "ADMIN" && (await activeAdminCountExcluding(userId)) === 0) throw invalid("There must always be at least one active administrator.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { active } });
    if (!active) await deleteUserSessions(userId, tx);
    await audit(tx, actor.id, active ? "user.activated" : "user.deactivated", "User", userId);
  });
}

export async function resetUserPassword(actor: Actor, userId: string, newPassword: string) {
  requireAdmin(actor);
  const pw = parse(passwordSchema, newPassword);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!target) throw notFound("User not found.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(pw, 12), mustChangePassword: true } });
    await deleteUserSessions(userId, tx);
    await audit(tx, actor.id, "user.password_reset", "User", userId);
  });
}
