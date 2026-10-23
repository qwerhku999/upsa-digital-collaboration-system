import type { Prisma, TaskPriority, TaskStatus } from "@prisma/client";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { parse, taskListFilterSchema, taskSchema } from "@/server/validation";
import { accessibleProjectsWhere, canManage, getProjectAccess, isStudentLevel, type AccessLevel, type Actor } from "./access";
import { logActivity } from "./activity";
import { PAGE_SIZE, paginate } from "./audit";
import { notify, projectRecipients } from "./notifications";

type TaskInput = ReturnType<typeof parseTask>;
const parseTask = (input: unknown) => parse(taskSchema, input);

/** Assignee must be a current member of THIS project; milestone must belong to THIS project. */
async function validateRefs(projectId: string, level: AccessLevel, actor: Actor, d: TaskInput) {
  if (d.assigneeId) {
    const m = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: d.assigneeId } } });
    if (!m) throw invalid("Tasks can only be assigned to members of this project.");
    if (level === "MEMBER" && d.assigneeId !== actor.id) throw forbidden("Only a project leader can assign tasks to other members.");
  }
  if (d.milestoneId) {
    const ms = await prisma.milestone.findFirst({ where: { id: d.milestoneId, projectId }, select: { id: true } });
    if (!ms) throw invalid("That milestone does not belong to this project.");
  }
}

export async function createTask(actor: Actor, projectId: string, input: unknown) {
  const { project, level } = await getProjectAccess(actor, projectId);
  if (!isStudentLevel(level) && level !== "ADMIN" && level !== "SUPERVISOR") throw forbidden("You are not allowed to create tasks in this project.");
  const d = parseTask(input);
  await validateRefs(projectId, level, actor, d);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({ data: { ...d, projectId, creatorId: actor.id } });
    await logActivity(tx, projectId, actor.id, "task.created", `${actor.name} created the task "${task.title}".`);
    if (d.assigneeId && d.assigneeId !== actor.id) {
      await notify(tx, [d.assigneeId], { type: "TASK", projectId, link: `/projects/${projectId}?tab=tasks`, title: "New task assigned", message: `You were assigned "${task.title}" in "${project.title}".` });
    }
    return task;
  });
}

async function loadTask(actor: Actor, taskId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw notFound("Task not found.");
  const access = await getProjectAccess(actor, task.projectId); // 404 if the actor cannot see the project
  return { task, ...access };
}

export async function updateTask(actor: Actor, taskId: string, input: unknown) {
  const { task, project, level } = await loadTask(actor, taskId);
  if (!(canManage(level) || task.creatorId === actor.id)) throw forbidden("Only a leader or the task's creator can edit it.");
  const d = parseTask(input);
  await validateRefs(project.id, level, actor, d);
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: d });
    await logActivity(tx, project.id, actor.id, "task.updated", `${actor.name} edited the task "${d.title}".`);
    if (d.assigneeId && d.assigneeId !== task.assigneeId && d.assigneeId !== actor.id) {
      await notify(tx, [d.assigneeId], { type: "TASK", projectId: project.id, link: `/projects/${project.id}?tab=tasks`, title: "New task assigned", message: `You were assigned "${d.title}" in "${project.title}".` });
    }
  });
}

export async function setTaskStatus(actor: Actor, taskId: string, status: TaskStatus) {
  const { task, project, level } = await loadTask(actor, taskId);
  if (!(canManage(level) || (level === "MEMBER" && task.assigneeId === actor.id))) throw forbidden("You can only update the status of tasks assigned to you.");
  if (!["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"].includes(status)) throw invalid("Unknown task status.");
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: taskId }, data: { status, completedAt: status === "COMPLETED" ? new Date() : null } });
    await logActivity(tx, project.id, actor.id, "task.status", `${actor.name} moved "${task.title}" to ${status.replace("_", " ").toLowerCase()}.`);
    if (task.status !== status) {
      await notify(tx, await projectRecipients(tx, project.id, actor.id), {
        type: "TASK",
        projectId: project.id,
        link: `/projects/${project.id}?tab=tasks`,
        title: "Task status updated",
        message: `"${task.title}" is now ${status.replace("_", " ").toLowerCase()}.`,
      });
    }
  });
}

