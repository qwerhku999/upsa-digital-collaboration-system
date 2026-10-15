import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createSessionRecord, findSessionUser } from "@/lib/session-store";
import { createUser, listUsers, resetUserPassword, setUserActive, setUserRole } from "@/server/services/admin";
import { authenticate } from "@/server/services/auth";
import { getDashboard } from "@/server/services/dashboard";
import { createMilestone, setMilestoneStatus } from "@/server/services/milestones";
import { listNotifications, markAllRead, markRead, syncDeadlineNotifications, unreadCount } from "@/server/services/notifications";
import { addMemberByEmail, assignSupervisor } from "@/server/services/projects";
import { projectReport, projectReportCsv } from "@/server/services/reports";
import { listAudit } from "@/server/services/audit";
import { createTask, setTaskStatus } from "@/server/services/tasks";
import { makeProject, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("notifications", () => {
  it("are private to their recipient and can be marked read", async () => {
    const lead = await makeUser("STUDENT"); const member = await makeUser("STUDENT"); const other = await makeUser("STUDENT");
    const p = await makeProject(lead);
    await addMemberByEmail(lead, p.id, member.email);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: member.id } });
    await markRead(other, n.id); // someone else's notification: silently no effect
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).toBeNull();
    expect((await listNotifications(other)).total).toBe(0);
    expect(await unreadCount(member)).toBeGreaterThan(0);
    await markRead(member, n.id);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: n.id } })).readAt).not.toBeNull();
    await markAllRead(member);
    expect(await unreadCount(member)).toBe(0);
  });
  it("generates deadline reminders once, from real due dates", async () => {
    const lead = await makeUser("STUDENT"); const p = await makeProject(lead);
    const t = await createTask(lead, p.id, { title: "Late task", dueDate: "2000-01-01", assigneeId: lead.id });
    await createTask(lead, p.id, { title: "Far future", dueDate: "2999-01-01", assigneeId: lead.id });
    await createMilestone(lead, p.id, { title: "Old milestone", dueDate: "2000-01-02" });
    expect(await syncDeadlineNotifications(lead)).toBe(2);
    expect(await syncDeadlineNotifications(lead)).toBe(0); // idempotent
    expect(await prisma.notification.count({ where: { userId: lead.id, type: "DEADLINE" } })).toBe(2);
    await setTaskStatus(lead, t.id, "COMPLETED");
  });
  it("notifies the group when a milestone changes", async () => {
    const lead = await makeUser("STUDENT"); const member = await makeUser("STUDENT"); const p = await makeProject(lead);
    await addMemberByEmail(lead, p.id, member.email);
    const m = await createMilestone(lead, p.id, { title: "Design" });
    await setMilestoneStatus(lead, m.id, "COMPLETED");
    expect(await prisma.notification.count({ where: { userId: member.id, type: "MILESTONE" } })).toBe(2);
    await expect(setMilestoneStatus(member, m.id, "IN_PROGRESS")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("administration is enforced on the server", () => {
  it("blocks students and supervisors from every admin function", async () => {
    const student = await makeUser("STUDENT"); const sup = await makeUser("SUPERVISOR"); const target = await makeUser("STUDENT");
    for (const who of [student, sup]) {
      await expect(listUsers(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(createUser(who, { name: "Bad Actor", email: "bad@test.example", role: "ADMIN", password: "Password123!" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setUserRole(who, target.id, "ADMIN")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setUserActive(who, target.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(resetUserPassword(who, target.id, "Password123!")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listAudit(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(assignSupervisor(who, "x", sup.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role).toBe("STUDENT");
  });
  it("provisions accounts that must change their password, and audits it", async () => {
    const admin = await makeUser("ADMIN");
    const u = await createUser(admin, { name: "New Supervisor", email: "Sup@Test.Example", role: "SUPERVISOR", password: "Temp-password-1" });
    const login = await authenticate({ email: "sup@test.example", password: "Temp-password-1" });
    expect(login).toMatchObject({ id: u.id, role: "SUPERVISOR", mustChangePassword: true });
    expect(await prisma.auditLog.count({ where: { action: "user.created", actorId: admin.id } })).toBe(1);
  });
  it("deactivation signs the user out immediately; admins cannot lock themselves out", async () => {
    const admin = await makeUser("ADMIN"); const student = await makeUser("STUDENT");
    const { token } = await createSessionRecord(student.id);
    await setUserActive(admin, student.id, false);
    expect(await findSessionUser(token)).toBeNull();
    await expect(authenticate({ email: student.email, password: "Password123!" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(setUserActive(admin, admin.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setUserRole(admin, admin.id, "STUDENT")).rejects.toMatchObject({ code: "VALIDATION" });
    const second = await makeUser("ADMIN");
    await setUserActive(second, admin.id, false); // allowed: another admin remains
    await expect(setUserActive(second, admin.id, true)).resolves.toBeUndefined();
  });
  it("protects the last administrator and project memberships when changing roles", async () => {
    const admin = await makeUser("ADMIN"); const lead = await makeUser("STUDENT");
    await makeProject(lead);
    await expect(setUserRole(admin, lead.id, "SUPERVISOR")).rejects.toMatchObject({ code: "VALIDATION" });
    const second = await makeUser("ADMIN");
    await setUserRole(admin, second.id, "SUPERVISOR"); // allowed: `admin` remains an administrator
    // `admin` is now the only active administrator, so deactivating them (by anyone) must be refused.
    await expect(setUserActive({ ...second, role: "ADMIN" }, admin.id, false)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("dashboard and reports use real data", () => {
  it("counts only what the user may see", async () => {
    const lead = await makeUser("STUDENT"); const outsider = await makeUser("STUDENT"); const admin = await makeUser("ADMIN"); const sup = await makeUser("SUPERVISOR");
    const p = await makeProject(lead);
    await assignSupervisor(admin, p.id, sup.id);
    const t1 = await createTask(lead, p.id, { title: "A", assigneeId: lead.id, dueDate: "2000-01-01" });
    const t2 = await createTask(lead, p.id, { title: "B", assigneeId: lead.id });
    await setTaskStatus(lead, t2.id, "COMPLETED"); await setTaskStatus(lead, t1.id, "IN_PROGRESS");

    const mine = await getDashboard(lead);
    expect(mine).toMatchObject({ projectsTotal: 1, tasks: { completed: 1, inProgress: 1, overdue: 1 } });
    expect(await getDashboard(outsider)).toMatchObject({ projectsTotal: 0, tasks: { completed: 0, overdue: 0 } });
    const adminView = await getDashboard(admin);
    expect(adminView.admin?.usersByRole.find((r) => r.role === "STUDENT")?._count._all).toBe(2);
    expect((await getDashboard(sup)).projectsTotal).toBe(1);
  });
  it("limits reports to supervisors/admins and neutralises CSV formulas", async () => {
    const lead = await makeUser("STUDENT"); const admin = await makeUser("ADMIN"); const sup = await makeUser("SUPERVISOR"); const other = await makeUser("SUPERVISOR");
    const p = await makeProject(lead, "=HYPERLINK(\"http://evil\")");
    await assignSupervisor(admin, p.id, sup.id);
    await expect(projectReport(lead)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await projectReport(other)).toHaveLength(0);
    const csv = await projectReportCsv(sup);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv.split("\r\n")[0]).toContain("Project");
  });
});
