import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createMilestone, setMilestoneStatus } from "@/server/services/milestones";
import { listProjects, addMemberByEmail, assignSupervisor, createProject, createProjectCategory, getProject, joinByCode, removeMember, transitionProject, updateProject } from "@/server/services/projects";
import { createTask, setTaskStatus } from "@/server/services/tasks";
import { makeProject, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

describe("project creation and membership", () => {
  it("lets a student create a project and become its leader", async () => {
    const s = await makeUser("STUDENT");
    const p = await makeProject(s);
    const m = await prisma.projectMember.findFirstOrThrow({ where: { projectId: p.id } });
    expect(m).toMatchObject({ userId: s.id, role: "LEADER" });
    expect(p.status).toBe("PLANNING");
  });
  it("rejects invalid input and non-students", async () => {
    const s = await makeUser("STUDENT");
    await expect(createProject(s, { title: "", description: "x" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createProject(await makeUser("SUPERVISOR"), { title: "T", description: "D" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("lets administrators create categories while students own their project topics", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    const category = await createProjectCategory(admin, { name: "Information Systems", academicPeriod: "2026/2027 Semester 1" });
    expect(category).toMatchObject({ name: "Information Systems", academicPeriod: "2026/2027 Semester 1" });
    expect(await prisma.auditLog.count({ where: { action: "project_category.created", entityId: category.id } })).toBe(1);
    await expect(createProjectCategory(admin, { name: category.name, academicPeriod: category.academicPeriod })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createProjectCategory(student, { name: "Information Systems", academicPeriod: "2027/2028 Semester 1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createProject(admin, { title: "Admin-assigned topic", description: "Admin-authored topic" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const project = await createProject(student, {
      title: "Student's independent research topic",
      description: "A topic chosen and described by the student.",
      categoryId: category.id,
    });
    expect(project).toMatchObject({
      title: "Student's independent research topic",
      categoryId: category.id,
      academicPeriod: category.academicPeriod,
      supervisorId: null,
    });
    expect(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: student.id } } })).toMatchObject({ role: "LEADER" });
  });
  it("does not let students assign a supervisor even if they submit a supervisor id", async () => {
    const student = await makeUser("STUDENT");
    const supervisor = await makeUser("SUPERVISOR");
    const project = await createProject(student, {
      title: "Student project", description: "Project description", supervisorId: supervisor.id,
    });
    expect(project.supervisorId).toBeNull();
    expect(await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: student.id } } })).toMatchObject({ role: "LEADER" });
  });
  it("prevents duplicate membership and adding non-students", async () => {
    const lead = await makeUser("STUDENT"); const other = await makeUser("STUDENT"); const sup = await makeUser("SUPERVISOR");
    const p = await makeProject(lead);
    await addMemberByEmail(lead, p.id, other.email);
    await expect(addMemberByEmail(lead, p.id, other.email)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(addMemberByEmail(lead, p.id, sup.email)).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.projectMember.count({ where: { projectId: p.id } })).toBe(2);
  });
  it("lets a student join with the code, and a plain member cannot add people", async () => {
    const lead = await makeUser("STUDENT"); const joiner = await makeUser("STUDENT"); const third = await makeUser("STUDENT");
    const p = await makeProject(lead);
    await expect(joinByCode(joiner, "WRONGCODE")).rejects.toMatchObject({ code: "VALIDATION" });
    await joinByCode(joiner, p.joinCode.toLowerCase());
    await expect(addMemberByEmail(joiner, p.id, third.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps at least one leader and unassigns tasks of removed members", async () => {
    const lead = await makeUser("STUDENT"); const m = await makeUser("STUDENT");
    const p = await makeProject(lead);
    await addMemberByEmail(lead, p.id, m.email);
    await expect(removeMember(lead, p.id, lead.id)).rejects.toMatchObject({ code: "VALIDATION" });
    const t = await prisma.task.create({ data: { projectId: p.id, title: "T", creatorId: lead.id, assigneeId: m.id } });
    await removeMember(lead, p.id, m.id);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t.id } })).assigneeId).toBeNull();
  });
});