export async function deleteTask(actor: Actor, taskId: string) {
  const { task, project, level } = await loadTask(actor, taskId);
  if (!(canManage(level) || task.creatorId === actor.id)) throw forbidden("Only a leader or the task's creator can delete it.");
  await prisma.$transaction(async (tx) => {
    await tx.task.delete({ where: { id: taskId } });
    await logActivity(tx, project.id, actor.id, "task.deleted", `${actor.name} deleted the task "${task.title}".`);
  });
}

export type TaskFilters = {
  projectId?: string; status?: TaskStatus; priority?: TaskPriority; overdue?: boolean; mine?: boolean;
  assigneeId?: string; dueFrom?: string; dueTo?: string;
  sort?: "due" | "priority" | "updated"; page?: number; take?: number;
};

export async function listTasks(actor: Actor, f: TaskFilters = {}) {
  const filters = parse(taskListFilterSchema, {
    status: f.status, priority: f.priority, assigneeId: f.assigneeId,
    dueFrom: f.dueFrom, dueTo: f.dueTo, overdue: f.overdue, sort: f.sort,
  });
  const now = new Date();
  const from = filters.dueFrom ? new Date(`${filters.dueFrom}T00:00:00.000Z`) : undefined;
  const endExclusive = filters.dueTo ? new Date(`${filters.dueTo}T00:00:00.000Z`) : undefined;
  if (endExclusive) endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const upperBound = endExclusive && filters.overdue
    ? (endExclusive < now ? endExclusive : now)
    : endExclusive ?? (filters.overdue ? now : undefined);
  const hasDueFilter = !!from || !!upperBound;
  const assigneeFilter = filters.assigneeId === "unassigned"
    ? { assigneeId: null }
    : filters.assigneeId ? { assigneeId: filters.assigneeId } : undefined;
  const additionalFilters: Prisma.TaskWhereInput[] = [
    ...(f.mine ? [{ assigneeId: actor.id }] : []),
    ...(assigneeFilter ? [assigneeFilter] : []),
    ...(filters.overdue ? [{ status: { not: "COMPLETED" as const } }] : []),
  ];
  const where: Prisma.TaskWhereInput = {
    project: { ...accessibleProjectsWhere(actor), ...(f.projectId ? { id: f.projectId } : {}) },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
    ...(hasDueFilter ? { dueDate: { ...(from ? { gte: from } : {}), ...(upperBound ? { lt: upperBound } : {}) } } : {}),
    ...(additionalFilters.length > 0 ? { AND: additionalFilters } : {}),
  };
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    filters.sort === "priority" ? [{ priority: "desc" }, { dueDate: "asc" }] : filters.sort === "updated" ? [{ updatedAt: "desc" }] : [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  const take = f.take ?? PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.task.findMany({
      where, orderBy, skip: (Math.max(1, f.page ?? 1) - 1) * take, take,
      include: { project: { select: { id: true, title: true } }, assignee: { select: { id: true, name: true } }, milestone: { select: { title: true } } },
    }),
    prisma.task.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function listTaskAssignees(actor: Actor) {
  const members = await prisma.projectMember.findMany({
    where: { project: accessibleProjectsWhere(actor) },
    distinct: ["userId"],
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return members.map(({ user }) => user);
}

export async function getProjectWorkload(actor: Actor, projectId: string) {
  const { project } = await getProjectAccess(actor, projectId);
  const [members, groups] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { joinedAt: "asc" },
      select: { user: { select: { id: true, name: true } } },
    }),
    prisma.task.groupBy({
      by: ["assigneeId", "status"],
      where: { projectId },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map<string, { assigned: number; completed: number }>();
  const unassigned = { assigned: 0, completed: 0 };
  for (const group of groups) {
    const target = group.assigneeId === null
      ? unassigned
      : counts.get(group.assigneeId) ?? { assigned: 0, completed: 0 };
    target.assigned += group._count._all;
    if (group.status === "COMPLETED") target.completed += group._count._all;
    if (group.assigneeId !== null) counts.set(group.assigneeId, target);
  }
  const workloadMembers = members.map(({ user }) => {
    const stats = counts.get(user.id) ?? { assigned: 0, completed: 0 };
    return { ...user, ...stats, outstanding: stats.assigned - stats.completed };
  });
  return {
    projectId: project.id,
    members: workloadMembers,
    unassigned: { ...unassigned, outstanding: unassigned.assigned - unassigned.completed },
  };
}
