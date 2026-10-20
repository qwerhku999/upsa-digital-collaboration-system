import { prisma } from "@/lib/prisma";
import { accessibleProjectsWhere, type Actor } from "./access";
import { unreadCount } from "./notifications";

/** Every number below is computed from database rows visible to this user. */
export async function getDashboard(actor: Actor) {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86_400_000);
  const project = accessibleProjectsWhere(actor);
  const taskScope = { project, ...(actor.role === "STUDENT" ? { assigneeId: actor.id } : {}) };

  const [projectsTotal, projectsCompleted, taskGroups, overdue, upcomingTasks, upcomingMilestones, milestoneGroups, pendingReviews, recentFeedback, unread] = await Promise.all([
    prisma.project.count({ where: project }),
    prisma.project.count({ where: { ...project, status: "COMPLETED" } }),
    prisma.task.groupBy({ by: ["status"], where: taskScope, _count: { _all: true } }),
    prisma.task.count({ where: { ...taskScope, status: { not: "COMPLETED" }, dueDate: { lt: now } } }),
    prisma.task.findMany({ where: { ...taskScope, status: { not: "COMPLETED" }, dueDate: { gte: now, lte: in14 } }, orderBy: { dueDate: "asc" }, take: 6, include: { project: { select: { id: true, title: true } } } }),
    prisma.milestone.findMany({ where: { project, status: { not: "COMPLETED" }, dueDate: { not: null, lte: in14 } }, orderBy: { dueDate: "asc" }, take: 6, include: { project: { select: { id: true, title: true } } } }),
    prisma.milestone.groupBy({ by: ["status"], where: { project }, _count: { _all: true } }),
    actor.role === "ADMIN" ? 0 : prisma.submission.count({ where: { project, status: "SUBMITTED" } }),
    actor.role === "ADMIN" ? [] : prisma.feedback.findMany({
      where: { submission: { project } }, orderBy: { createdAt: "desc" }, take: 5,
      include: { author: { select: { name: true } }, submission: { select: { id: true, title: true } } },
    }),
    unreadCount(actor),
  ]);
  const count = <T extends string>(rows: { status: T; _count: { _all: number } }[], s: T) => rows.find((r) => r.status === s)?._count._all ?? 0;

  const base = {
    projectsTotal, projectsActive: projectsTotal - projectsCompleted,
    tasks: { todo: count(taskGroups, "TODO"), inProgress: count(taskGroups, "IN_PROGRESS"), inReview: count(taskGroups, "IN_REVIEW"), completed: count(taskGroups, "COMPLETED"), overdue },
    milestones: { notStarted: count(milestoneGroups, "NOT_STARTED"), inProgress: count(milestoneGroups, "IN_PROGRESS"), completed: count(milestoneGroups, "COMPLETED") },
    upcomingTasks, upcomingMilestones, pendingReviews, recentFeedback, unread,
  };
  if (actor.role !== "ADMIN") return { ...base, admin: null };

  const [usersByRole, inactiveUsers, unassigned, projectsByStatus, recentAudit] = await Promise.all([
    prisma.user.groupBy({ by: ["role"], where: { active: true }, _count: { _all: true } }),
    prisma.user.count({ where: { active: false } }),
    prisma.project.count({ where: { supervisorId: null, status: { not: "COMPLETED" } } }),
    prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { name: true } } } }),
  ]);
  return { ...base, admin: { usersByRole, inactiveUsers, unassigned, projectsByStatus, recentAudit } };
}
