import Link from "next/link";
import { loginAction, registerAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "./forms";
import { ThemeToggle } from "./theme-toggle";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const reg = mode === "register";
  return (
    <div className="auth">
      <section className="hero">
        <div className="brand">PROJECT HUB<span>COLLABORATION &amp; SUPERVISION</span></div>
        <div>
          <div className="eyebrow">ONE WORKSPACE. CLEARER PROGRESS.</div>
          <h1>Good projects move forward together.</h1>
          <p className="muted hero-copy">Group tasks, deadlines, documents and supervisor feedback in one place.</p>
        </div>
        <small>University of Professional Studies, Accra — student project</small>
      </section>
      <section className="panel">
        <div className="auth-theme"><ThemeToggle /></div>
        <ActionForm action={reg ? registerAction : loginAction} className="form">
          <div className="eyebrow">{reg ? "GET STARTED" : "WELCOME BACK"}</div>
          <h1 style={{ fontSize: 27 }}>{reg ? "Create your student account" : "Sign in to your workspace"}</h1>
          {reg ? (
            <div className="field"><label htmlFor="name">Full name</label><input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} /></div>
          ) : null}
          <div className="field"><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete={reg ? "new-password" : "current-password"} required minLength={reg ? 10 : 1} maxLength={72} />
            {reg ? <small>At least 10 characters, with a letter and a number.</small> : null}
          </div>
          <SubmitButton pendingText="Please wait…">{reg ? "Create account →" : "Sign in →"}</SubmitButton>
          <div className="switch">{reg ? "Already registered? " : "New student? "}<Link href={reg ? "/login" : "/register"}>{reg ? "Sign in" : "Create an account"}</Link></div>
          <p className="muted small" style={{ textAlign: "center", marginTop: 20 }}>Supervisor and administrator accounts are created by an administrator.</p>
        </ActionForm>
      </section>
    </div>
  );
}
