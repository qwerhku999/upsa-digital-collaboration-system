import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { createProjectAction, joinProjectAction } from "@/app/actions/projects";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, PageHead, Pagination, Progress } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, label, one } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { listProjects } from "@/server/services/projects";

export const metadata = { title: "Projects | Project Hub" };
const STATUSES: ProjectStatus[] = ["PLANNING", "IN_PROGRESS", "UNDER_REVIEW", "REVISION_REQUIRED", "COMPLETED"];

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = one(sp.q)?.trim() || undefined;
  const status = STATUSES.find((s) => s === one(sp.status));
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { items, pages, total } = await listProjects(user, { q, status, page });
  const createdProject = items.find((p) => p.id === one(sp.created));
  const supervisors = user.role === "ADMIN"
    ? await prisma.user.findMany({ where: { role: "SUPERVISOR", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
    : [];

  return (
    <>
      <PageHead eyebrow="WORKSPACE" title={user.role === "SUPERVISOR" ? "Supervised projects" : "Projects"}>
        {user.role !== "SUPERVISOR" ? <Link className="button" href="#create-project">Create Project</Link> : null}
      </PageHead>
      <Card>
        <form className="filter-form" method="get">
          <div className="field"><label htmlFor="q">Search title</label><input id="q" name="q" defaultValue={q} /></div>
          <div className="field"><label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <button className="button">Filter</button>
        </form>
        {createdProject ? <p role="status" className="success">Project created. <Link href={`/projects/${createdProject.id}`}>Open {createdProject.title}</Link></p> : null}
        {items.length === 0 ? (
          <Empty action={q || status
            ? <Link className="button ghost" href="/projects">Clear filters</Link>
            : user.role === "SUPERVISOR"
              ? <span className="muted small">Ask an administrator to assign a project to you.</span>
              : <Link className="button ghost" href="#create-project">{user.role === "STUDENT" ? "Create or join a project" : "Create a project"}</Link>}>
            {q || status ? "No projects match these filters." : user.role === "STUDENT" ? "You are not in any project yet. Create one or join with a code below." : user.role === "SUPERVISOR" ? "No projects have been assigned to you yet." : "No projects exist yet. Create a project below to get started."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Projects</caption>
              <thead><tr><th>Project</th><th>Status</th><th>Supervisor</th><th>Members</th><th>Task progress</th><th>Milestone progress</th><th>Due</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`}><strong>{p.title}</strong></Link>{p.stats.tasksOverdue > 0 ? <div className="small overdue-text">{p.stats.tasksOverdue} overdue task(s)</div> : null}</td>
                    <td><Badge value={p.status} /></td>
                    <td>{p.supervisor?.name ?? <span className="muted">Not assigned</span>}</td>
                    <td>{p._count.members}</td>
                    <td style={{ minWidth: 150 }}><div className="small">{p.stats.tasksDone}/{p.stats.tasksTotal} tasks</div><Progress value={p.stats.taskPercent} text="Task completion" /></td>
                    <td style={{ minWidth: 150 }}><div className="small">{p.stats.milestonesDone}/{p.stats.milestonesTotal} milestones</div><Progress value={p.stats.milestonePercent} text="Milestone completion" /></td>
                    <td>{fmtDate(p.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">{total} project(s)</p>
        <Pagination page={page} pages={pages} base="/projects" params={{ q, status }} />
      </Card>

      {user.role === "STUDENT" ? (
        <div className="grid2" id="create-project" style={{ marginTop: 16 }}>
          <Card title="Create a group project">
            <ActionForm action={createProjectAction}>
              <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" required maxLength={150} /></div>
              <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" required maxLength={4000} /></div>
              <div className="field"><label htmlFor="academicPeriod">Academic year / semester (optional)</label><input id="academicPeriod" name="academicPeriod" maxLength={60} placeholder="e.g. 2026/2027 Semester 1" /></div>
              <div className="row"><div className="field"><label htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" /></div><div className="field"><label htmlFor="dueDate">Expected completion</label><input id="dueDate" name="dueDate" type="date" /></div></div>
              <SubmitButton>Create project</SubmitButton>
              <p className="muted small">You become the project leader. An administrator assigns the supervisor.</p>
            </ActionForm>
          </Card>
          <Card title="Join with a project code">
            <ActionForm action={joinProjectAction}>
              <div className="field"><label htmlFor="code">Join code</label><input id="code" name="code" required maxLength={20} className="mono" autoComplete="off" /><small>Ask a project leader for the code shown on their project&apos;s Members tab.</small></div>
              <SubmitButton>Join project</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      ) : null}
      {user.role === "ADMIN" ? (
        <div id="create-project">
          <Card title="Create a project">
            <ActionForm action={createProjectAction} className="stack">
              <div className="field"><label htmlFor="title">Title</label><input id="title" name="title" required maxLength={150} /></div>
              <div className="field"><label htmlFor="description">Description</label><textarea id="description" name="description" required maxLength={4000} /></div>
              <div className="field"><label htmlFor="academicPeriod">Academic year / semester (optional)</label><input id="academicPeriod" name="academicPeriod" maxLength={60} placeholder="e.g. 2026/2027 Semester 1" /></div>
              <div className="row">
                <div className="field"><label htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" /></div>
                <div className="field"><label htmlFor="dueDate">Expected completion</label><input id="dueDate" name="dueDate" type="date" /></div>
              </div>
              <div className="field"><label htmlFor="supervisorId">Assign supervisor (optional)</label>
                <select id="supervisorId" name="supervisorId" defaultValue=""><option value="">Assign later</option>{supervisors.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}</select>
              </div>
              <SubmitButton pendingText="Creating project…">Create Project</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      ) : null}
    </>
  );
}