describe("access control (no IDOR)", () => {
  it("hides a project from unrelated students (reported as not found)", async () => {
    const owner = await makeUser("STUDENT"); const outsider = await makeUser("STUDENT");
    const p = await makeProject(owner);
    await expect(getProject(outsider, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateProject(outsider, p.id, { title: "Hacked", description: "x" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listProjects(outsider)).total).toBe(0);
    expect((await listProjects(owner)).total).toBe(1);
  });
  it("does not let administrators edit topics, assign students, or access student join codes", async () => {
    const lead = await makeUser("STUDENT");
    const admin = await makeUser("ADMIN");
    const other = await makeUser("STUDENT");
    const p = await makeProject(lead);
    await expect(updateProject(admin, p.id, { title: "Admin-assigned topic", description: "Changed by admin" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addMemberByEmail(admin, p.id, other.email)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await getProject(admin, p.id)).project.joinCode).toBeNull();
    expect((await getProject(lead, p.id)).project.joinCode).toBe(p.joinCode);
  });
  it("gives supervisors access only to assigned projects", async () => {
    const lead = await makeUser("STUDENT"); const admin = await makeUser("ADMIN");
    const sup = await makeUser("SUPERVISOR"); const otherSup = await makeUser("SUPERVISOR");
    const p = await makeProject(lead);
    await expect(getProject(sup, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await assignSupervisor(admin, p.id, sup.id);
    expect((await getProject(sup, p.id)).level).toBe("SUPERVISOR");
    await expect(getProject(otherSup, p.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listProjects(sup)).total).toBe(1);
    expect((await listProjects(otherSup)).total).toBe(0);
  });
  it("lets only administrators assign supervisors, and only to real supervisors", async () => {
    const lead = await makeUser("STUDENT"); const admin = await makeUser("ADMIN"); const sup = await makeUser("SUPERVISOR"); const other = await makeUser("STUDENT");
    const p = await makeProject(lead);
    await expect(assignSupervisor(lead, p.id, sup.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assignSupervisor(sup, p.id, sup.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assignSupervisor(admin, p.id, other.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await assignSupervisor(admin, p.id, sup.id);
    expect((await prisma.notification.count({ where: { userId: sup.id, type: "MEMBERSHIP" } }))).toBe(1);
    expect((await prisma.auditLog.count({ where: { action: "project.supervisor_assigned" } }))).toBe(1);
  });
});

describe("project lifecycle", () => {
  it("follows the allowed workflow and requires a supervisor for review", async () => {
    const lead = await makeUser("STUDENT"); const admin = await makeUser("ADMIN"); const sup = await makeUser("SUPERVISOR");
    const p = await makeProject(lead);
    await expect(transitionProject(lead, p.id, "COMPLETED")).rejects.toMatchObject({ code: "VALIDATION" });
    await transitionProject(lead, p.id, "IN_PROGRESS");
    await expect(transitionProject(lead, p.id, "UNDER_REVIEW")).rejects.toMatchObject({ code: "VALIDATION" }); // no supervisor yet
    await assignSupervisor(admin, p.id, sup.id);
    await transitionProject(lead, p.id, "UNDER_REVIEW");
    await expect(transitionProject(lead, p.id, "COMPLETED")).rejects.toMatchObject({ code: "FORBIDDEN" }); // students cannot complete
    await transitionProject(sup, p.id, "COMPLETED");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).completedAt).not.toBeNull();
  });
  it("reports task and milestone progress as separate real-record metrics", async () => {
    const leader = await makeUser("STUDENT");
    const project = await makeProject(leader);
    const completedTask = await createTask(leader, project.id, { title: "Complete chapter" });
    await createTask(leader, project.id, { title: "Review chapter" });
    await setTaskStatus(leader, completedTask.id, "COMPLETED");
    const completedMilestone = await createMilestone(leader, project.id, { title: "Research" });
    await createMilestone(leader, project.id, { title: "Writing" });
    await setMilestoneStatus(leader, completedMilestone.id, "COMPLETED");

    const listed = (await listProjects(leader)).items[0];
    expect(listed.stats).toMatchObject({
      tasksTotal: 2, tasksDone: 1, taskPercent: 50,
      milestonesTotal: 2, milestonesDone: 1, milestonePercent: 50,
    });
  });
});
