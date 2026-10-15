import Link from "next/link";
import { changePasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Change password | Project Hub" };

export default async function PasswordPage() {
  const user = await requireUser({ allowMustChange: true });
  return (
    <div className="content" style={{ maxWidth: 520 }}>
      <div className="page-head"><h1>Change password</h1><ThemeToggle /></div>
      {user.mustChangePassword ? <p className="muted">Your account was set up by an administrator. Choose a new password to continue.</p> : <p><Link href="/dashboard">← Back to dashboard</Link></p>}
      <Card>
        <ActionForm action={changePasswordAction}>
          <div className="field"><label htmlFor="current">Current password</label><input id="current" name="current" type="password" autoComplete="current-password" required /></div>
          <div className="field"><label htmlFor="next">New password</label><input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} maxLength={72} /><small>At least 10 characters, with a letter and a number. Other devices will be signed out.</small></div>
          <div className="field"><label htmlFor="confirm">Confirm new password</label><input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
          <SubmitButton>Change password</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
