import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";
import { maxUploadBytes, validateUpload } from "@/lib/files";
import { getRegistrationClientIp } from "@/lib/registration-client-ip";
import { isOverdue, percent } from "@/lib/progress";
import { safeDisplayName } from "@/lib/files";
import { allowedTransitions } from "@/server/services/projects";
import { passwordSchema, projectSchema, registerSchema, registrationInviteSettingsSchema, taskSchema } from "@/server/validation";

describe("CSV export safety", () => {
  it("neutralises formula injection", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\t=x", "\r=x"]) expect(csvCell(bad)).toBe(`"'${bad}"`);
  });
  it("escapes quotes and keeps normal text", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("plain")).toBe('"plain"');
    expect(toCsv([["a", 1]])).toContain('"a","1"');
  });
});

describe("upload validation", () => {
  const f = (name: string, bytes: number[] | string) => ({ name, size: 10, buffer: Buffer.from(bytes as never) });
  it("rejects an invalid configured upload limit", () => {
    const original = process.env.MAX_UPLOAD_MB;
    process.env.MAX_UPLOAD_MB = "not-a-number";
    try {
      expect(() => maxUploadBytes()).toThrow("MAX_UPLOAD_MB must be a whole number from 1 to 10.");
      process.env.MAX_UPLOAD_MB = "11";
      expect(() => maxUploadBytes()).toThrow("MAX_UPLOAD_MB must be a whole number from 1 to 10.");
    } finally {
      if (original === undefined) delete process.env.MAX_UPLOAD_MB;
      else process.env.MAX_UPLOAD_MB = original;
    }
  });
  it("accepts a real PDF", () => expect(validateUpload(f("a.pdf", "%PDF-1.4 x")).mime).toBe("application/pdf"));
  it("rejects disallowed extensions", () => expect(() => validateUpload(f("virus.exe", "MZ"))).toThrow(/not allowed/));
  it("rejects a mismatched signature", () => expect(() => validateUpload(f("fake.pdf", "<html>"))).toThrow(/do not match/));
  it("rejects empty files", () => expect(() => validateUpload({ name: "a.pdf", size: 0, buffer: Buffer.alloc(0) })).toThrow(/empty/));
  it("rejects oversized files", () => expect(() => validateUpload({ name: "a.txt", size: 1, buffer: Buffer.alloc(11 * 1024 * 1024, 65) })).toThrow(/too large/));
  it("sanitises display names", () => expect(safeDisplayName("..\\..\\evil<script>.pdf")).toBe("evil_script_.pdf"));
});

describe("progress", () => {
  it("computes percentages and handles nothing recorded", () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(0, 0)).toBeNull();
  });
  it("overdue means past due and not completed", () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(isOverdue(past, false)).toBe(true);
    expect(isOverdue(past, true)).toBe(false);
    expect(isOverdue(null, false)).toBe(false);
  });
});

describe("validation schemas", () => {
  it("requires a well-formed registration invitation code", () => {
    const input = { name: "Ama Mensah", email: "ama@test.example", password: "Strong-pass-1" };
    expect(registerSchema.safeParse(input).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, inviteCode: "not-a-code" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...input, inviteCode: "a".repeat(32) }).success).toBe(true);
  });
  it("bounds registration invitation expiry and usage limits", () => {
    expect(registrationInviteSettingsSchema.safeParse({ expiresInDays: "7", maxUses: "25" }).success).toBe(true);
    expect(registrationInviteSettingsSchema.safeParse({ expiresInDays: "31", maxUses: "25" }).success).toBe(false);
    expect(registrationInviteSettingsSchema.safeParse({ expiresInDays: "7", maxUses: "101" }).success).toBe(false);
  });
  it("enforces password rules", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterspassword").success).toBe(false);
    expect(passwordSchema.safeParse("long-enough-1").success).toBe(true);
  });
  it("rejects a due date before the start date", () => {
    expect(projectSchema.safeParse({ title: "T", description: "D", startDate: "2026-05-02", dueDate: "2026-05-01" }).success).toBe(false);
  });
  it("rejects an invalid date and unknown priority", () => {
    expect(taskSchema.safeParse({ title: "T", dueDate: "not-a-date" }).success).toBe(false);
    expect(taskSchema.safeParse({ title: "T", priority: "URGENT" }).success).toBe(false);
  });
});

describe("registration client IP", () => {
  it("accepts a valid Vercel x-real-ip address", () => {
    expect(getRegistrationClientIp(new Headers({ "x-real-ip": "203.0.113.10" }))).toBe("203.0.113.10");
    expect(getRegistrationClientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });
  it("fails closed when x-real-ip is missing or invalid, even if forwarding headers are present", () => {
    expect(getRegistrationClientIp(new Headers())).toBeNull();
    expect(getRegistrationClientIp(new Headers({ "x-real-ip": "not-an-ip" }))).toBeNull();
    expect(getRegistrationClientIp(new Headers({ "x-forwarded-for": "203.0.113.10" }))).toBeNull();
    expect(getRegistrationClientIp(new Headers({ "x-real-ip": "203.0.113.10, 198.51.100.1" }))).toBeNull();
  });
});

describe("project lifecycle rules", () => {
  it("lets only leaders start/submit and only supervisors decide", () => {
    expect(allowedTransitions("PLANNING", "LEADER")).toEqual(["IN_PROGRESS"]);
    expect(allowedTransitions("PLANNING", "MEMBER")).toEqual([]);
    expect(allowedTransitions("UNDER_REVIEW", "LEADER")).toEqual([]);
    expect(allowedTransitions("UNDER_REVIEW", "SUPERVISOR").sort()).toEqual(["COMPLETED", "REVISION_REQUIRED"]);
    expect(allowedTransitions("COMPLETED", "SUPERVISOR")).toEqual([]);
    expect(allowedTransitions("COMPLETED", "ADMIN")).toEqual(["IN_PROGRESS"]);
  });
});
