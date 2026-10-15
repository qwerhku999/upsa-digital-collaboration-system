import { prisma } from "@/lib/prisma";
import { percent } from "@/lib/progress";

export type ProjectStats = {
  tasksTotal: number; tasksDone: number; tasksInProgress: number; tasksOverdue: number;
  milestonesTotal: number; milestonesDone: number; pendingReviews: number;
  taskPercent: number | null; milestonePercent: number | null;
};

/**
 * Progress = recorded tasks completed / recorded tasks, and milestones completed / milestones.
 * It measures activity recorded in the system, NOT the academic quality of the work.
 */
export async function projectStats(projectIds: string[], now = new Date()): Promise<Map<string, ProjectStats>> {
  const out = new Map<string, ProjectStats>();
  for (const id of projectIds) {
    out.set(id, { tasksTotal: 0, tasksDone: 0, tasksInProgress: 0, tasksOverdue: 0, milestonesTotal: 0, milestonesDone: 0, pendingReviews: 0, taskPercent: null, milestonePercent: null });
  }
  if (projectIds.length === 0) return out;
  const inIds = { in: projectIds };
  const [tasks, overdue, milestones, pending] = await Promise.all([
    prisma.task.groupBy({ by: ["projectId", "status"], where: { projectId: inIds }, _count: { _all: true } }),
    prisma.task.groupBy({ by: ["projectId"], where: { projectId: inIds, status: { not: "COMPLETED" }, dueDate: { lt: now } }, _count: { _all: true } }),
    prisma.milestone.groupBy({ by: ["projectId", "status"], where: { projectId: inIds }, _count: { _all: true } }),
    prisma.submission.groupBy({ by: ["projectId"], where: { projectId: inIds, status: "SUBMITTED" }, _count: { _all: true } }),
  ]);
  for (const t of tasks) {
    const s = out.get(t.projectId); if (!s) continue;
    s.tasksTotal += t._count._all;
    if (t.status === "COMPLETED") s.tasksDone += t._count._all;
    if (t.status === "IN_PROGRESS") s.tasksInProgress += t._count._all;
  }
  for (const o of overdue) { const s = out.get(o.projectId); if (s) s.tasksOverdue = o._count._all; }
  for (const m of milestones) {
    const s = out.get(m.projectId); if (!s) continue;
    s.milestonesTotal += m._count._all;
    if (m.status === "COMPLETED") s.milestonesDone += m._count._all;
  }
  for (const p of pending) { const s = out.get(p.projectId); if (s) s.pendingReviews = p._count._all; }
  for (const s of out.values()) {
    s.taskPercent = percent(s.tasksDone, s.tasksTotal);
    s.milestonePercent = percent(s.milestonesDone, s.milestonesTotal);
  }
  return out;
}
