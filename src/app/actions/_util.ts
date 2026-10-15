import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { AppError, invalid } from "@/lib/errors";
import { maxUploadBytes, type UploadedFile } from "@/lib/files";

export type ActionState = { ok?: boolean; message?: string };

/** Runs a mutation, turning expected errors into messages and hiding unexpected ones. Redirects pass through. */
export async function guard(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    revalidatePath("/", "layout");
    return { ok: true, message: message || "Saved." };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, message: e.message };
    console.error(e); // details stay in the server log, never in the browser
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export const str = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
};

export const fields = (fd: FormData, keys: string[]) => Object.fromEntries(keys.map((k) => [k, str(fd, k)]));

export async function readFile(fd: FormData, key = "file"): Promise<UploadedFile> {
  const f = fd.get(key);
  if (!(f instanceof File) || f.size === 0) throw invalid("Choose a file to upload.");
  if (f.size > maxUploadBytes()) throw invalid(`File is too large (maximum ${maxUploadBytes() / 1024 / 1024} MB).`);
  return { name: f.name, size: f.size, buffer: Buffer.from(await f.arrayBuffer()) };
}
