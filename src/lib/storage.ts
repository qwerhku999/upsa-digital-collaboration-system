import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";

const root = () => path.resolve(process.env.STORAGE_DIR ?? "./storage");
const LOCAL_KEY = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;
const BLOB_KEY_PREFIX = "vercel-blob:";
const BLOB_PATH = /^documents\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function isVercelProduction() {
  return process.env.VERCEL === "1" && process.env.NODE_ENV === "production";
}

function blobAuthOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return token ? { token } : {};
}

function blobPath(storageKey: string) {
  const pathname = storageKey.slice(BLOB_KEY_PREFIX.length);
  if (!storageKey.startsWith(BLOB_KEY_PREFIX) || !BLOB_PATH.test(pathname)) {
    throw new Error("Invalid private blob storage key.");
  }
  return pathname;
}

export async function saveFile(buffer: Buffer, ext: string, contentType?: string): Promise<string> {
  if (isVercelProduction()) {
    const pathname = `documents/${randomUUID()}.${ext}`;
    const blob = await put(pathname, buffer, {
      access: "private",
      ...blobAuthOptions(),
      allowOverwrite: false,
      addRandomSuffix: false,
      ...(contentType ? { contentType } : {}),
    });
    return `${BLOB_KEY_PREFIX}${blob.pathname}`;
  }

  const key = `${randomUUID()}.${ext}`;
  await fs.mkdir(root(), { recursive: true });
  await fs.writeFile(path.join(root(), key), buffer, { flag: "wx" });
  return key;
}

export async function readStoredFile(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (key.startsWith(BLOB_KEY_PREFIX)) {
    const blob = await get(blobPath(key), { access: "private", ...blobAuthOptions() });
    return blob?.statusCode === 200 ? blob.stream : null;
  }
  if (!LOCAL_KEY.test(key)) throw new Error("Invalid local storage key.");

  let fileHandle;
  try {
    fileHandle = await fs.open(path.join(root(), key), "r");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const localStream = fileHandle.createReadStream();
  const iterator = localStream[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await iterator.next();
        if (result.done) controller.close();
        else controller.enqueue(result.value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      localStream.destroy(reason instanceof Error ? reason : undefined);
    },
  });
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (key.startsWith(BLOB_KEY_PREFIX)) {
    await del(blobPath(key), blobAuthOptions());
    return;
  }
  if (!LOCAL_KEY.test(key)) return;
  await fs.rm(path.join(root(), key), { force: true });
}
