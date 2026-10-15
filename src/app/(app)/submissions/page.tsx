import Link from "next/link";
import type { SubmissionStatus } from "@prisma/client";
import { Badge, Card, Empty, PageHead, Pagination } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, label, one } from "@/lib/format";
import { listSubmissions } from "@/server/services/submissions";

export const metadata = { title: "Submissions | Project Hub" };
const STATUSES: SubmissionStatus[] = ["SUBMITTED", "REVISION_REQUIRED", "ACCEPTED"];

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === one(sp.status));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { items, pages } = await listSubmissions(user, { status, page });
  return (
    <>
      <PageHead eyebrow="PROJECT DOCUMENTS" title={user.role === "SUPERVISOR" ? "Documents to review" : "Submissions"} />
      <Card>
        <form className="filter-form" method="get">
          <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <button className="button">Filter</button>
        </form>
        {items.length === 0 ? <Empty action={<Link className="button ghost" href="/projects">Browse my projects</Link>}>{status ? "No submissions match this status filter." : user.role === "STUDENT" ? "No documents have been submitted yet. Open a project’s Documents tab to submit work." : "No submissions are awaiting attention yet."}</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">Submissions</caption>
            <thead><tr><th>Document</th><th>Project</th><th>Versions</th><th>Status</th><th>Next step</th><th>Updated</th></tr></thead>
            <tbody>{items.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/submissions/${s.id}`}><strong>{s.title}</strong></Link><div className="muted small">by {s.createdBy.name}</div></td>
                <td><Link href={`/projects/${s.project.id}`}>{s.project.title}</Link></td>
                <td>{s._count.versions}</td>
                <td><Badge value={s.status} /></td>
                <td>{user.role === "SUPERVISOR" && s.status === "SUBMITTED" ? "Review latest version" : user.role === "STUDENT" && s.status === "REVISION_REQUIRED" ? "Upload a revised version" : "View feedback and history"}</td>
                <td>{fmtDate(s.updatedAt)}</td>
              </tr>
            ))}</tbody></table></div>
        )}
        <Pagination page={page} pages={pages} base="/submissions" params={{ status }} />
      </Card>
    </>
  );
}
