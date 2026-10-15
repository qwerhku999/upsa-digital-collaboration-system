import { createMeetingAction } from "@/app/actions/meetings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Empty } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import type { listMeetings } from "@/server/services/meetings";
import type { getProject } from "@/server/services/projects";

type Meetings = Awaited<ReturnType<typeof listMeetings>>;
type Detail = Awaited<ReturnType<typeof getProject>>;

export function MeetingsTab({ detail, meetings }: { detail: Detail; meetings: Meetings }) {
  const { project, level } = detail;
  const canRecord = level !== "MEMBER";

  return (
    <div className="stack">
      {canRecord ? (
        <Card title="Record a supervision meeting">
          <ActionForm action={createMeetingAction} resetOnSuccess>
            <input type="hidden" name="projectId" value={project.id} />
            <div className="field"><label htmlFor="meeting-at">Meeting date and time</label><input id="meeting-at" name="meetingAt" type="datetime-local" required /></div>
            <div className="field"><label htmlFor="meeting-summary">Summary</label><textarea id="meeting-summary" name="summary" required maxLength={5000} /></div>
            <div className="field"><label htmlFor="meeting-actions">Action items (optional)</label><textarea id="meeting-actions" name="actionItems" maxLength={5000} /></div>
            <SubmitButton pendingText="Saving…">Save meeting record</SubmitButton>
          </ActionForm>
        </Card>
      ) : null}
      <Card title="Supervision meeting history">
        {meetings.length === 0 ? (
          <Empty>{canRecord ? "No supervision meetings have been recorded yet." : "No supervision meeting records are available for this project yet."}</Empty>
        ) : meetings.map((meeting) => (
          <article className="list-item" key={meeting.id}>
            <strong>{fmtDateTime(meeting.meetingAt)}</strong>
            <div className="muted small">Recorded by {meeting.recordedBy.name} · {fmtDateTime(meeting.createdAt)}</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{meeting.summary}</p>
            {meeting.actionItems ? <><strong>Action items</strong><p style={{ whiteSpace: "pre-wrap" }}>{meeting.actionItems}</p></> : null}
          </article>
        ))}
      </Card>
    </div>
  );
}
