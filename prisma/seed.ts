// Creates the FIRST administrator for local development. Credentials come from .env (no default password).
// The account is flagged mustChangePassword. Do not use this script to provision production users.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed when NODE_ENV=production.");
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10 || Buffer.byteLength(password) > 72) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (10-72 bytes) in .env first.");
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`Administrator ${email} already exists. Nothing changed.`);
    return;
  }
  const admin = await prisma.user.create({
    data: { name: "System Administrator", email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN", mustChangePassword: true },
  });
  await prisma.auditLog.create({ data: { actorId: null, action: "user.seed_admin", entityType: "User", entityId: admin.id } });
  console.log(`Created administrator ${email}. You will be asked to change the password at first sign-in.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
