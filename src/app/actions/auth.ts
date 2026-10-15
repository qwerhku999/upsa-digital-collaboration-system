"use server";

import { redirect } from "next/navigation";
import { endSession, getSessionUser, requireUser, startSession } from "@/lib/auth";
import { invalid } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { audit } from "@/server/services/audit";
import { authenticate, changePassword, registerStudent } from "@/server/services/auth";
import { guard, str, type ActionState } from "./_util";

export async function loginAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const user = await authenticate({ email: str(fd, "email"), password: str(fd, "password") });
    await startSession(user.id);
    redirect(user.mustChangePassword ? "/account/password" : "/dashboard");
  });
}

export async function registerAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const user = await registerStudent({ name: str(fd, "name"), email: str(fd, "email"), password: str(fd, "password") });
    await startSession(user.id);
    redirect("/dashboard");
  });
}

export async function changePasswordAction(_: ActionState, fd: FormData) {
  return guard(async () => {
    const actor = await requireUser({ allowMustChange: true });
    if (str(fd, "next") !== str(fd, "confirm")) throw invalid("The new passwords do not match.");
    await changePassword(actor, { current: str(fd, "current"), next: str(fd, "next") });
    await startSession(actor.id);
    redirect("/dashboard");
  });
}

export async function logoutAction() {
  const user = await getSessionUser();
  await endSession();
  if (user) await audit(prisma, user.id, "auth.logout", "User", user.id);
  redirect("/login");
}
