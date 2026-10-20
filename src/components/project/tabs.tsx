import Link from "next/link";
import type { ProjectStatus } from "@prisma/client";
import { addMemberAction, assignSupervisorAction, deleteProjectAction, removeMemberAction, rotateCodeAction, setMemberRoleAction, transitionProjectAction, updateProjectAction } from "@/app/actions/projects";
import { createMilestoneAction, createSubmissionAction, createTaskAction, deleteMilestoneAction, milestoneStatusAction, updateMilestoneAction } from "@/app/actions/work";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, Progress } from "@/components/ui";
import { ALLOWED_EXTENSIONS, maxUploadMb } from "@/lib/files";
import { fmtDate, fmtDateTime, label, toInputDate } from "@/lib/format";
import type { AccessLevel } from "@/server/services/access";
import { canManage as canManageLevel } from "@/server/services/access";
import { allowedTransitions, type getProject } from "@/server/services/projects";
import type { listActivity } from "@/server/services/activity";
import type { listSubmissions } from "@/server/services/submissions";
import type { getProjectWorkload, listTasks } from "@/server/services/tasks";
import { TaskFields, TaskTable } from "./task-parts";
import { CopyJoinCode } from "@/components/copy-join-code";

type Detail = Awaited<ReturnType<typeof getProject>>;
type Ctx = { detail: Detail; userId: string };

