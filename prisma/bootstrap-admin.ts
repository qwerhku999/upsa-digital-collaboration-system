import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { bootstrapFirstAdmin } from "../src/server/services/bootstrap-admin";

async function main() {
  const created = await bootstrapFirstAdmin({
    name: "System Administrator",
    email: process.env.BOOTSTRAP_ADMIN_EMAIL,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    role: "ADMIN",
  }, process.env.BOOTSTRAP_ADMIN_CONFIRM);
  console.log(`Created first administrator ${created.email}; a password change is required at first sign-in.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Administrator provisioning failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
