import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { deleteTaskAction, taskStatusAction, updateTaskAction } from "@/app/actions/work";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/forms";
import { Badge } from "@/components/ui";
import { fmtDate, label, toInputDate } from "@/lib/format";
import { isOverdue } from "@/lib/progress";

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "COMPLETED"] as const;
export type TaskRow = Prisma.TaskGetPayload<{ include: { project: { select: { id: true; title: true } }; assignee: { select: { id: true; name: true } }; milestone: { select: { title: true } } } }>;
export type Option = { id: string; name: string };

export function StatusForm({ taskId, status }: { taskId: string; status: string }) {
  return (
    <ActionForm action={taskStatusAction} className="row">
      <input type="hidden" name="taskId" value={taskId} />
      <label className="sr-only" htmlFor={`st-${taskId}`}>Status</label>
      <select id={`st-${taskId}`} name="status" defaultValue={status}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
      <SubmitButton variant="ghost" pendingText="…">Update</SubmitButton>
    </ActionForm>
  );
}

export function TaskFields({ task, members, milestones }: { task?: TaskRow; members: Option[]; milestones: Option[] }) {
  const id = task?.id ?? "new";
  return (
    <>
      <div className="field"><label htmlFor={`t-${id}`}>Title</label><input id={`t-${id}`} name="title" defaultValue={task?.title} required maxLength={150} /></div>
      <div className="field"><label htmlFor={`d-${id}`}>Description</label><textarea id={`d-${id}`} name="description" defaultValue={task?.description} maxLength={3000} /></div>
      <div className="row">
        <div className="field"><label htmlFor={`p-${id}`}>Priority</label><select id={`p-${id}`} name="priority" defaultValue={task?.priority ?? "MEDIUM"}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></div>
        <div className="field"><label htmlFor={`due-${id}`}>Due date</label><input id={`due-${id}`} name="dueDate" type="date" defaultValue={toInputDate(task?.dueDate)} /></div>
        <div className="field"><label htmlFor={`a-${id}`}>Assignee</label><select id={`a-${id}`} name="assigneeId" defaultValue={task?.assigneeId ?? ""}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="field"><label htmlFor={`m-${id}`}>Milestone</label><select id={`m-${id}`} name="milestoneId" defaultValue={task?.milestoneId ?? ""}><option value="">None</option>{milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      </div>
    </>
  );
}

export function TaskTable({ tasks, userId, canManage, members, milestones, showProject }: {
  tasks: TaskRow[]; userId: string; canManage?: boolean; members?: Option[]; milestones?: Option[]; showProject?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table>
        <caption className="sr-only">Tasks</caption>
        <thead><tr><th>Task</th>{showProject ? <th>Project</th> : null}<th>Assignee</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
        <tbody>
          {tasks.map((t) => {
            const overdue = isOverdue(t.dueDate, t.status === "COMPLETED");
            const mayChange = canManage || t.assigneeId === userId;
            const mayEdit = canManage || t.creatorId === userId;
            return (
              <tr key={t.id}>
                <td>
                  <strong>{t.title}</strong>
                  {t.milestone ? <div className="muted small">Milestone: {t.milestone.title}</div> : null}
                  {t.description ? <div className="muted small">{t.description}</div> : null}
                  {mayEdit && members && milestones ? (
                    <details className="inline"><summary>Edit or delete</summary>
                      <ActionForm action={updateTaskAction}><input type="hidden" name="taskId" value={t.id} /><TaskFields task={t} members={members} milestones={milestones} /><SubmitButton>Save changes</SubmitButton></ActionForm>
                      <ActionForm action={deleteTaskAction}><input type="hidden" name="taskId" value={t.id} /><ConfirmButton message={`Delete the task "${t.title}"? This cannot be undone.`}>Delete task</ConfirmButton></ActionForm>
                    </details>
                  ) : null}
                </td>
                {showProject ? <td><Link href={`/projects/${t.project.id}?tab=tasks`}>{t.project.title}</Link></td> : null}
                <td>{t.assignee?.name ?? <span className="muted">Unassigned</span>}</td>
                <td><Badge value={t.priority} /></td>
                <td>{fmtDate(t.dueDate)}{overdue ? <div><span className="badge danger">Overdue</span></div> : null}</td>
                <td>{mayChange ? <StatusForm taskId={t.id} status={t.status} /> : <Badge value={t.status} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
