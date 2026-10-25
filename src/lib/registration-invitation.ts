import { createHash, randomBytes } from "node:crypto";

export function createRegistrationInviteCode() {
  return randomBytes(16).toString("hex").toUpperCase();
}

export function hashRegistrationInviteCode(code: string) {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}
