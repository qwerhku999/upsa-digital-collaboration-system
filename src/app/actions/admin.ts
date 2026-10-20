"use server";

import { requireUser } from "@/lib/auth";
import { invalid } from "@/lib/errors";
import { createUser, resetUserPassword, setUserActive, setUserRole } from "@/server/services/admin";
import { fields, guard, str, type ActionState } from "./_util";

export async function createUserAction(_: ActionState, fd: FormData) {
  return guard(async () => { await createUser(await requireUser(), fields(fd, ["name", "email", "role", "password"])); return "Account created. The user must change the password at first sign-in."; });
}
export async function setRoleAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const roles = ["STUDENT", "SUPERVISOR", "ADMIN"] as const;
    const role = roles.find((candidate) => candidate === str(fd, "role"));
    if (!role) throw invalid("Choose a valid account role.");
    await setUserRole(await requireUser(), str(fd, "userId"), role);
    return "Role updated. The user was signed out.";
  });
}
export async function setActiveAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const active = str(fd, "active");
    if (active !== "true" && active !== "false") throw invalid("Choose a valid account status.");
    await setUserActive(await requireUser(), str(fd, "userId"), active === "true");
    return "Account updated.";
  });
}
export async function resetPasswordAction(_: ActionState, fd: FormData) {
  return guard(async () => { await resetUserPassword(await requireUser(), str(fd, "userId"), str(fd, "password")); return "Temporary password set. The user must change it at next sign-in."; });
}
