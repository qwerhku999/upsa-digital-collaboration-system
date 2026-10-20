import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { createProjectAction, createProjectCategoryAction, joinProjectAction } from "@/app/actions/projects";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, PageHead, Pagination, Progress } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDate, label, one } from "@/lib/format";
import { listProjectCategories, listProjects } from "@/server/services/projects";

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
  const categories = await listProjectCategories();

  return (
    <>
      <PageHead eyebrow="WORKSPACE" title={user.role === "SUPERVISOR" ? "Supervised projects" : "Projects"}>
        {user.role === "STUDENT" ? (
          <div className="row">
            <Link className="button ghost" href="#join-project">Join a Project</Link>
            <Link className="button" href="#create-project">Create Project</Link>
          </div>
        ) : null}
      </PageHead>
      <Card>
        <form className="filter-form" method="get">
          <div className="field"><label htmlFor="q">Search title</label><input id="q" name="q" defaultValue={q} /></div>
          <div className="field"><label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <button className="button">Filter</button>
        </form>
        {one(sp["file-cleanup"]) === "pending" ? <p role="status" className="success">The project was deleted. Some stored files could not be removed yet; cleanup will retry when the scheduled cleanup command runs.</p> : null}
        {createdProject ? <p role="status" className="success">Project created. <Link href={`/projects/${createdProject.id}`}>Open {createdProject.title}</Link></p> : null}
        {items.length === 0 ? (
          <Empty action={q || status
            ? <Link className="button ghost" href="/projects">Clear filters</Link>
            : user.role === "SUPERVISOR"
              ? <span className="muted small">Ask an administrator to assign a project to you.</span>
              : user.role === "STUDENT"
                ? <Link className="button ghost" href="#create-project">Create or join a project</Link>
                : <Link className="button ghost" href="#create-category">Set up academic categories</Link>}>
            {q || status ? "No projects match these filters." : user.role === "STUDENT" ? "You are not in any project yet. Create one or join with a code below." : user.role === "SUPERVISOR" ? "No projects have been assigned to you yet." : "No student projects exist yet. Set up academic categories for students to choose from."}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Projects</caption>
              <thead><tr><th>Student project topic</th><th>Category</th><th>Status</th><th>Supervisor</th><th>Members</th><th>Task progress</th><th>Milestone progress</th><th>Due</th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/projects/${p.id}`}><strong>{p.title}</strong></Link>{p.stats.tasksOverdue > 0 ? <div className="small overdue-text">{p.stats.tasksOverdue} overdue task(s)</div> : null}</td>
                    <td>{p.category?.name ?? <span className="muted">—</span>}</td>
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
              <div className="field"><label htmlFor="categoryId">Academic category / semester (optional)</label><select id="categoryId" name="categoryId" defaultValue=""><option value="">Choose later or use a custom period</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.academicPeriod}</option>)}</select><small>Choose a category, then define your own project topic and description.</small></div>
              <div className="field"><label htmlFor="academicPeriod">Academic period (if not using a category)</label><input id="academicPeriod" name="academicPeriod" maxLength={60} placeholder="e.g. 2026/2027 Semester 1" /></div>
              <div className="row"><div className="field"><label htmlFor="startDate">Start date</label><input id="startDate" name="startDate" type="date" /></div><div className="field"><label htmlFor="dueDate">Expected completion</label><input id="dueDate" name="dueDate" type="date" /></div></div>
              <SubmitButton>Create project</SubmitButton>
              <p className="muted small">You become the project leader. An administrator assigns the supervisor.</p>
            </ActionForm>
          </Card>
          <Card title="Join a Project">
            <div id="join-project" />
            <p className="muted">Enter the 10-character join code shared by a project leader.</p>
            <ActionForm action={joinProjectAction}>
              <div className="field"><label htmlFor="code">Project join code</label><input id="code" name="code" required maxLength={10} className="mono" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="e.g. A1B2C3D4E5" /><small>Ask a project leader for the code shown on their project&apos;s Members tab.</small></div>
              <SubmitButton>Join project</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      ) : null}
      {user.role === "ADMIN" ? (
        <div id="create-category" className="stack">
          <Card title="Academic categories and semesters">
            <p>Set up broad categories and academic periods. Students choose from these options and create their own project topics; do not enter individual research topics here.</p>
            <ActionForm action={createProjectCategoryAction} resetOnSuccess>
              <div className="row">
                <div className="field"><label htmlFor="categoryName">Category</label><input id="categoryName" name="name" required maxLength={100} placeholder="e.g. Information Systems" /></div>
                <div className="field"><label htmlFor="categoryPeriod">Academic year / semester</label><input id="categoryPeriod" name="academicPeriod" required maxLength={60} placeholder="e.g. 2026/2027 Semester 1" /></div>
              </div>
              <SubmitButton>Create category</SubmitButton>
            </ActionForm>
            {categories.length > 0 ? (
              <ul>{categories.map((category) => <li key={category.id}>{category.name} — {category.academicPeriod}</li>)}</ul>
            ) : <p className="muted small">No academic categories have been created yet.</p>}
          </Card>
        </div>
      ) : null}
    </>
  );
}
