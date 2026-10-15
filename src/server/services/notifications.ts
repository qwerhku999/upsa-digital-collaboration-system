import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { accessibleProjectsWhere, type Actor } from "./access";
import { PAGE_SIZE, paginate } from "./audit";
import type { Db } from "./db";

type NewNotification = { type: NotificationType; title: string; message: string; link?: string; projectId?: string; dedupeKey?: string };

export async function notify(db: Db, userIds: string[], n: NewNotification) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, type: n.type, title: n.title, message: n.message, link: n.link, projectId: n.projectId, dedupeKey: n.dedupeKey })),
    skipDuplicates: true,
  });
}

/** Members + supervisor of a project, optionally excluding the person who caused the event. */
export async function projectRecipients(db: Db, projectId: string, excludeUserId?: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { supervisorId: true, members: { select: { userId: true } } } });
  if (!p) return [];
  const ids = [...p.members.map((m) => m.userId), ...(p.supervisorId ? [p.supervisorId] : [])];
  return ids.filter((id) => id !== excludeUserId);
}

export async function listNotifications(actor: Actor, opts: { unreadOnly?: boolean; page?: number } = {}) {
  const where: Prisma.NotificationWhereInput = { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(opts.page ?? 1) }),
    prisma.notification.count({ where }),
  ]);
  return { items, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export const unreadCount = (actor: Actor) => prisma.notification.count({ where: { userId: actor.id, readAt: null } });

/** Scoped to the caller's own rows: a user can never mark someone else's notification. */
export async function markRead(actor: Actor, id: string) {
  await prisma.notification.updateMany({ where: { id, userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}
export async function markAllRead(actor: Actor) {
  await prisma.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
}

/**
 * Deadline reminders are generated on the server from real task/milestone dates (never in the browser).
 * Called when a user opens their dashboard/notifications; the dedupe key makes it idempotent. With no
 * background scheduler locally, reminders appear the next time the person signs in and views the app.
 */
export async function syncDeadlineNotifications(actor: Actor, now = new Date()) {
  if (actor.role === "ADMIN") return 0;
  const soon = new Date(now.getTime() + 48 * 3600_000);
  const project = accessibleProjectsWhere(actor);
  const [tasks, milestones] = await Promise.all([
    prisma.task.findMany({
      where: { project, status: { not: "COMPLETED" }, dueDate: { not: null, lte: soon }, ...(actor.role === "STUDENT" ? { assigneeId: actor.id } : {}) },
      select: { id: true, title: true, dueDate: true, projectId: true },
      take: 200,
    }),
    prisma.milestone.findMany({
      where: { project, status: { not: "COMPLETED" }, dueDate: { not: null, lte: soon } },
      select: { id: true, title: true, dueDate: true, projectId: true },
      take: 200,
    }),
  ]);
  const rows = [
    ...tasks.map((t) => ({ kind: "Task", slug: "task", ...t })),
    ...milestones.map((m) => ({ kind: "Milestone", slug: "milestone", ...m })),
  ].map((x) => {
    const overdue = (x.dueDate as Date) < now;
    return {
      userId: actor.id,
      projectId: x.projectId,
      type: "DEADLINE" as const,
      title: overdue ? `${x.kind} overdue` : `${x.kind} due soon`,
      message: `"${x.title}" ${overdue ? "was due" : "is due"} ${(x.dueDate as Date).toLocaleDateString("en-GB")}.`,
      link: `/projects/${x.projectId}`,
      dedupeKey: `${x.slug}-${overdue ? "overdue" : "soon"}:${x.id}`,
    };
  });
  if (rows.length === 0) return 0;
  const res = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  return res.count;
}
