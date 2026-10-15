import type { MilestoneStatus } from "@prisma/client";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { milestoneSchema, parse } from "@/server/validation";
import { getProjectAccess, type AccessLevel, type Actor } from "./access";
import { logActivity } from "./activity";
import { notify, projectRecipients } from "./notifications";

const canEdit = (l: AccessLevel) => l === "ADMIN" || l === "LEADER" || l === "SUPERVISOR";

export async function createMilestone(actor: Actor, projectId: string, input: unknown) {
  const { project, level } = await getProjectAccess(actor, projectId);
  if (!canEdit(level)) throw forbidden("Only leaders, the supervisor, or administrators can manage milestones.");
  const d = parse(milestoneSchema, input);
  return prisma.$transaction(async (tx) => {
    const m = await tx.milestone.create({ data: { ...d, projectId } });
    await logActivity(tx, projectId, actor.id, "milestone.created", `${actor.name} added the milestone "${m.title}".`);
    await notify(tx, await projectRecipients(tx, projectId, actor.id), { type: "MILESTONE", projectId, link: `/projects/${projectId}?tab=milestones`, title: "New milestone", message: `"${m.title}" was added to "${project.title}".` });
    return m;
  });
}

async function loadMilestone(actor: Actor, id: string) {
  const m = await prisma.milestone.findUnique({ where: { id } });
  if (!m) throw notFound("Milestone not found.");
  const access = await getProjectAccess(actor, m.projectId);
  if (!canEdit(access.level)) throw forbidden("Only leaders, the supervisor, or administrators can manage milestones.");
  return { m, ...access };
}

export async function updateMilestone(actor: Actor, id: string, input: unknown) {
  const { m } = await loadMilestone(actor, id);
  const d = parse(milestoneSchema, input);
  await prisma.milestone.update({ where: { id }, data: d });
  await logActivity(prisma, m.projectId, actor.id, "milestone.updated", `${actor.name} edited the milestone "${d.title}".`);
}

export async function setMilestoneStatus(actor: Actor, id: string, status: MilestoneStatus) {
  const { m, project } = await loadMilestone(actor, id);
  if (!["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(status)) throw invalid("Unknown milestone status.");
  await prisma.$transaction(async (tx) => {
    await tx.milestone.update({ where: { id }, data: { status, completedAt: status === "COMPLETED" ? new Date() : null } });
    await logActivity(tx, m.projectId, actor.id, "milestone.status", `${actor.name} marked "${m.title}" ${status.replace("_", " ").toLowerCase()}.`);
    await notify(tx, await projectRecipients(tx, m.projectId, actor.id), { type: "MILESTONE", projectId: m.projectId, link: `/projects/${m.projectId}?tab=milestones`, title: "Milestone updated", message: `"${m.title}" in "${project.title}" is now ${status.replace("_", " ").toLowerCase()}.` });
  });
}

export async function deleteMilestone(actor: Actor, id: string) {
  const { m } = await loadMilestone(actor, id);
  await prisma.milestone.delete({ where: { id } }); // tasks keep existing (milestoneId set to null)
  await logActivity(prisma, m.projectId, actor.id, "milestone.deleted", `${actor.name} deleted the milestone "${m.title}".`);
}
