"use server";

import { requireUser } from "@/lib/auth";
import { createMeeting } from "@/server/services/meetings";
import { fields, guard, str, type ActionState } from "./_util";

export async function createMeetingAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await createMeeting(await requireUser(), str(fd, "projectId"), fields(fd, ["meetingAt", "summary", "actionItems"]));
    return "Meeting record saved.";
  });
}
