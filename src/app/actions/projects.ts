"use server";

import { redirect } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { addMemberByEmail, assignSupervisor, createProject, createProjectCategory, deleteProject, joinByCode, removeMember, rotateJoinCode, setMemberRole, transitionProject, updateProject } from "@/server/services/projects";
import { fields, guard, str, type ActionState } from "./_util";

const PROJECT_FIELDS = ["title", "description", "academicPeriod", "startDate", "dueDate"];

export async function createProjectAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const actor = await requireUser();
    const p = await createProject(actor, { ...fields(fd, PROJECT_FIELDS), categoryId: str(fd, "categoryId") });
    redirect(`/projects?created=${encodeURIComponent(p.id)}`);
  });
}
export async function createProjectCategoryAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await createProjectCategory(await requireUser(), fields(fd, ["name", "academicPeriod"]));
    return "Academic category created.";
  });
}
export async function updateProjectAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await updateProject(await requireUser(), str(fd, "projectId"), fields(fd, PROJECT_FIELDS));
    return "Project updated.";
  });
}
export async function transitionProjectAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await transitionProject(await requireUser(), str(fd, "projectId"), str(fd, "to") as ProjectStatus);
    return "Status updated.";
  });
}
export async function assignSupervisorAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await assignSupervisor(await requireUser(), str(fd, "projectId"), str(fd, "supervisorId") || null);
    return "Supervisor assignment updated.";
  });
}
export async function addMemberAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await addMemberByEmail(await requireUser(), str(fd, "projectId"), str(fd, "email"));
    return "Member added.";
  });
}
export async function joinProjectAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const id = await joinByCode(await requireUser(), str(fd, "code"));
    redirect(`/projects/${id}`);
  });
}
export async function removeMemberAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const actor = await requireUser();
    const userId = str(fd, "userId");
    await removeMember(actor, str(fd, "projectId"), userId);
    if (userId === actor.id && actor.role === "STUDENT") redirect("/projects");
    return "Member removed.";
  });
}
export async function setMemberRoleAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await setMemberRole(await requireUser(), str(fd, "projectId"), str(fd, "userId"), str(fd, "role") === "LEADER" ? "LEADER" : "MEMBER");
    return "Role updated.";
  });
}
export async function rotateCodeAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await rotateJoinCode(await requireUser(), str(fd, "projectId"));
    return "A new join code was generated.";
  });
}
export async function deleteProjectAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    await deleteProject(await requireUser(), str(fd, "projectId"));
    redirect("/projects");
  });
}
