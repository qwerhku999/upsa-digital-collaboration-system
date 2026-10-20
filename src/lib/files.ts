import { createHash } from "node:crypto";
import { invalid } from "@/lib/errors";

export type UploadedFile = { name: string; size: number; buffer: Buffer };

const PK = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// Allow-list: extension -> stored MIME type + file signature ("magic bytes"). The browser-supplied
// MIME type is never trusted. null signature = plain text (no NUL bytes allowed).
const TYPES: Record<string, { mime: string; magic: number[] | null }> = {
  pdf: { mime: "application/pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: PK },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: PK },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: PK },
  doc: { mime: "application/msword", magic: OLE },
  ppt: { mime: "application/vnd.ms-powerpoint", magic: OLE },
  xls: { mime: "application/vnd.ms-excel", magic: OLE },
  zip: { mime: "application/zip", magic: PK },
  png: { mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  jpg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  txt: { mime: "text/plain", magic: null },
};

export const ALLOWED_EXTENSIONS = Object.keys(TYPES);
export const maxUploadMb = () => {
  const configuredMb = Number(process.env.MAX_UPLOAD_MB ?? 10);
  if (!Number.isInteger(configuredMb) || configuredMb < 1 || configuredMb > 10) {
    throw new Error("MAX_UPLOAD_MB must be a whole number from 1 to 10.");
  }
  return configuredMb;
};
export const maxUploadBytes = () => maxUploadMb() * 1024 * 1024;

export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[^\w.\-() ]/g, "_").slice(0, 120) || "file";
}

export function validateUpload(file: UploadedFile) {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const type = TYPES[ext];
  if (!type) throw invalid(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`);
  if (file.size <= 0 || file.buffer.length === 0) throw invalid("The file is empty.");
  if (file.buffer.length > maxUploadBytes()) throw invalid(`File is too large (maximum ${maxUploadBytes() / 1024 / 1024} MB).`);
  const head = file.buffer.subarray(0, 8192);
  const ok = type.magic ? type.magic.every((b, i) => head[i] === b) : !head.includes(0);
  if (!ok) throw invalid("The file contents do not match its extension.");
  return {
    ext,
    mime: type.mime,
    sizeBytes: file.buffer.length,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    displayName: safeDisplayName(file.name),
  };
}
