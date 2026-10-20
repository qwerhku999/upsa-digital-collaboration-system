import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const { retryPendingFileDeletions } = await import("../src/server/services/file-deletions");
  const result = await retryPendingFileDeletions();
  console.log(`Stored-file cleanup: ${result.deleted} deleted, ${result.failed} failures, ${result.pending} still queued.`);
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Stored-file cleanup failed.", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
