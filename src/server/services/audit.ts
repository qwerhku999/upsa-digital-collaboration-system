import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, type Actor } from "./access";
import type { Db } from "./db";

/** Never put passwords, tokens, or session ids in metadata. */
export async function audit(db: Db, actorId: string | null, action: string, entityType: string, entityId?: string | null, metadata?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { actorId, action, entityType, entityId: entityId ?? null, metadata } });
}

export const PAGE_SIZE = 15;
export const paginate = (page: number) => ({ skip: (Math.max(1, page) - 1) * PAGE_SIZE, take: PAGE_SIZE });

export async function listAudit(actor: Actor, page = 1, action?: string) {
  requireAdmin(actor);
  const where: Prisma.AuditLogWhereInput = action ? { action: { contains: action } } : {};
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, email: true } } }, ...paginate(page) }),
    prisma.auditLog.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
