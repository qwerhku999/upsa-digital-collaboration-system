import { forbidden, invalid, notFound } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { feedbackSchema, parse } from "@/server/validation";
import { accessibleProjectsWhere, getProjectAccess, type Actor } from "./access";
import { logActivity } from "./activity";
import { notify } from "./notifications";

/**
 * Supervisors record a review decision (comment / revision required / accepted). It is the supervisor's
 * human judgement; the system never generates or grades. Students and administrators can only comment.
 * Decisions apply to the latest version only, so older versions keep their history untouched.
 */
export async function addFeedback(actor: Actor, submissionId: string, input: unknown) {
  const d = parse(feedbackSchema, input);
  const sub = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  if (!sub) throw notFound("Submission not found.");
  const { project, level } = await getProjectAccess(actor, sub.projectId);
  const latest = sub.versions[0];
  if (!latest) throw invalid("This submission has no file version.");
  const hasStructuredFeedback = Boolean(d.strengths || d.areasForImprovement || d.nextSteps);
  if (hasStructuredFeedback && level !== "SUPERVISOR") throw forbidden("Only the assigned supervisor can provide structured review feedback.");
  const isDecision = d.decision !== "COMMENT";
  if (isDecision && level !== "SUPERVISOR") throw forbidden("Only the assigned supervisor can record a review decision.");
  if (isDecision && sub.status !== "SUBMITTED") throw invalid("A decision can only be recorded while the latest version is awaiting review.");

  return prisma.$transaction(async (tx) => {
    const fb = await tx.feedback.create({
      data: {
        submissionId,
        versionId: latest.id,
        authorId: actor.id,
        decision: d.decision,
        body: d.body,
        strengths: d.strengths,
        areasForImprovement: d.areasForImprovement,
        nextSteps: d.nextSteps,
      },
    });
    if (isDecision) {
      await tx.submission.update({ where: { id: submissionId }, data: { status: d.decision === "ACCEPTED" ? "ACCEPTED" : "REVISION_REQUIRED" } });
    }
    const label = d.decision === "REVISION_REQUIRED" ? "requested a revision of" : d.decision === "ACCEPTED" ? "accepted" : "commented on";
    await logActivity(tx, sub.projectId, actor.id, "feedback.added", `${actor.name} ${label} "${sub.title}" (version ${latest.versionNumber}).`);
    const toSupervisor = level !== "SUPERVISOR";
    const recipients = toSupervisor
      ? project.supervisorId ? [project.supervisorId] : []
      : project.members.map((m) => m.userId);
    await notify(tx, recipients.filter((id) => id !== actor.id), {
      type: d.decision === "REVISION_REQUIRED" ? "REVISION" : "FEEDBACK", projectId: sub.projectId, link: `/submissions/${submissionId}`,
      title: d.decision === "REVISION_REQUIRED" ? "Revision requested" : "New feedback",
      message: `${actor.name} ${label} "${sub.title}".`,
    });
    return fb;
  });
}

export async function listRecentFeedback(actor: Actor, take = 20) {
  return prisma.feedback.findMany({
    where: { submission: { project: accessibleProjectsWhere(actor) } },
    orderBy: { createdAt: "desc" },
    take,
    include: { author: { select: { name: true, role: true } }, submission: { select: { id: true, title: true, project: { select: { title: true } } } }, version: { select: { versionNumber: true } } },
  });
}
