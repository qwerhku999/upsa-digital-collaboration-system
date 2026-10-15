import { randomBytes } from "node:crypto";
import type { Prisma, ProjectStatus } from "@prisma/client";
import { AppError, conflict, forbidden, invalid, isUniqueViolation, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { hit } from "@/lib/rate-limit";
import { deleteStoredFile } from "@/lib/storage";
import { parse, projectCreationSchema, projectSchema } from "@/server/validation";
import { accessibleProjectsWhere, canManage, getProjectAccess, requireAdmin, type AccessLevel, type Actor } from "./access";
import { logActivity } from "./activity";
import { PAGE_SIZE, audit, paginate } from "./audit";
import { notify, projectRecipients } from "./notifications";
import { projectStats } from "./stats";

export const MAX_MEMBERS = 10;
const newJoinCode = () => randomBytes(5).toString("hex").toUpperCase();

export async function createProject(actor: Actor, input: unknown) {
  if (actor.role !== "STUDENT" && actor.role !== "ADMIN") throw forbidden("Only students and administrators can create projects.");
  const d = parse(projectCreationSchema, input);
  const supervisorId = actor.role === "ADMIN" ? d.supervisorId : null;
  const { supervisorId: _ignored, ...projectFields } = d;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        if (supervisorId) {
          const supervisor = await tx.user.findUnique({ where: { id: supervisorId }, select: { role: true, active: true } });
          if (!supervisor || supervisor.role !== "SUPERVISOR" || !supervisor.active) throw invalid("Choose an active supervisor account.");
        }
        const project = await tx.project.create({
          data: {
            ...projectFields,
            supervisorId,
            joinCode: newJoinCode(),
            ...(actor.role === "STUDENT" ? { members: { create: { userId: actor.id, role: "LEADER" as const } } } : {}),
          },
        });
        await logActivity(tx, project.id, actor.id, "project.created", `${actor.name} created the project.`);
        if (actor.role === "ADMIN") {
          await audit(tx, actor.id, "project.created", "Project", project.id, { supervisorId });
          if (supervisorId) {
            await notify(tx, [supervisorId], {
              type: "MEMBERSHIP", projectId: project.id, link: `/projects/${project.id}`,
              title: "Project assigned", message: `You were assigned to supervise "${project.title}".`,
            });
          }
        }
        return project;
      });
    } catch (e) {
      if (!isUniqueViolation(e) || attempt === 2) throw e;
    }
  }
  throw new Error("unreachable");
}

export async function updateProject(actor: Actor, projectId: string, input: unknown) {
  const { level } = await getProjectAccess(actor, projectId);
  if (!canManage(level)) throw forbidden("Only a project leader or administrator can edit the project.");
  const d = parse(projectSchema, input);
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.update({ where: { id: projectId }, data: d });
    await logActivity(tx, projectId, actor.id, "project.updated", `${actor.name} updated the project details.`);
    return p;
  });
}

type Rule = { from: ProjectStatus; to: ProjectStatus; who: (l: AccessLevel) => boolean };
const leaderOrAdmin = (l: AccessLevel) => l === "LEADER" || l === "ADMIN";
const reviewer = (l: AccessLevel) => l === "SUPERVISOR" || l === "ADMIN";
const RULES: Rule[] = [
  { from: "PLANNING", to: "IN_PROGRESS", who: leaderOrAdmin },
  { from: "IN_PROGRESS", to: "UNDER_REVIEW", who: leaderOrAdmin },
  { from: "REVISION_REQUIRED", to: "IN_PROGRESS", who: leaderOrAdmin },
  { from: "REVISION_REQUIRED", to: "UNDER_REVIEW", who: leaderOrAdmin },
  { from: "UNDER_REVIEW", to: "REVISION_REQUIRED", who: reviewer },
  { from: "UNDER_REVIEW", to: "COMPLETED", who: reviewer },
  { from: "COMPLETED", to: "IN_PROGRESS", who: (l) => l === "ADMIN" },
];

export function allowedTransitions(from: ProjectStatus, level: AccessLevel): ProjectStatus[] {
  return RULES.filter((r) => r.from === from && r.who(level)).map((r) => r.to);
}

