"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions/_util";

/** Wraps a server action: shows success/error messages and disables the fields while it runs. */
export function ActionForm({ action, children, className, resetOnSuccess }: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  children: ReactNode; className?: string; resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {state.message ? <p role={state.ok ? "status" : "alert"} className={state.ok ? "success" : "error"}>{state.message}</p> : null}
      <Fields>{children}</Fields>
    </form>
  );
}

function Fields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="plain">{children}</fieldset>;
}

export function SubmitButton({ children, pendingText = "Working…", variant = "primary" }: { children: ReactNode; pendingText?: string; variant?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={`button ${variant === "primary" ? "" : variant}`} aria-busy={pending}>{pending ? pendingText : children}</button>;
}

/** Destructive actions ask for confirmation before the form is submitted. */
export function ConfirmButton({ message, children }: { message: string; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button danger" aria-busy={pending} onClick={(e) => { if (!window.confirm(message)) e.preventDefault(); }}>
      {pending ? "Working…" : children}
    </button>
  );
}
