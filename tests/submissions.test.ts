import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { addFeedback } from "@/server/services/feedback";
import { assignSupervisor } from "@/server/services/projects";
import { addVersion, createSubmission, getSubmission, getVersionDownload, listSubmissions } from "@/server/services/submissions";
import { deleteStoredFile } from "@/lib/storage";
import { makeProject, makeUser, pdf, resetDb } from "./helpers";

beforeEach(resetDb);

async function setup() {
  const lead = await makeUser("STUDENT"); const outsider = await makeUser("STUDENT");
  const sup = await makeUser("SUPERVISOR"); const otherSup = await makeUser("SUPERVISOR"); const admin = await makeUser("ADMIN");
  const p = await makeProject(lead);
  await assignSupervisor(admin, p.id, sup.id);
  return { lead, outsider, sup, otherSup, admin, p };
}
const meta = { title: "Proposal", description: "First draft", note: "" };

describe("document submission", () => {
  it("stores version 1, notifies the supervisor and logs activity", async () => {
    const { lead, sup, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    const v = await prisma.submissionVersion.findFirstOrThrow({ where: { submissionId: s.id } });
    expect(v.versionNumber).toBe(1);
    expect(v.storageKey).toMatch(/^[0-9a-f-]{36}\.pdf$/); // random server-generated name
    expect(await prisma.notification.count({ where: { userId: sup.id, type: "SUBMISSION" } })).toBe(1);
    expect(await prisma.projectActivity.count({ where: { type: "submission.created" } })).toBe(1);
  });
  it("rejects bad files and missing fields without creating records", async () => {
    const { lead, p } = await setup();
    await expect(createSubmission(lead, p.id, meta, { name: "x.exe", size: 2, buffer: Buffer.from("MZ") })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createSubmission(lead, p.id, meta, { name: "x.pdf", size: 5, buffer: Buffer.from("<html>") })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createSubmission(lead, p.id, { title: "", description: "" }, pdf())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await prisma.submission.count()).toBe(0);
  });
  it("only members of the project can submit; supervisors cannot", async () => {
    const { outsider, sup, p } = await setup();
    await expect(createSubmission(outsider, p.id, meta, pdf())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createSubmission(sup, p.id, meta, pdf())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("feedback and revisions", () => {
  it("runs the full review loop and preserves history", async () => {
    const { lead, sup, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    await expect(addVersion(lead, s.id, null, pdf())).rejects.toMatchObject({ code: "VALIDATION" }); // not before a revision request

    await addFeedback(sup, s.id, {
      body: "Please expand the methodology.",
      decision: "REVISION_REQUIRED",
      strengths: "The topic is relevant.",
      areasForImprovement: "Explain the sampling approach.",
      nextSteps: "Add a justified sample-size calculation.",
    });
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("REVISION_REQUIRED");
    expect(await prisma.notification.count({ where: { userId: lead.id, type: "REVISION" } })).toBe(1);

    const v2 = await addVersion(lead, s.id, "Expanded methodology", pdf("report-v2.pdf"));
    expect(v2.versionNumber).toBe(2);
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("SUBMITTED");

    await addFeedback(sup, s.id, { body: "Looks good.", decision: "ACCEPTED" });
    const { submission } = await getSubmission(lead, s.id);
    expect(submission.status).toBe("ACCEPTED");
    expect(submission.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(submission.feedback.map((f) => [f.version.versionNumber, f.decision])).toEqual([[1, "REVISION_REQUIRED"], [2, "ACCEPTED"]]);
    expect(submission.feedback[0]).toMatchObject({
      strengths: "The topic is relevant.",
      areasForImprovement: "Explain the sampling approach.",
      nextSteps: "Add a justified sample-size calculation.",
    });
    expect(await prisma.notification.count({ where: { userId: lead.id, type: "FEEDBACK" } })).toBe(1);
    await expect(addFeedback(sup, s.id, { body: "Trying to reopen", decision: "REVISION_REQUIRED" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(addVersion(lead, s.id, null, pdf())).rejects.toMatchObject({ code: "VALIDATION" });
    await addFeedback(sup, s.id, { body: "A follow-up comment", decision: "COMMENT" });
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("ACCEPTED");
  });
  it("lets students comment but never record a review decision", async () => {
    const { lead, sup, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    await expect(addFeedback(lead, s.id, { body: "Accept my work", decision: "ACCEPTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(addFeedback(lead, s.id, { body: "Comment", strengths: "A strength" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await addFeedback(lead, s.id, { body: "Question about scope", decision: "COMMENT" });
    expect(await prisma.notification.count({ where: { userId: sup.id, type: "FEEDBACK" } })).toBe(1);
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("SUBMITTED");
  });
  it("blocks unassigned supervisors and outsiders (not found), and admins cannot decide", async () => {
    const { lead, outsider, otherSup, admin, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    await expect(addFeedback(otherSup, s.id, { body: "Hi", decision: "ACCEPTED" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addFeedback(outsider, s.id, { body: "Hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addFeedback(admin, s.id, { body: "Hi", decision: "ACCEPTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSubmission(otherSup, s.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects empty feedback", async () => {
    const { lead, sup, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    await expect(addFeedback(sup, s.id, { body: "  ", decision: "COMMENT" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("file access", () => {
  it("serves files to members, the assigned supervisor and admins only", async () => {
    const { lead, outsider, sup, otherSup, admin, p } = await setup();
    const s = await createSubmission(lead, p.id, meta, pdf());
    const v = await prisma.submissionVersion.findFirstOrThrow({ where: { submissionId: s.id } });
    for (const who of [lead, sup, admin]) {
      const { stream } = await getVersionDownload(who, v.id);
      expect(await new Response(stream).text()).toContain("%PDF");
    }
    for (const who of [outsider, otherSup]) await expect(getVersionDownload(who, v.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listSubmissions(outsider)).total).toBe(0);
    expect((await listSubmissions(sup)).total).toBe(1);
    expect((await listSubmissions(otherSup)).total).toBe(0);
  });
  it("reports a missing stored file without exposing storage details", async () => {
    const { lead, p } = await setup();
    const submission = await createSubmission(lead, p.id, meta, pdf());
    const version = await prisma.submissionVersion.findFirstOrThrow({ where: { submissionId: submission.id } });
    await deleteStoredFile(version.storageKey);
    await expect(getVersionDownload(lead, version.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "The stored file is missing.",
    });
  });
});