/** Status is workflow-controlled: only these transitions, by these roles. Marking COMPLETED is a supervisor decision. */
export async function transitionProject(actor: Actor, projectId: string, to: ProjectStatus) {
  const { project, level } = await getProjectAccess(actor, projectId);
  const rule = RULES.find((r) => r.from === project.status && r.to === to);
  if (!rule) throw invalid("That status change is not allowed from the current status.");
  if (!rule.who(level)) throw forbidden("You are not allowed to make that status change.");
  if (to === "UNDER_REVIEW" && !project.supervisorId) throw invalid("A supervisor must be assigned before the project can be submitted for review.");
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status: to, completedAt: to === "COMPLETED" ? new Date() : null } });
    await logActivity(tx, projectId, actor.id, "project.status", `${actor.name} changed the status to ${to.replace("_", " ").toLowerCase()}.`);
    await notify(tx, await projectRecipients(tx, projectId, actor.id), {
      type: to === "REVISION_REQUIRED" ? "REVISION" : "PROJECT", projectId, link: `/projects/${projectId}`,
      title: "Project status changed", message: `"${project.title}" is now ${to.replace("_", " ").toLowerCase()}.`,
    });
  });
}

export async function assignSupervisor(actor: Actor, projectId: string, supervisorId: string | null) {
  requireAdmin(actor);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw notFound("Project not found.");
  if (supervisorId) {
    const sup = await prisma.user.findUnique({ where: { id: supervisorId }, select: { role: true, active: true } });
    if (!sup || sup.role !== "SUPERVISOR" || !sup.active) throw invalid("Choose an active supervisor account.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { supervisorId } });
    await audit(tx, actor.id, supervisorId ? "project.supervisor_assigned" : "project.supervisor_removed", "Project", projectId, { from: project.supervisorId, to: supervisorId });
    await logActivity(tx, projectId, actor.id, "project.supervisor", supervisorId ? "A supervisor was assigned to the project." : "The supervisor was removed from the project.");
    const members = (await projectRecipients(tx, projectId)).filter((id) => id !== project.supervisorId);
    await notify(tx, [...members, ...(supervisorId ? [supervisorId] : [])], {
      type: "MEMBERSHIP", projectId, link: `/projects/${projectId}`,
      title: "Supervisor assignment changed", message: `Supervision of "${project.title}" was updated by an administrator.`,
    });
    if (project.supervisorId && project.supervisorId !== supervisorId) {
      await notify(tx, [project.supervisorId], { type: "MEMBERSHIP", projectId: undefined, title: "Removed from supervision", message: `You no longer supervise "${project.title}".` });
    }
  });
}

export async function addMemberByEmail(actor: Actor, projectId: string, email: string) {
  const { project, level } = await getProjectAccess(actor, projectId);
  if (!canManage(level)) throw forbidden("Only a project leader or administrator can add members.");
  const target = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, name: true, role: true, active: true } });
  if (!target || target.role !== "STUDENT" || !target.active) throw invalid("No active student account was found with that email.");
  if (project.members.length >= MAX_MEMBERS) throw invalid(`A project can have at most ${MAX_MEMBERS} members.`);
  if (project.members.some((m) => m.userId === target.id)) throw conflict("That student is already a member.");
  await insertMember(actor, project.id, project.title, target);
}

export async function joinByCode(actor: Actor, code: string) {
  if (actor.role !== "STUDENT") throw forbidden("Only students can join projects with a code.");
  if ((await hit(`join:${actor.id}`, 900)) > 10) throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes.");
  const project = await prisma.project.findUnique({ where: { joinCode: code.trim().toUpperCase() }, include: { members: { select: { userId: true } } } });
  if (!project || project.status === "COMPLETED") throw invalid("That join code is not valid.");
  if (project.members.some((m) => m.userId === actor.id)) throw conflict("You are already a member of that project.");
  if (project.members.length >= MAX_MEMBERS) throw invalid("That project is full.");
  await insertMember(actor, project.id, project.title, { id: actor.id, name: actor.name }, true);
  return project.id;
}

async function insertMember(actor: Actor, projectId: string, title: string, target: { id: string; name: string }, joined = false) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectMember.create({ data: { projectId, userId: target.id } });
      await logActivity(tx, projectId, actor.id, "member.added", joined ? `${target.name} joined using the project code.` : `${actor.name} added ${target.name} to the project.`);
      await notify(tx, [target.id], { type: "MEMBERSHIP", projectId, link: `/projects/${projectId}`, title: "Added to a project", message: `You are now a member of "${title}".` });
      await notify(tx, (await projectRecipients(tx, projectId, actor.id)).filter((id) => id !== target.id), { type: "MEMBERSHIP", projectId, link: `/projects/${projectId}`, title: "New project member", message: `${target.name} joined "${title}".` });
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("That student is already a member.");
    throw e;
  }
}

