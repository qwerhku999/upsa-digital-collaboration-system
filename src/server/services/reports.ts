import { forbidden } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/csv";
import { accessibleProjectsWhere, type Actor } from "./access";
import { projectStats } from "./stats";

/** Supervisor/admin overview: one row per project the actor may see, from real records. */
export async function projectReport(actor: Actor) {
  if (actor.role === "STUDENT") throw forbidden("Reports are available to supervisors and administrators.");
  const projects = await prisma.project.findMany({
    where: accessibleProjectsWhere(actor),
    orderBy: { title: "asc" },
    include: { supervisor: { select: { name: true } }, _count: { select: { members: true } } },
  });
  const stats = await projectStats(projects.map((p) => p.id));
  return projects.map((p) => ({ project: p, stats: stats.get(p.id)! }));
}

export async function projectReportCsv(actor: Actor): Promise<string> {
  const rows = await projectReport(actor);
  const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return toCsv([
    ["Project", "Status", "Supervisor", "Members", "Due date", "Tasks total", "Tasks completed", "Tasks overdue", "Task completion %", "Milestones total", "Milestones completed", "Submissions awaiting review"],
    ...rows.map(({ project: p, stats: s }) => [p.title, p.status, p.supervisor?.name ?? "", p._count.members, fmt(p.dueDate), s.tasksTotal, s.tasksDone, s.tasksOverdue, s.taskPercent ?? "", s.milestonesTotal, s.milestonesDone, s.pendingReviews]),
  ]);
}
