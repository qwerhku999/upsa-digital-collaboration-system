import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { UserRole } from "@prisma/client";
import { createSessionRecord, deleteSessionByToken, findSessionUser, type SessionUser } from "@/lib/session-store";

export const SESSION_COOKIE = "upsa_session";

export async function startSession(userId: string) {
  const { token, expiresAt } = await createSessionRecord(userId);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // not readable by page scripts
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSessionByToken(token); // server-side invalidation, not just cookie removal
  jar.delete(SESSION_COOKIE);
}

/** One database lookup per request, validated against the sessions table and the user's active flag. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? findSessionUser(token) : null;
});

/** Call in every protected page, route handler and server action. Hidden links are not security. */
export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowMustChange) redirect("/account/password");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