export function OverviewTab({ detail, supervisors, workload }: {
  detail: Detail;
  supervisors: { id: string; name: string; email: string }[];
  workload: Awaited<ReturnType<typeof getProjectWorkload>>;
}) {
  const { project: p, level, stats: s } = detail;
  const next = allowedTransitions(p.status as ProjectStatus, level);
  return (
    <div className="stack">
      <div className="grid2">
        <Card title="Project details">
          <p style={{ whiteSpace: "pre-wrap" }}>{p.description}</p>
          <p className="muted">Category: {p.category?.name ?? "—"} · Period: {p.academicPeriod ?? "—"} · Start: {fmtDate(p.startDate)} · Expected completion: {fmtDate(p.dueDate)}<br />Created {fmtDate(p.createdAt)}{p.completedAt ? ` · Completed ${fmtDate(p.completedAt)}` : ""}</p>
          <p>Supervisor: {p.supervisor ? <strong>{p.supervisor.name}</strong> : <span className="muted">Not assigned yet</span>}</p>
          {next.length > 0 ? (
            <div className="row">
              {next.map((to) => (
                <ActionForm key={to} action={transitionProjectAction}>
                  <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="to" value={to} />
                  <SubmitButton variant="ghost">Mark as {label(to).toLowerCase()}</SubmitButton>
                </ActionForm>
              ))}
            </div>
          ) : null}
          {level === "LEADER" ? (
            <details className="inline"><summary>Edit project details</summary>
              <ActionForm action={updateProjectAction}>
                <input type="hidden" name="projectId" value={p.id} />
                <div className="field"><label htmlFor="e-title">Title</label><input id="e-title" name="title" defaultValue={p.title} required maxLength={150} /></div>
                <div className="field"><label htmlFor="e-desc">Description</label><textarea id="e-desc" name="description" defaultValue={p.description} required maxLength={4000} /></div>
                <div className="field"><label htmlFor="e-per">Academic year / semester</label><input id="e-per" name="academicPeriod" defaultValue={p.academicPeriod ?? ""} maxLength={60} /></div>
                <div className="row"><div className="field"><label htmlFor="e-s">Start date</label><input id="e-s" name="startDate" type="date" defaultValue={toInputDate(p.startDate)} /></div><div className="field"><label htmlFor="e-d">Expected completion</label><input id="e-d" name="dueDate" type="date" defaultValue={toInputDate(p.dueDate)} /></div></div>
                <SubmitButton>Save changes</SubmitButton>
              </ActionForm>
            </details>
          ) : null}
        </Card>
        <Card title="Progress summary">
          <Progress value={s.taskPercent} text="Tasks completed" />
          <Progress value={s.milestonePercent} text="Milestones completed" />
          <ul>
            <li>{s.tasksTotal} task(s): {s.tasksDone} completed, {s.tasksInProgress} in progress, <strong>{s.tasksOverdue} overdue</strong></li>
            <li>{s.milestonesDone} of {s.milestonesTotal} milestone(s) completed</li>
            {level !== "ADMIN" ? <li>{s.pendingReviews} submission(s) awaiting supervisor review</li> : null}
          </ul>
          <p className="muted small">Task completion and milestone completion are tracked independently. Both describe recorded workflow activity, not academic quality or grades.</p>
        </Card>
      </div>
      <Card title="Group task workload">
        {workload.members.length === 0 ? (
          <Empty>{workload.unassigned.assigned === 0 ? "No group members or tasks have been recorded yet." : "No group members yet. Existing tasks are currently unassigned."}</Empty>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Task workload by project member</caption>
              <thead><tr><th>Group member</th><th>Assigned tasks</th><th>Completed</th><th>Outstanding</th></tr></thead>
              <tbody>{workload.members.map((member) => (
                <tr key={member.id}><th scope="row">{member.name}</th><td>{member.assigned}</td><td>{member.completed}</td><td>{member.outstanding}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
        <p className="muted small">Outstanding means assigned tasks not marked completed. Milestones are tracked separately from individual task workload.</p>
        <p><strong>Unassigned tasks:</strong> {workload.unassigned.assigned} total · {workload.unassigned.completed} completed · {workload.unassigned.outstanding} outstanding</p>
      </Card>
      {level === "ADMIN" ? (
        <Card title="Administration">
          <ActionForm action={assignSupervisorAction} className="row">
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field"><label htmlFor="sup">Supervisor</label>
              <select id="sup" name="supervisorId" defaultValue={p.supervisorId ?? ""}><option value="">— None —</option>{supervisors.map((s2) => <option key={s2.id} value={s2.id}>{s2.name} ({s2.email})</option>)}</select></div>
            <SubmitButton>Save assignment</SubmitButton>
          </ActionForm>
          <ActionForm action={deleteProjectAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <ConfirmButton message={`Permanently delete "${p.title}" with all its tasks, submissions and files?`}>Delete project</ConfirmButton>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

export function TasksTab({ detail, userId, tasks, qs }: Ctx & { tasks: Awaited<ReturnType<typeof listTasks>>; qs: Record<string, string | undefined> & { filterError?: string } }) {
  const { project: p, level } = detail;
  const members = p.members.map((m) => ({ id: m.user.id, name: m.user.name }));
  const milestones = p.milestones.map((m) => ({ id: m.id, name: m.title }));
  const self = members.filter((m) => m.id === userId);
  return (
    <div className="stack">
      <Card title="Tasks">
        <form className="filter-form" method="get">
          <input type="hidden" name="tab" value="tasks" />
          <div className="field"><label htmlFor="f-st">Status</label><select id="f-st" name="status" defaultValue={qs.status ?? ""}><option value="">All</option>{["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></div>
          <div className="field"><label htmlFor="f-pr">Priority</label><select id="f-pr" name="priority" defaultValue={qs.priority ?? ""}><option value="">All</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></div>
          <div className="field"><label htmlFor="f-as">Assignee</label><select id="f-as" name="assigneeId" defaultValue={qs.assigneeId ?? ""}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></div>
          <div className="field"><label htmlFor="f-from">Due date from</label><input id="f-from" name="dueFrom" type="date" defaultValue={qs.dueFrom ?? ""} /></div>
          <div className="field"><label htmlFor="f-to">Due date to</label><input id="f-to" name="dueTo" type="date" defaultValue={qs.dueTo ?? ""} /></div>
          <div className="field"><label htmlFor="f-so">Sort by</label><select id="f-so" name="sort" defaultValue={qs.sort ?? "due"}><option value="due">Due date</option><option value="priority">Priority</option><option value="updated">Recently updated</option></select></div>
          <div className="field filter-check"><label><input type="checkbox" name="overdue" value="1" defaultChecked={qs.overdue === "1"} /> Overdue only</label></div>
          <button className="button">Apply</button>
        </form>
        {qs.filterError ? <p className="error" role="alert">{qs.filterError}</p> : null}
        {tasks.items.length === 0 ? <Empty>{qs.filterError ? "Correct the invalid filters above to view tasks." : tasks.total === 0 ? "No tasks have been created for this project yet." : "No tasks match these filters."}</Empty> :
          <TaskTable tasks={tasks.items} userId={userId} canManage={canManageLevel(level)} members={level === "MEMBER" ? self : members} milestones={milestones} />}
      </Card>
      <Card title="Create a task">
        <ActionForm action={createTaskAction} resetOnSuccess>
          <input type="hidden" name="projectId" value={p.id} />
          <TaskFields members={level === "MEMBER" ? self : members} milestones={milestones} />
          <SubmitButton>Create task</SubmitButton>
          {level === "MEMBER" ? <p className="muted small">Only project leaders can assign tasks to other members.</p> : null}
        </ActionForm>
      </Card>
    </div>
  );
}

export function MilestonesTab({ detail }: { detail: Detail }) {
  const { project: p, level } = detail;
  const mayEdit = level !== "MEMBER";
  return (
    <div className="stack">
      <Card title="Milestones">
        {p.milestones.length === 0 ? <Empty>No milestones yet. {mayEdit ? "Add the first one below." : "A leader or the supervisor can add them."}</Empty> : p.milestones.map((m) => (
          <div className="list-item" key={m.id}>
            <strong>{m.title}</strong> <Badge value={m.status} />
            <div className="muted">Due {fmtDate(m.dueDate)}{m.completedAt ? ` · completed ${fmtDate(m.completedAt)}` : ""}{m.description ? ` — ${m.description}` : ""}</div>
            {mayEdit ? (
              <>
                <ActionForm action={milestoneStatusAction} className="row">
                  <input type="hidden" name="milestoneId" value={m.id} />
                  <label className="sr-only" htmlFor={`ms-${m.id}`}>Milestone status</label>
                  <select id={`ms-${m.id}`} name="status" defaultValue={m.status}>{["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                  <SubmitButton variant="ghost" pendingText="…">Update</SubmitButton>
                </ActionForm>
                <details className="inline"><summary>Edit or delete</summary>
                  <ActionForm action={updateMilestoneAction}>
                    <input type="hidden" name="milestoneId" value={m.id} />
                    <div className="field"><label htmlFor={`mt-${m.id}`}>Title</label><input id={`mt-${m.id}`} name="title" defaultValue={m.title} required maxLength={150} /></div>
                    <div className="field"><label htmlFor={`md-${m.id}`}>Description</label><textarea id={`md-${m.id}`} name="description" defaultValue={m.description ?? ""} maxLength={2000} /></div>
                    <div className="field"><label htmlFor={`mdd-${m.id}`}>Due date</label><input id={`mdd-${m.id}`} name="dueDate" type="date" defaultValue={toInputDate(m.dueDate)} /></div>
                    <SubmitButton>Save changes</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteMilestoneAction}><input type="hidden" name="milestoneId" value={m.id} /><ConfirmButton message={`Delete the milestone "${m.title}"? Its tasks are kept.`}>Delete milestone</ConfirmButton></ActionForm>
                </details>
              </>
            ) : null}
          </div>
        ))}
      </Card>
      {mayEdit ? (
        <Card title="Add a milestone">
          <ActionForm action={createMilestoneAction} resetOnSuccess>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field"><label htmlFor="nm-t">Title</label><input id="nm-t" name="title" required maxLength={150} /></div>
            <div className="field"><label htmlFor="nm-d">Description (optional)</label><textarea id="nm-d" name="description" maxLength={2000} /></div>
            <div className="field"><label htmlFor="nm-due">Due date</label><input id="nm-due" name="dueDate" type="date" /></div>
            <SubmitButton>Add milestone</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

export function SubmissionsTab({ detail, subs }: { detail: Detail; subs: Awaited<ReturnType<typeof listSubmissions>> }) {
  const { project: p, level } = detail;
  const student = level === "LEADER" || level === "MEMBER";
  return (
    <div className="stack">
      <Card title="Submitted documents">
        {subs.items.length === 0 ? <Empty>No documents submitted yet.</Empty> : (
          <div className="table-wrap"><table><caption className="sr-only">Submissions</caption>
            <thead><tr><th>Title</th><th>Versions</th><th>Status</th><th>Updated</th></tr></thead>
            <tbody>{subs.items.map((s) => <tr key={s.id}><td><Link href={`/submissions/${s.id}`}><strong>{s.title}</strong></Link><div className="muted small">by {s.createdBy.name}</div></td><td>{s._count.versions}</td><td><Badge value={s.status} /></td><td>{fmtDate(s.updatedAt)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {student ? (
        <Card title="Submit a document">
          <ActionForm action={createSubmissionAction}>
            <input type="hidden" name="projectId" value={p.id} />
            <div className="field"><label htmlFor="s-t">Title</label><input id="s-t" name="title" required maxLength={150} placeholder="e.g. Literature review draft" /></div>
            <div className="field"><label htmlFor="s-d">Description</label><textarea id="s-d" name="description" required maxLength={3000} /></div>
            <div className="field"><label htmlFor="s-f">File</label><input id="s-f" name="file" type="file" required accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} /><small>Allowed: {ALLOWED_EXTENSIONS.join(", ")}. Maximum {maxUploadMb()} MB.</small></div>
            <div className="field"><label htmlFor="s-n">Note to supervisor (optional)</label><textarea id="s-n" name="note" maxLength={1000} /></div>
            <SubmitButton pendingText="Uploading…">Submit document</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
    </div>
  );
}

export function MembersTab({ detail, userId }: Ctx) {
  const { project: p, level } = detail;
  const manage = level === "LEADER";
  return (
    <div className="stack">
      <Card title="Members">
        <div className="table-wrap"><table><caption className="sr-only">Project members</caption>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
          <tbody>
            {p.members.map((m) => (
              <tr key={m.id}>
                <td>{m.user.name}</td><td>{level === "MEMBER" || level === "LEADER" || level === "ADMIN" || level === "SUPERVISOR" ? m.user.email : ""}</td>
                <td><span className={`badge ${m.role === "LEADER" ? "info" : "neutral"}`}>{label(m.role)}</span></td><td>{fmtDate(m.joinedAt)}</td>
                <td>
                  {manage ? (
                    <ActionForm action={setMemberRoleAction} className="row">
                      <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="userId" value={m.user.id} /><input type="hidden" name="role" value={m.role === "LEADER" ? "MEMBER" : "LEADER"} />
                      <SubmitButton variant="ghost" pendingText="…">{m.role === "LEADER" ? "Make member" : "Make leader"}</SubmitButton>
                    </ActionForm>
                  ) : null}
                  {manage || m.user.id === userId ? (
                    <ActionForm action={removeMemberAction}>
                      <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="userId" value={m.user.id} />
                      <ConfirmButton message={m.user.id === userId ? "Leave this project?" : `Remove ${m.user.name} from the project? Their tasks become unassigned.`}>{m.user.id === userId ? "Leave project" : "Remove"}</ConfirmButton>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody></table></div>
      </Card>
      {manage ? (
        <div className="grid2">
          <Card title="Add a student by email">
            <ActionForm action={addMemberAction} resetOnSuccess>
              <input type="hidden" name="projectId" value={p.id} />
              <div className="field"><label htmlFor="am-e">Student email</label><input id="am-e" name="email" type="email" required /></div>
              <SubmitButton>Add member</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Join code">
            <p>Share this code so students can join your project:</p>
            {p.joinCode ? <CopyJoinCode code={p.joinCode} /> : <p className="muted small">The join code is available to the project leader only.</p>}
            <ActionForm action={rotateCodeAction}><input type="hidden" name="projectId" value={p.id} /><SubmitButton variant="ghost">Generate a new code</SubmitButton></ActionForm>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

export function ActivityTab({ items }: { items: Awaited<ReturnType<typeof listActivity>> }) {
  return (
    <Card title="Activity timeline">
      {items.length === 0 ? <Empty>No activity yet.</Empty> : (
        <ul className="timeline">{items.map((a) => <li key={a.id}>{a.message}<time dateTime={a.createdAt.toISOString()}>{fmtDateTime(a.createdAt)}</time></li>)}</ul>
      )}
    </Card>
  );
}

export type { AccessLevel };
