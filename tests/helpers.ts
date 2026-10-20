import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/server/services/access";
import { createProject } from "@/server/services/projects";

// Uploaded test files go to a throwaway folder, never the real ./storage.
process.env.STORAGE_DIR = mkdtempSync(path.join(os.tmpdir(), "upsa-test-"));

export const PASSWORD = "Password123!";
let counter = 0;

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User","Project","RateLimit","AuditLog","PendingFileDeletion" RESTART IDENTITY CASCADE`);
}

export async function makeUser(role: UserRole = "STUDENT", name?: string, extra: { active?: boolean } = {}): Promise<Actor> {
  const n = ++counter;
  const u = await prisma.user.create({
    data: { name: name ?? `${role.toLowerCase()} ${n}`, email: `${role.toLowerCase()}${n}@test.example`, passwordHash: await bcrypt.hash(PASSWORD, 4), role, active: extra.active ?? true },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: false };
}

export async function makeProject(leader: Actor, title = "Group project") {
  return createProject(leader, { title, description: "A test project description.", academicPeriod: "", startDate: "", dueDate: "" });
}

export const pdf = (name = "report.pdf") => ({ name, size: 24, buffer: Buffer.from("%PDF-1.4\n% test document\n") });
