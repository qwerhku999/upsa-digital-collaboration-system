import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createMilestone } from "@/server/services/milestones";
import { addMemberByEmail, assignSupervisor } from "@/server/services/projects";
import { createTask, deleteTask, getProjectWorkload, listTaskAssignees, listTasks, setTaskStatus, updateTask } from "@/server/services/tasks";
import { makeProject, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const lead = await makeUser("STUDENT"); const member = await makeUser("STUDENT"); const outsider = await makeUser("STUDENT");
  const p = await makeProject(lead);
  await addMemberByEmail(lead, p.id, member.email);
  return { lead, member, outsider, p };
}

describe("task creation and assignment", () => {
  it("creates a task, assigns a member and notifies them", async () => {
    const { lead, member, p } = await setup();
    const t = await createTask(lead, p.id, { title: "Write chapter 1", description: "", priority: "HIGH", dueDate: "2030-01-01", assigneeId: member.id, milestoneId: "" });
    expect(t).toMatchObject({ assigneeId: member.id, priority: "HIGH", status: "TODO" });
    expect(await prisma.notification.count({ where: { userId: member.id, type: "TASK" } })).toBe(1);
    expect(await prisma.projectActivity.count({ where: { projectId: p.id, type: "task.created" } })).toBe(1);
  });
  it("rejects invalid input and assignees outside the project", async () => {
    const { lead, outsider, p } = await setup();
    await expect(createTask(lead, p.id, { title: "", priority: "LOW" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createTask(lead, p.id, { title: "X", assigneeId: outsider.id })).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("rejects a milestone from another project", async () => {
    const { lead, p } = await setup();
    const other = await makeProject(await makeUser("STUDENT"), "Other");
    const otherLead = (await prisma.projectMember.findFirstOrThrow({ where: { projectId: other.id } })).userId;
    const ms = await createMilestone({ id: otherLead, name: "x", email: "x", role: "STUDENT", mustChangePassword: false }, other.id, { title: "M1" });
    await expect(createTask(lead, p.id, { title: "X", milestoneId: ms.id })).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("only leaders assign tasks to other members", async () => {
    const { lead, member, p } = await setup();
    await expect(createTask(member, p.id, { title: "For the leader", assigneeId: lead.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await createTask(member, p.id, { title: "For me", assigneeId: member.id })).assigneeId).toBe(member.id);
  });
  it("allows assigned supervisors to create tasks, but blocks unrelated users", async () => {
    const { outsider, p, lead } = await setup();
    const admin = await makeUser("ADMIN"); const sup = await makeUser("SUPERVISOR"); const otherSup = await makeUser("SUPERVISOR");
    await assignSupervisor(admin, p.id, sup.id);
    const task = await createTask(sup, p.id, { title: "Supervisor-planned task", assigneeId: lead.id });
    expect(task).toMatchObject({ creatorId: sup.id, assigneeId: lead.id });
    const milestone = await createMilestone(sup, p.id, { title: "Supervisor-planned milestone" });
    expect(milestone.projectId).toBe(p.id);
    expect((await getProjectWorkload(sup, p.id)).members.map((m) => m.id)).toContain(lead.id);
    await expect(getProjectWorkload(otherSup, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createTask(otherSup, p.id, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createTask(outsider, p.id, { title: "X" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("task status, editing and filtering", () => {
  it("notifies the project group and assigned supervisor when task status changes", async () => {
    const { lead, member, p } = await setup();
    const admin = await makeUser("ADMIN");
    const supervisor = await makeUser("SUPERVISOR");
    await assignSupervisor(admin, p.id, supervisor.id);
    const task = await createTask(lead, p.id, { title: "Prepare presentation", assigneeId: member.id });

    await setTaskStatus(member, task.id, "IN_PROGRESS");

    const statusNotifications = await prisma.notification.findMany({
      where: { type: "TASK", title: "Task status updated" },
      select: { userId: true, projectId: true, link: true, message: true },
    });
    expect(statusNotifications).toHaveLength(2);
    expect(statusNotifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: lead.id, projectId: p.id, link: `/projects/${p.id}?tab=tasks`, message: '"Prepare presentation" is now in progress.' }),
      expect.objectContaining({ userId: supervisor.id, projectId: p.id, link: `/projects/${p.id}?tab=tasks`, message: '"Prepare presentation" is now in progress.' }),
    ]));
    expect(await prisma.notification.count({ where: { userId: member.id, type: "TASK", title: "Task status updated" } })).toBe(0);
  });

  it("lets the assignee (not other members) update status", async () => {
    const { lead, member, p } = await setup();
    const third = await makeUser("STUDENT"); await addMemberByEmail(lead, p.id, third.email);
    const t = await createTask(lead, p.id, { title: "T", assigneeId: member.id });
    await setTaskStatus(member, t.id, "IN_PROGRESS");
    await expect(setTaskStatus(third, t.id, "COMPLETED")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setTaskStatus(member, t.id, "COMPLETED");
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).completedAt).not.toBeNull();
    await expect(setTaskStatus(member, t.id, "BOGUS" as never)).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("hides other projects' tasks (not found)", async () => {
    const { lead, p, outsider } = await setup();
    const t = await createTask(lead, p.id, { title: "T" });
    await expect(setTaskStatus(outsider, t.id, "COMPLETED")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateTask(outsider, t.id, { title: "Hijacked" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteTask(outsider, t.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listTasks(outsider)).total).toBe(0);
  });
  it("finds overdue tasks and supports filters", async () => {
    const { lead, member, p } = await setup();
    await createTask(lead, p.id, { title: "Late", dueDate: "2000-01-01", assigneeId: member.id });
    await createTask(lead, p.id, { title: "Done late", dueDate: "2000-01-01" }).then((t) => setTaskStatus(lead, t.id, "COMPLETED"));
    await createTask(lead, p.id, { title: "Future", dueDate: "2999-01-01", priority: "HIGH" });
    expect((await listTasks(lead, { overdue: true })).items.map((t) => t.title)).toEqual(["Late"]);
    expect((await listTasks(lead, { priority: "HIGH" })).total).toBe(1);
    expect((await listTasks(member, { mine: true })).total).toBe(1);
    expect((await listTasks(lead, { projectId: p.id, status: "COMPLETED" })).total).toBe(1);
  });
  it("filters by assignee and inclusive due-date range, including unassigned tasks", async () => {
    const { lead, member, p } = await setup();
    const inRange = await createTask(lead, p.id, { title: "In range", dueDate: "2030-03-05", assigneeId: member.id, priority: "HIGH" });
    const completed = await createTask(lead, p.id, { title: "Range end", dueDate: "2030-03-10", assigneeId: member.id });
    await setTaskStatus(lead, completed.id, "COMPLETED");
    await createTask(lead, p.id, { title: "Unassigned", dueDate: "2030-03-07" });
    await createTask(lead, p.id, { title: "Outside range", dueDate: "2030-03-11", assigneeId: member.id });

    expect((await listTasks(lead, { assigneeId: member.id, dueFrom: "2030-03-01", dueTo: "2030-03-10" })).items.map((t) => t.id)).toEqual([inRange.id, completed.id]);
    expect((await listTasks(lead, { assigneeId: "unassigned" })).items.map((t) => t.title)).toEqual(["Unassigned"]);
    expect((await listTasks(lead, { dueFrom: "2030-03-06", dueTo: "2030-03-10" })).items.map((t) => t.title)).toEqual(["Unassigned", "Range end"]);
  });
  it("validates date filters and combines overdue with status filters", async () => {
    const { lead, member, p } = await setup();
    const late = await createTask(lead, p.id, { title: "Late", dueDate: "2000-01-01", assigneeId: member.id });
    await setTaskStatus(lead, late.id, "COMPLETED");
    await expect(listTasks(lead, { dueFrom: "2026-02-30" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(listTasks(lead, { dueFrom: "2030-02-01", dueTo: "2030-01-01" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listTasks(lead, { status: "COMPLETED", overdue: true })).total).toBe(0);
  });
  it("summarizes group workload from tasks and enforces project visibility", async () => {
    const { lead, member, outsider, p } = await setup();
    const done = await createTask(lead, p.id, { title: "Done", assigneeId: member.id });
    await setTaskStatus(lead, done.id, "COMPLETED");
    await createTask(lead, p.id, { title: "Outstanding", assigneeId: member.id });
    await createTask(lead, p.id, { title: "Unassigned" });

    const workload = await getProjectWorkload(lead, p.id);
    expect(workload.members).toContainEqual(expect.objectContaining({ id: lead.id, assigned: 0, completed: 0, outstanding: 0 }));
    expect(workload.members).toContainEqual(expect.objectContaining({ id: member.id, assigned: 2, completed: 1, outstanding: 1 }));
    expect(workload.unassigned).toEqual({ assigned: 1, completed: 0, outstanding: 1 });
    await expect(getProjectWorkload(outsider, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listTaskAssignees(outsider)).toEqual([]);
    expect(await listTaskAssignees(member)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lead.id }),
      expect.objectContaining({ id: member.id }),
    ]));
  });
  it("returns zeroed workload counts when a project has no tasks", async () => {
    const { lead, member, p } = await setup();
    const workload = await getProjectWorkload(lead, p.id);
    expect(workload.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lead.id, assigned: 0, completed: 0, outstanding: 0 }),
      expect.objectContaining({ id: member.id, assigned: 0, completed: 0, outstanding: 0 }),
    ]));
    expect(workload.unassigned).toEqual({ assigned: 0, completed: 0, outstanding: 0 });
  });
});
