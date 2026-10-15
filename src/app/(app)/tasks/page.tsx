import type { TaskPriority, TaskStatus } from "@prisma/client";
import { TaskTable } from "@/components/project/task-parts";
import Link from "next/link";
import { Card, Empty, PageHead, Pagination } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { label, one } from "@/lib/format";
import { listTaskAssignees, listTasks, type TaskFilters } from "@/server/services/tasks";
import { taskListFilterSchema } from "@/server/validation";

export const metadata = { title: "Tasks | Project Hub" };
const STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"];
const PRIORITIES: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === one(sp.status));
  const priority = PRIORITIES.find((s) => s === one(sp.priority));
  const sort = one(sp.sort) === "priority" || one(sp.sort) === "updated" ? one(sp.sort) : "due";
  const filterResult = taskListFilterSchema.safeParse({
    status, priority, assigneeId: one(sp.assigneeId), dueFrom: one(sp.dueFrom), dueTo: one(sp.dueTo),
    overdue: one(sp.overdue) === "1", sort,
  });
  const filters: TaskFilters = filterResult.success ? filterResult.data : {};
  const assignees = await listTaskAssignees(user);
  const mine = user.role === "STUDENT" && one(sp.scope) !== "all" && !filters.assigneeId;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const result = filterResult.success
    ? await listTasks(user, { ...filters, mine, page })
    : { items: [], pages: 1, total: 0 };

  return (
    <>
      <PageHead eyebrow="PROJECT WORKFLOW" title="Tasks" />
      <Card>
        <form className="filter-form" method="get">
          {user.role === "STUDENT" ? <div className="field"><label htmlFor="scope">Show</label><select id="scope" name="scope" defaultValue={mine ? "mine" : "all"}><option value="mine">Assigned to me</option><option value="all">All tasks in my projects</option></select></div> : null}
          <div className="field"><label htmlFor="status">Status</label><select id="status" name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="priority">Priority</label><select id="priority" name="priority" defaultValue={priority ?? ""}><option value="">All</option>{PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="assigneeId">Assignee</label><select id="assigneeId" name="assigneeId" defaultValue={filters.assigneeId ?? ""}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label htmlFor="dueFrom">Due date from</label><input id="dueFrom" name="dueFrom" type="date" defaultValue={one(sp.dueFrom) ?? ""} /></div>
          <div className="field"><label htmlFor="dueTo">Due date to</label><input id="dueTo" name="dueTo" type="date" defaultValue={one(sp.dueTo) ?? ""} /></div>
          <div className="field"><label htmlFor="sort">Sort by</label><select id="sort" name="sort" defaultValue={sort}><option value="due">Due date</option><option value="priority">Priority</option><option value="updated">Recently updated</option></select></div>
          <div className="field filter-check"><label><input type="checkbox" name="overdue" value="1" defaultChecked={filters.overdue} /> Overdue only</label></div>
          <button className="button">Apply</button>
        </form>
        {filterResult.success ? null : <p className="error" role="alert">{filterResult.error.issues[0]?.message ?? "Check the task filters and try again."}</p>}
        {result.items.length === 0 ? <Empty action={<Link className="button ghost" href="/projects">Browse my projects</Link>}>{filterResult.success ? result.total === 0 ? "There are no tasks to show yet. Tasks are created inside a project’s Tasks tab." : "No tasks match these filters. Try clearing a filter to see more work." : "Correct the invalid filters above to view tasks."}</Empty> : <TaskTable tasks={result.items} userId={user.id} showProject />}
        <p className="muted small">{result.total} task(s). Open the project to edit tasks or change statuses assigned to others.</p>
        <Pagination page={page} pages={result.pages} base="/tasks" params={{ status, priority, assigneeId: filters.assigneeId, dueFrom: filters.dueFrom, dueTo: filters.dueTo, sort, overdue: filters.overdue ? "1" : undefined, scope: user.role === "STUDENT" ? (mine ? "mine" : "all") : undefined }} />
      </Card>
    </>
  );
}
