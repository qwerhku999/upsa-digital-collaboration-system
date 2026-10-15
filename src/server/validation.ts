import { z } from "zod";
import { invalid } from "@/lib/errors";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw invalid(r.error.issues[0]?.message ?? "Invalid input.");
  return r.data;
}

/** FormData -> plain object (files and framework keys dropped). Empty fields stay as "". */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$ACTION")) out[k] = v;
  return out;
}

const text = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} must be at most ${max} characters.`);
const optText = (max: number) =>
  z.string().trim().max(max, `Must be at most ${max} characters.`).optional().transform((v) => (v ? v : null));
const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Enter a valid date." });
      return z.NEVER;
    }
    return d;
  });

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address.");
export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .refine((v) => Buffer.byteLength(v) <= 72, "Password is too long (maximum 72 bytes).")
  .regex(/[A-Za-z]/, "Password must include a letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const registerSchema = z.object({ name: text("Name", 100).min(2, "Name is too short."), email: emailSchema, password: passwordSchema });
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(128) });
export const changePasswordSchema = z.object({ current: z.string().min(1, "Enter your current password.").max(128), next: passwordSchema });

export const projectSchema = z
  .object({
    title: text("Title", 150),
    description: text("Description", 4000),
    academicPeriod: optText(60),
    startDate: optDate,
    dueDate: optDate,
  })
  .refine((p) => !p.startDate || !p.dueDate || p.dueDate >= p.startDate, { message: "Due date cannot be before the start date.", path: ["dueDate"] });

export const projectCreationSchema = projectSchema.extend({ supervisorId: optText(40) });

export const taskSchema = z.object({
  title: text("Title", 150),
  description: z.string().trim().max(3000).optional().transform((v) => v ?? ""),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  dueDate: optDate,
  assigneeId: optText(40),
  milestoneId: optText(40),
});

const taskFilterDate = z.string().trim().optional().transform((value, ctx) => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Enter a valid due date." });
    return z.NEVER;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    ctx.addIssue({ code: "custom", message: "Enter a valid due date." });
    return z.NEVER;
  }
  return value;
});

export const taskListFilterSchema = z.object({
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  assigneeId: z.string().trim().max(40).optional().transform((value) => value || undefined),
  dueFrom: taskFilterDate,
  dueTo: taskFilterDate,
  overdue: z.boolean().optional().default(false),
  sort: z.enum(["due", "priority", "updated"]).optional().default("due"),
}).refine((filters) => !filters.dueFrom || !filters.dueTo || filters.dueFrom <= filters.dueTo, {
  message: "The due date start must be on or before the due date end.",
  path: ["dueTo"],
});

export const milestoneSchema = z.object({ title: text("Title", 150), description: optText(2000), dueDate: optDate });
export const submissionMetaSchema = z.object({ title: text("Title", 150), description: text("Description", 3000), note: optText(1000) });
export const feedbackSchema = z.object({
  body: text("Feedback", 5000),
  decision: z.enum(["COMMENT", "REVISION_REQUIRED", "ACCEPTED"]).default("COMMENT"),
  strengths: optText(3000),
  areasForImprovement: optText(3000),
  nextSteps: optText(3000),
});
export const supervisionMeetingSchema = z.object({
  meetingAt: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid meeting date and time.")
    .transform((value, ctx) => {
      const [day, time] = value.split("T");
      const [year, month, dateOfMonth] = day.split("-").map(Number);
      const [hour, minute] = time.split(":").map(Number);
      const date = new Date(year, month - 1, dateOfMonth, hour, minute);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== dateOfMonth) {
        ctx.addIssue({ code: "custom", message: "Enter a valid meeting date and time." });
        return z.NEVER;
      }
      return date;
    }),
  summary: text("Meeting summary", 5000),
  actionItems: z.string().trim().max(5000, "Action items must be at most 5000 characters.").optional().transform((value) => value || ""),
});
export const adminCreateUserSchema = z.object({
  name: text("Name", 100).min(2, "Name is too short."),
  email: emailSchema,
  role: z.enum(["STUDENT", "SUPERVISOR", "ADMIN"]),
  password: passwordSchema,
});
