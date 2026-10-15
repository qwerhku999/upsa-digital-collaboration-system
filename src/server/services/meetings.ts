import { forbidden } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { parse, supervisionMeetingSchema } from "@/server/validation";
import { getProjectAccess, type Actor } from "./access";
import { logActivity } from "./activity";
import { notify, projectRecipients } from "./notifications";

export async function listMeetings(actor: Actor, projectId: string) {
  await getProjectAccess(actor, projectId);
  return prisma.supervisionMeeting.findMany({
    where: { projectId },
    orderBy: [{ meetingAt: "desc" }, { createdAt: "desc" }],
    include: { recordedBy: { select: { name: true } } },
  });
}

export async function createMeeting(actor: Actor, projectId: string, input: unknown) {
  const data = parse(supervisionMeetingSchema, input);
  const { project, level } = await getProjectAccess(actor, projectId);
  if (level === "MEMBER") throw forbidden("Only project leaders, supervisors, or administrators can record supervision meetings.");

  return prisma.$transaction(async (tx) => {
    const meeting = await tx.supervisionMeeting.create({
      data: { ...data, projectId, recordedById: actor.id },
    });
    await logActivity(tx, projectId, actor.id, "meeting.recorded", `${actor.name} recorded a supervision meeting for "${project.title}".`);
    const recipients = await projectRecipients(tx, projectId, actor.id);
    await notify(tx, recipients, {
      type: "PROJECT",
      projectId,
      link: `/projects/${projectId}?tab=meetings`,
      title: "Supervision meeting recorded",
      message: `A supervision meeting was recorded for "${project.title}".`,
    });
    return meeting;
  });
}
