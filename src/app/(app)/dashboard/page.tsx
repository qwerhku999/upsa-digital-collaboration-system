import Link from "next/link";
import { Badge, Card, Empty, PageHead, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, label } from "@/lib/format";
import { getDashboard } from "@/server/services/dashboard";

export const metadata = { title: "Dashboard | Project Hub" };

export default async function Dashboard() {
  const user = await requireUser();
  const d = await getDashboard(user);
  const student = user.role === "STUDENT";
  const roleLabel = student ? "YOUR WORKSPACE" : user.role === "ADMIN" ? "ADMINISTRATION" : "SUPERVISION";
  const deadlines = [
    ...d.upcomingTasks.map((t) => ({ key: `t${t.id}`, kind: "Task", title: t.title, due: t.dueDate!, project: t.project })),
    ...d.upcomingMilestones.map((m) => ({ key: `m${m.id}`, kind: "Milestone", title: m.title, due: m.dueDate!, project: m.project })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 8);

  return (
    <>
      <PageHead eyebrow={roleLabel} title={`Welcome, ${user.name.split(" ")[0]}`}>
        {user.role === "ADMIN" ? <Link className="button" href="/projects">Manage projects</Link>
          : user.role === "SUPERVISOR" ? <Link className="button" href="/submissions">Review submissions</Link>
            : (
              <div className="row">
                <Link className="button ghost" href="/projects#join-project">Join a Project</Link>
                <Link className="button" href="/tasks">View my tasks</Link>
              </div>
            )}
      </PageHead>
      <p className="muted dashboard-intro">
        {student ? "Your projects, assigned work, deadlines and supervisor feedback in one place."
          : user.role === "SUPERVISOR" ? "Monitor only the projects assigned to you, follow their progress and review student submissions."
            : "Oversee project activity, account access, supervisor assignments and system reports."}
      </p>
      <div className="stats">
        <Stat label="Projects" value={d.projectsTotal} hint={`${d.projectsActive} not yet completed`} />
        <Stat label={student ? "My tasks in progress" : "Tasks in progress"} value={d.tasks.inProgress} hint={`${d.tasks.todo} to do · ${d.tasks.inReview} in review`} />
        <Stat label={student ? "My tasks completed" : "Tasks completed"} value={d.tasks.completed} />
        <Stat label="Overdue tasks" value={d.tasks.overdue} hint="Not completed and past the due date" />
      </div>
      <div className="stats">
        {user.role === "ADMIN" ? null : <Stat label={student ? "Submissions awaiting review" : "Pending document reviews"} value={d.pendingReviews} />}
        <Stat label="Milestones completed" value={d.milestones.completed} hint={`${d.milestones.inProgress} in progress · ${d.milestones.notStarted} not started`} />
        <Stat label="Unread notifications" value={d.unread} />
        {d.admin ? <Stat label="Projects without a supervisor" value={d.admin.unassigned} /> : <Stat label="Recent feedback items" value={d.recentFeedback.length} />}
      </div>

      <div className="two">
        <Card title="Upcoming deadlines (next 14 days)">
          {deadlines.length === 0 ? <Empty action={<Link className="button ghost" href="/projects">View projects</Link>}>No upcoming deadlines in the next 14 days. Add due dates to keep project work on track.</Empty> : deadlines.map((x) => (
            <div className="list-item" key={x.key}>
              <strong>{x.title}</strong> <span className="badge neutral">{x.kind}</span>
              <div className="muted"><Link href={`/projects/${x.project.id}`}>{x.project.title}</Link> · due {fmtDate(x.due)}</div>
            </div>
          ))}
        </Card>
        <Card title={user.role === "ADMIN" ? "Administration" : "Recent feedback"} action={user.role === "ADMIN" ? <Link href="/admin/users">Manage users</Link> : <Link href="/feedback">View all</Link>}>
          {user.role === "ADMIN" ? (
            <Empty action={<Link className="button ghost" href="/projects">Manage projects</Link>}>Submission documents and review feedback are restricted to project members and assigned supervisors.</Empty>
          ) : d.recentFeedback.length === 0 ? <Empty action={<Link className="button ghost" href={student ? "/projects" : "/submissions"}>{student ? "View projects" : "View submissions"}</Link>}>No feedback yet. Feedback will appear here after a submission receives a comment or review.</Empty> : d.recentFeedback.map((f) => (
            <div className="list-item" key={f.id}>
              <Link href={`/submissions/${f.submission.id}`}><strong>{f.submission.title}</strong></Link> <Badge value={f.decision} />
              <div className="muted">{f.author.name} · {fmtDateTime(f.createdAt)}</div>
            </div>
          ))}
        </Card>
      </div>

      {d.admin ? (
        <div className="grid2" style={{ marginTop: 16 }}>
          <Card title="Accounts and projects">
            <p className="muted">Active users: {d.admin.usersByRole.map((r) => `${r._count._all} ${label(r.role).toLowerCase()}${r._count._all === 1 ? "" : "s"}`).join(", ") || "none"} · {d.admin.inactiveUsers} deactivated</p>
            <p className="muted">Projects by status: {d.admin.projectsByStatus.map((r) => `${label(r.status)} ${r._count._all}`).join(" · ") || "no projects yet"}</p>
          </Card>
          <Card title="Recent administrative activity" action={<Link href="/admin/audit">Audit log</Link>}>
            {d.admin.recentAudit.length === 0 ? <Empty>No activity recorded.</Empty> : d.admin.recentAudit.map((a) => (
              <div className="list-item" key={a.id}><code>{a.action}</code> <span className="muted">by {a.actor?.name ?? "system"} · {fmtDateTime(a.createdAt)}</span></div>
            ))}
          </Card>
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 20 }}>All figures are calculated from records you are allowed to see. Task completion is a measure of recorded activity, not of academic quality or grades.</p>
    </>
  );
}
