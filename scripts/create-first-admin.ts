import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createInterface } from "node:readline/promises";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Run this script locally, not in production.");
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const name = (await rl.question("Administrator name: ")).trim();
    const email = (await rl.question("Administrator email: ")).trim().toLowerCase();
    const password = await rl.question("Temporary password: ");

    if (name.length < 2 || !email.includes("@")) {
      throw new Error("Enter a valid name and email.");
    }

    if (
      password.length < 10 ||
      Buffer.byteLength(password) > 72 ||
      !/[A-Za-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      throw new Error("Password must be 10–72 bytes and include a letter and a number.");
    }

    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new Error("That email already exists. No changes were made.");
    }

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name,
          email,
          passwordHash: await bcrypt.hash(password, 12),
          role: "ADMIN",
          mustChangePassword: true,
        },
        select: { id: true, email: true, role: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "user.bootstrap_admin",
          entityType: "User",
          entityId: created.id,
        },
      });

      return created;
    });

    console.log("Administrator created:", user.email);
    console.log("Sign in and change your password when prompted.");
  } finally {
    rl.close();
  }
}

main()
  .catch((error) => {
    console.error("Setup failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
