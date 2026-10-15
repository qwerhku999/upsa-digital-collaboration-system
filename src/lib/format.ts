export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

export const fmtDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const toInputDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
export const label = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const T: Record<string, Tone> = {
  PLANNING: "neutral", IN_PROGRESS: "info", UNDER_REVIEW: "warn", REVISION_REQUIRED: "danger", COMPLETED: "success",
  TODO: "neutral", IN_REVIEW: "warn", NOT_STARTED: "neutral", SUBMITTED: "info", ACCEPTED: "success",
  LOW: "neutral", MEDIUM: "info", HIGH: "danger", COMMENT: "neutral",
};
export const toneOf = (s: string): Tone => T[s] ?? "neutral";
