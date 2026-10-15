import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

// LOCAL DEVELOPMENT STORAGE. Files live in a private folder that is never served statically; they can
// only be downloaded through /api/files/[versionId], which checks the signed-in user's access.
// Limitations: no backups, no virus scanning, single machine. Replace this module with an
// S3-compatible adapter (same three functions) before real deployment.
const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
const KEY = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

export async function saveFile(buffer: Buffer, ext: string): Promise<string> {
  const key = `${randomUUID()}.${ext}`;
  await fs.mkdir(root(), { recursive: true });
  await fs.writeFile(path.join(root(), key), buffer, { flag: "wx" });
  return key;
}

export async function readStoredFile(key: string): Promise<Buffer> {
  if (!KEY.test(key)) throw new Error("Invalid storage key");
  return fs.readFile(path.join(root(), key));
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (!KEY.test(key)) return;
  await fs.rm(path.join(root(), key), { force: true });
}