async function leaderCount(projectId: string) {
  return prisma.projectMember.count({ where: { projectId, role: "LEADER" } });
}

export async function removeMember(actor: Actor, projectId: string, userId: string) {
  const { project, level } = await getProjectAccess(actor, projectId);
  if (!canManage(level) && userId !== actor.id) throw forbidden("You can only remove yourself.");
  const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } }, include: { user: { select: { name: true } } } });
  if (!member) throw notFound("That person is not a member of this project.");
  if (member.role === "LEADER" && (await leaderCount(projectId)) <= 1) throw invalid("A project needs at least one leader. Make another member the leader first.");
  await prisma.$transaction(async (tx) => {
    await tx.projectMember.delete({ where: { id: member.id } });
    await tx.task.updateMany({ where: { projectId, assigneeId: userId }, data: { assigneeId: null } }); // tasks stay, unassigned
    await logActivity(tx, projectId, actor.id, "member.removed", userId === actor.id ? `${member.user.name} left the project.` : `${actor.name} removed ${member.user.name} from the project.`);
    if (userId !== actor.id) await notify(tx, [userId], { type: "MEMBERSHIP", title: "Removed from a project", message: `You were removed from "${project.title}".` });
  });
}

export async function setMemberRole(actor: Actor, projectId: string, userId: string, role: "LEADER" | "MEMBER") {
  const { level } = await getProjectAccess(actor, projectId);
  if (!canManage(level)) throw forbidden("Only a project leader or administrator can change roles.");
  const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (!m) throw notFound("That person is not a member of this project.");
  if (m.role === "LEADER" && role === "MEMBER" && (await leaderCount(projectId)) <= 1) throw invalid("A project needs at least one leader.");
  await prisma.projectMember.update({ where: { id: m.id }, data: { role } });
  await logActivity(prisma, projectId, actor.id, "member.role", `${actor.name} changed a member's role to ${role.toLowerCase()}.`);
}

export async function rotateJoinCode(actor: Actor, projectId: string) {
  const { level } = await getProjectAccess(actor, projectId);
  if (!canManage(level)) throw forbidden("Only a project leader or administrator can change the join code.");
  await prisma.project.update({ where: { id: projectId }, data: { joinCode: newJoinCode() } });
}

export async function deleteProject(actor: Actor, projectId: string) {
  requireAdmin(actor);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, title: true } });
  if (!project) throw notFound("Project not found.");
  const versions = await prisma.submissionVersion.findMany({ where: { submission: { projectId } }, select: { storageKey: true } });
  await prisma.$transaction(async (tx) => {
    await tx.project.delete({ where: { id: projectId } });
    await audit(tx, actor.id, "project.deleted", "Project", projectId, { title: project.title });
  });
  await Promise.all(versions.map((v) => deleteStoredFile(v.storageKey)));
}

export async function listProjects(actor: Actor, opts: { q?: string; status?: ProjectStatus; page?: number } = {}) {
  const where: Prisma.ProjectWhereInput = {
    ...accessibleProjectsWhere(actor),
    ...(opts.q ? { title: { contains: opts.q, mode: "insensitive" } } : {}),
    ...(opts.status ? { status: opts.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where, orderBy: { updatedAt: "desc" }, ...paginate(opts.page ?? 1),
      include: { supervisor: { select: { name: true } }, _count: { select: { members: true } } },
    }),
    prisma.project.count({ where }),
  ]);
  const stats = await projectStats(items.map((p) => p.id));
  return { items: items.map((p) => ({ ...p, stats: stats.get(p.id)! })), total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export async function getProject(actor: Actor, projectId: string) {
  const { level } = await getProjectAccess(actor, projectId);
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      supervisor: { select: { id: true, name: true, email: true } },
      members: { orderBy: { joinedAt: "asc" }, include: { user: { select: { id: true, name: true, email: true } } } },
      milestones: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] },
    },
  });
  const stats = (await projectStats([projectId])).get(projectId)!;
  return { project: { ...project, joinCode: canManage(level) ? project.joinCode : null }, level, stats };
}
