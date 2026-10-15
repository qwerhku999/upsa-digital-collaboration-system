import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createMeeting, listMeetings } from "@/server/services/meetings";
import { assignSupervisor } from "@/server/services/projects";
import { makeProject, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const lead = await makeUser("STUDENT");
  const member = await makeUser("STUDENT");
  const outsider = await makeUser("STUDENT");
  const supervisor = await makeUser("SUPERVISOR");
  const admin = await makeUser("ADMIN");
  const project = await makeProject(lead);
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: "MEMBER" } });
  await assignSupervisor(admin, project.id, supervisor.id);
  return { lead, member, outsider, supervisor, admin, project };
}

const input = {
  meetingAt: "2026-10-15T10:30",
  summary: "Reviewed the research scope and agreed on the next draft.",
  actionItems: "Student: refine research questions.\nSupervisor: share two methodology examples.",
};

describe("supervision meeting records", () => {
  it("records a meeting, logs activity, and notifies other project participants", async () => {
    const { lead, member, outsider, supervisor, project } = await setup();
    const meeting = await createMeeting(supervisor, project.id, input);

    expect(meeting).toMatchObject({
      projectId: project.id,
      recordedById: supervisor.id,
      summary: input.summary,
      actionItems: input.actionItems,
    });
    expect((await listMeetings(lead, project.id)).map((row) => row.id)).toEqual([meeting.id]);
    expect(await prisma.projectActivity.count({ where: { projectId: project.id, type: "meeting.recorded" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: lead.id, type: "PROJECT" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: member.id, type: "PROJECT" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: supervisor.id, type: "PROJECT" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: outsider.id, type: "PROJECT" } })).toBe(0);
  });

  it("allows authorized students to read but not create meeting records", async () => {
    const { lead, member, outsider, supervisor, project } = await setup();
    await createMeeting(supervisor, project.id, input);

    expect(await listMeetings(member, project.id)).toHaveLength(1);
    await expect(createMeeting(member, project.id, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listMeetings(outsider, project.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createMeeting(outsider, project.id, input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createMeeting(lead, project.id, input)).resolves.toMatchObject({ projectId: project.id });
  });

  it("rejects invalid dates and missing summaries without creating records", async () => {
    const { supervisor, project } = await setup();
    await expect(createMeeting(supervisor, project.id, { ...input, meetingAt: "2026-02-30T10:30" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createMeeting(supervisor, project.id, { ...input, summary: " " })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.supervisionMeeting.count()).toBe(0);
  });

  it("returns an empty history for an authorized project with no meeting records", async () => {
    const { lead, project } = await setup();
    await expect(listMeetings(lead, project.id)).resolves.toEqual([]);
  });
});
