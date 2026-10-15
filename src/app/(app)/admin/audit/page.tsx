import { Card, Empty, PageHead, Pagination } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { fmtDateTime, one } from "@/lib/format";
import { listAudit } from "@/server/services/audit";

export const metadata = { title: "Audit log | Project Hub" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireRole("ADMIN");
  const sp = await searchParams;
  const action = one(sp.action)?.trim() || undefined;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { items, pages } = await listAudit(user, page, action);
  return (
    <>
      <PageHead eyebrow="ADMINISTRATION" title="Audit log" />
      <Card>
        <form className="filter-form" method="get"><div className="field"><label htmlFor="action">Action contains</label><input id="action" name="action" defaultValue={action} placeholder="e.g. login, user., project." /></div><button className="button">Filter</button></form>
        {items.length === 0 ? <Empty>No audit records match.</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">Audit records</caption>
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>{items.map((a) => (
              <tr key={a.id}><td>{fmtDateTime(a.createdAt)}</td><td><code>{a.action}</code></td><td>{a.actor ? `${a.actor.name}` : "—"}</td><td>{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 8)}…` : ""}</td><td className="small">{a.metadata ? JSON.stringify(a.metadata) : ""}</td></tr>
            ))}</tbody></table></div>
        )}
        <p className="muted small">Passwords, session tokens and other secrets are never recorded.</p>
        <Pagination page={page} pages={pages} base="/admin/audit" params={{ action }} />
      </Card>
    </>
  );
}
