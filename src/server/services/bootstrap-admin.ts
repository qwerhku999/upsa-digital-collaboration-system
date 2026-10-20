import bcrypt from "bcryptjs";
import { invalid } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { adminCreateUserSchema, parse } from "@/server/validation";

const CONFIRMATION = "CREATE_FIRST_ADMIN";

export async function bootstrapFirstAdmin(input: unknown, confirmation: string | undefined) {
  if (confirmation !== CONFIRMATION) {
    throw invalid(`Set BOOTSTRAP_ADMIN_CONFIRM=${CONFIRMATION} to confirm one-time administrator provisioning.`);
  }
  const user = parse(adminCreateUserSchema, input);

  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(731942601) AS locked`;
    if (!lock?.locked) throw invalid("Another administrator bootstrap is already in progress.");
    if (await tx.user.count({ where: { role: "ADMIN" } })) {
      throw invalid("Administrator provisioning is disabled because an administrator already exists.");
    }
    const created = await tx.user.create({
      data: {
        name: user.name,
        email: user.email,
        passwordHash: await bcrypt.hash(user.password, 12),
        role: "ADMIN",
        mustChangePassword: true,
      },
      select: { id: true, email: true },
    });
    await tx.auditLog.create({
      data: { action: "user.bootstrap_admin", entityType: "User", entityId: created.id },
    });
    return created;
  }, { isolationLevel: "Serializable" });
}
