import Link from "next/link";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { projectReport } from "@/server/services/reports";

export const metadata = { title: "Reports | Project Hub" };

export default async function ReportsPage() {
  const user = await requireRole("SUPERVISOR", "ADMIN");
  const rows = await projectReport(user);
  return (
    <>
      <PageHead eyebrow="REPORTING" title="Project status summary">
        <a className="button" href="/api/reports/projects">Download CSV</a>
      </PageHead>
      <Card>
        {rows.length === 0 ? <Empty>No projects to report on yet.</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">Project status summary</caption>
            <thead><tr><th>Project</th><th>Status</th><th>Supervisor</th><th>Tasks (done/total)</th><th>Overdue</th><th>Milestones</th>{user.role === "SUPERVISOR" ? <th>Awaiting review</th> : null}<th>Due</th></tr></thead>
            <tbody>{rows.map(({ project: p, stats: s }) => (
              <tr key={p.id}><td><Link href={`/projects/${p.id}`}>{p.title}</Link></td><td><Badge value={p.status} /></td><td>{p.supervisor?.name ?? "—"}</td>
                <td>{s.tasksDone}/{s.tasksTotal}{s.taskPercent !== null ? ` (${s.taskPercent}%)` : ""}</td><td>{s.tasksOverdue}</td><td>{s.milestonesDone}/{s.milestonesTotal}</td>{user.role === "SUPERVISOR" ? <td>{s.pendingReviews}</td> : null}<td>{fmtDate(p.dueDate)}</td></tr>
            ))}</tbody></table></div>
        )}
        <p className="muted small">Figures come from records in this system. Completion percentages describe recorded task and milestone activity only; they are not grades or measures of quality.</p>
      </Card>
    </>
  );
}
