"use server";

import { redirect } from "next/navigation";
import type { MilestoneStatus, TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { addFeedback } from "@/server/services/feedback";
import { createMilestone, deleteMilestone, setMilestoneStatus, updateMilestone } from "@/server/services/milestones";
import { markAllRead, markRead } from "@/server/services/notifications";
import { addVersion, createSubmission } from "@/server/services/submissions";
import { createTask, deleteTask, setTaskStatus, updateTask } from "@/server/services/tasks";
import { fields, guard, readFile, str, type ActionState } from "./_util";

const TASK_FIELDS = ["title", "description", "priority", "dueDate", "assigneeId", "milestoneId"];
const MILESTONE_FIELDS = ["title", "description", "dueDate"];

export async function createTaskAction(_: ActionState, fd: FormData) {
  return guard(async () => { await createTask(await requireUser(), str(fd, "projectId"), fields(fd, TASK_FIELDS)); return "Task created."; });
}
export async function updateTaskAction(_: ActionState, fd: FormData) {
  return guard(async () => { await updateTask(await requireUser(), str(fd, "taskId"), fields(fd, TASK_FIELDS)); return "Task updated."; });
}
export async function taskStatusAction(_: ActionState, fd: FormData) {
  return guard(async () => { await setTaskStatus(await requireUser(), str(fd, "taskId"), str(fd, "status") as TaskStatus); return "Status updated."; });
}
export async function deleteTaskAction(_: ActionState, fd: FormData) {
  return guard(async () => { await deleteTask(await requireUser(), str(fd, "taskId")); return "Task deleted."; });
}

export async function createMilestoneAction(_: ActionState, fd: FormData) {
  return guard(async () => { await createMilestone(await requireUser(), str(fd, "projectId"), fields(fd, MILESTONE_FIELDS)); return "Milestone added."; });
}
export async function updateMilestoneAction(_: ActionState, fd: FormData) {
  return guard(async () => { await updateMilestone(await requireUser(), str(fd, "milestoneId"), fields(fd, MILESTONE_FIELDS)); return "Milestone updated."; });
}
export async function milestoneStatusAction(_: ActionState, fd: FormData) {
  return guard(async () => { await setMilestoneStatus(await requireUser(), str(fd, "milestoneId"), str(fd, "status") as MilestoneStatus); return "Milestone updated."; });
}
export async function deleteMilestoneAction(_: ActionState, fd: FormData) {
  return guard(async () => { await deleteMilestone(await requireUser(), str(fd, "milestoneId")); return "Milestone deleted."; });
}

export async function createSubmissionAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const s = await createSubmission(await requireUser(), str(fd, "projectId"), fields(fd, ["title", "description", "note"]), await readFile(fd));
    redirect(`/submissions/${s.id}`);
  });
}
export async function addVersionAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await addVersion(await requireUser(), str(fd, "submissionId"), str(fd, "note") || null, await readFile(fd));
    return "New version uploaded.";
  });
}
export async function feedbackAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await addFeedback(await requireUser(), str(fd, "submissionId"), {
      body: str(fd, "body"),
      decision: str(fd, "decision") || "COMMENT",
      strengths: str(fd, "strengths"),
      areasForImprovement: str(fd, "areasForImprovement"),
      nextSteps: str(fd, "nextSteps"),
    });
    return "Feedback recorded.";
  });
}

export async function markReadAction(_: ActionState, fd: FormData) {
  return guard(async () => { await markRead(await requireUser(), str(fd, "id")); });
}
export async function markAllReadAction() {
  return guard(async () => { await markAllRead(await requireUser()); return "All notifications marked as read."; });
}
