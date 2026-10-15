import { prisma } from "@/lib/prisma";
import { getProjectAccess, type Actor } from "./access";
import type { Db } from "./db";

export async function logActivity(db: Db, projectId: string, actorId: string | null, type: string, message: string) {
  await db.projectActivity.create({ data: { projectId, actorId, type, message } });
}

export async function listActivity(actor: Actor, projectId: string, take = 40) {
  await getProjectAccess(actor, projectId);
  return prisma.projectActivity.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take,
    include: { actor: { select: { name: true } } },
  });
}
