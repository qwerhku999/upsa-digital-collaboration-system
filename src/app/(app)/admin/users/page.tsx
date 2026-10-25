import type { UserRole } from "@prisma/client";
import { createRegistrationInviteAction, createUserAction, resetPasswordAction, revokeRegistrationInviteAction, rotateRegistrationInvitesAction, setActiveAction, setRoleAction } from "@/app/actions/admin";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Card, Empty, PageHead, Pagination } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { fmtDate, label, one } from "@/lib/format";
import { listUsers } from "@/server/services/admin";
import { listRegistrationInvites, registrationInviteDefaults } from "@/server/services/registration-invites";

export const metadata = { title: "Users | Project Hub" };
const ROLES: UserRole[] = ["STUDENT", "SUPERVISOR", "ADMIN"];
const CREATABLE_ROLES: UserRole[] = ["SUPERVISOR", "ADMIN"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const role = ROLES.find((r) => r === one(sp.role));
  const activeRaw = one(sp.active);
  const active = activeRaw === "yes" ? true : activeRaw === "no" ? false : undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ items, pages, total }, invites] = await Promise.all([
    listUsers(user, { q, role, active, page }),
    listRegistrationInvites(user),
  ]);
  return (
    <>
      <PageHead eyebrow="ADMINISTRATION" title="User accounts" />
      <Card>
        <form className="filter-form" method="get">
          <div className="field"><label htmlFor="q">Name or email</label><input id="q" name="q" defaultValue={q} /></div>
          <div className="field"><label htmlFor="role">Role</label><select id="role" name="role" defaultValue={role ?? ""}><option value="">All</option>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></div>
          <div className="field"><label htmlFor="active">Account</label><select id="active" name="active" defaultValue={activeRaw ?? ""}><option value="">All</option><option value="yes">Active</option><option value="no">Deactivated</option></select></div>
          <button className="button">Filter</button>
        </form>
        {items.length === 0 ? <Empty>No users match.</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">User accounts</caption>
            <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
            <tbody>{items.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.name}</strong><div className="muted small">{u.email}</div></td>
                <td>
                  {u.id === user.id ? label(u.role) : (
                    <ActionForm action={setRoleAction} className="row"><input type="hidden" name="userId" value={u.id} />
                      <label className="sr-only" htmlFor={`r-${u.id}`}>Role for {u.name}</label>
                      <select id={`r-${u.id}`} name="role" defaultValue={u.role}>{ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select>
                      <SubmitButton variant="ghost" pendingText="…">Change</SubmitButton></ActionForm>
                  )}
                </td>
                <td><span className={`badge ${u.active ? "success" : "danger"}`}>{u.active ? "Active" : "Deactivated"}</span></td>
                <td>{fmtDate(u.createdAt)}</td>
                <td>
                  {u.id === user.id ? <span className="muted small">This is you</span> : (
                    <>
                      <ActionForm action={setActiveAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        {u.active ? <ConfirmButton message={`Deactivate ${u.name}? They will be signed out and unable to sign in.`}>Deactivate</ConfirmButton> : <SubmitButton variant="ghost">Reactivate</SubmitButton>}</ActionForm>
                      <details className="inline"><summary>Set temporary password</summary>
                        <ActionForm action={resetPasswordAction}><input type="hidden" name="userId" value={u.id} />
                          <div className="field"><label htmlFor={`pw-${u.id}`}>Temporary password</label><input id={`pw-${u.id}`} name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} /></div>
                          <SubmitButton>Set password</SubmitButton></ActionForm></details>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody></table></div>
        )}
        <p className="muted small">{total} account(s)</p>
        <Pagination page={page} pages={pages} base="/admin/users" params={{ q, role, active: activeRaw }} />
      </Card>
      <Card title="Create a supervisor or administrator account">
        <ActionForm action={createUserAction} resetOnSuccess>
          <div className="row">
            <div className="field"><label htmlFor="n-name">Full name</label><input id="n-name" name="name" required maxLength={100} /></div>
            <div className="field"><label htmlFor="n-email">Email</label><input id="n-email" name="email" type="email" required /></div>
            <div className="field"><label htmlFor="n-role">Role</label><select id="n-role" name="role" defaultValue="SUPERVISOR">{CREATABLE_ROLES.map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></div>
            <div className="field"><label htmlFor="n-pw">Temporary password</label><input id="n-pw" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72} /></div>
          </div>
          <SubmitButton>Create account</SubmitButton>
          <p className="muted small">Share the temporary password through a secure channel. The user must change it at first sign-in.</p>
        </ActionForm>
      </Card>
      <Card title="Student registration invitations">
        <p className="muted small">Codes are shown only once. Share them privately with intended students. Each code expires within 30 days and can be used at most 100 times.</p>
        <ActionForm action={createRegistrationInviteAction}>
          <div className="row">
            <div className="field"><label htmlFor="invite-expiry">Expires in days</label><input id="invite-expiry" name="expiresInDays" type="number" min={1} max={30} defaultValue={registrationInviteDefaults.expiresInDays} required /></div>
            <div className="field"><label htmlFor="invite-uses">Maximum registrations</label><input id="invite-uses" name="maxUses" type="number" min={1} max={100} defaultValue={registrationInviteDefaults.maxUses} required /></div>
          </div>
          <SubmitButton>Create registration code</SubmitButton>
        </ActionForm>
        <ActionForm action={rotateRegistrationInvitesAction}>
          <input type="hidden" name="expiresInDays" value={registrationInviteDefaults.expiresInDays} />
          <input type="hidden" name="maxUses" value={registrationInviteDefaults.maxUses} />
          <ConfirmButton message="Revoke every active registration code and issue a replacement?">Rotate codes</ConfirmButton>
        </ActionForm>
        {invites.length === 0 ? <Empty>No registration codes have been created.</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">Student registration invitation codes</caption>
            <thead><tr><th>Created</th><th>Expires</th><th>Usage</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{invites.map((invite) => {
              const expired = invite.expiresAt <= new Date();
              const status = invite.revokedAt ? "Revoked" : expired ? "Expired" : invite.uses >= invite.maxUses ? "Used" : "Active";
              return (
                <tr key={invite.id}>
                  <td>{fmtDate(invite.createdAt)}</td>
                  <td>{fmtDate(invite.expiresAt)}</td>
                  <td>{invite.uses} / {invite.maxUses}</td>
                  <td>{status}</td>
                  <td>{status === "Active" ? (
                    <ActionForm action={revokeRegistrationInviteAction}>
                      <input type="hidden" name="inviteId" value={invite.id} />
                      <ConfirmButton message="Revoke this registration code?">Revoke</ConfirmButton>
                    </ActionForm>
                  ) : <span className="muted small">—</span>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
