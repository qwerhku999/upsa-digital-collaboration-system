import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/storage";

const BATCH_SIZE = 50;
const MAX_RETRY_DELAY_MS = 24 * 60 * 60 * 1000;

function retryDelay(attempt: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempt - 1), MAX_RETRY_DELAY_MS);
}

export async function retryPendingFileDeletions(now = new Date()) {
  const pending = await prisma.pendingFileDeletion.findMany({
    where: { nextAttemptAt: { lte: now } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });
  let deleted = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await deleteStoredFile(item.storageKey);
      await prisma.pendingFileDeletion.deleteMany({ where: { id: item.id } });
      deleted++;
    } catch (error) {
      const attempts = item.attempts + 1;
      await prisma.pendingFileDeletion.updateMany({
        where: { id: item.id },
        data: {
          attempts,
          nextAttemptAt: new Date(now.getTime() + retryDelay(attempts)),
          lastError: error instanceof Error ? error.name : "UnknownError",
        },
      });
      console.error("Stored-file deletion is pending retry.", error instanceof Error ? error.name : "UnknownError");
      failed++;
    }
  }
  return { deleted, failed, pending: await prisma.pendingFileDeletion.count() };
}
