import type { Prisma } from "@prisma/client";
import { forbidden, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session-store";
import type { Db } from "./db";

export type Actor = SessionUser;
export type AccessLevel = "ADMIN" | "SUPERVISOR" | "LEADER" | "MEMBER";

/**
 * The ONE place that decides whether a user may see a project:
 *  - ADMIN: all projects
 *  - SUPERVISOR: only projects they are explicitly assigned to (role alone grants nothing)
 *  - STUDENT: only projects they are a member of
 * Anyone else gets "not found", so the existence of private projects is not revealed (no IDOR).
 */
export async function getProjectAccess(actor: Actor, projectId: string, db: Db = prisma) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { members: { select: { userId: true, role: true } } },
  });
  if (!project) throw notFound("Project not found.");
  let level: AccessLevel | null = null;
  if (actor.role === "ADMIN") level = "ADMIN";
  else if (actor.role === "SUPERVISOR") level = project.supervisorId === actor.id ? "SUPERVISOR" : null;
  else {
    const m = project.members.find((x) => x.userId === actor.id);
    level = m ? (m.role === "LEADER" ? "LEADER" : "MEMBER") : null;
  }
  if (!level) throw notFound("Project not found.");
  return { project, level };
}

export const canManage = (l: AccessLevel) => l === "ADMIN" || l === "LEADER";
export const isStudentLevel = (l: AccessLevel) => l === "LEADER" || l === "MEMBER";

/** Prisma filter for every project the actor may see; use it in every list/aggregate query. */
export function accessibleProjectsWhere(actor: Actor): Prisma.ProjectWhereInput {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "SUPERVISOR") return { supervisorId: actor.id };
  return { members: { some: { userId: actor.id } } };
}

export function requireAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw forbidden("Administrator access is required.");
}
