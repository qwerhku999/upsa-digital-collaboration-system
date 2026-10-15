import Link from "next/link";
import { notFound } from "next/navigation";
import { addVersionAction, feedbackAction } from "@/app/actions/work";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { ALLOWED_EXTENSIONS } from "@/lib/files";
import { fmtDateTime } from "@/lib/format";
import { getSubmission } from "@/server/services/submissions";

export const metadata = { title: "Submission | Project Hub" };

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let data;
  try {
    data = await getSubmission(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { submission: s, project, level } = data;
  const student = level === "LEADER" || level === "MEMBER";
  const awaiting = s.status === "SUBMITTED";
  const canReview = level === "SUPERVISOR" && awaiting;

  return (
    <>
      <PageHead eyebrow="SUBMISSION" title={s.title}><Badge value={s.status} /></PageHead>
      <p><Link href={`/projects/${project.id}?tab=submissions`}>← {project.title}</Link></p>
      <Card><p style={{ whiteSpace: "pre-wrap" }}>{s.description}</p><p className="muted small">Submitted by {s.createdBy.name} on {fmtDateTime(s.createdAt)}</p></Card>

      <div className="grid2" style={{ marginTop: 16 }}>
        <Card title="Version history">
          {s.versions.map((v) => (
            <div className="list-item" key={v.id}>
              <strong>Version {v.versionNumber}</strong> · <a href={`/api/files/${v.id}`}>Download {v.originalName}</a>
              <div className="muted small">{(v.sizeBytes / 1024).toFixed(1)} KB · {v.uploadedBy.name} · {fmtDateTime(v.createdAt)}</div>
              {v.note ? <div className="small">Note: {v.note}</div> : null}
            </div>
          ))}
          {s.status === "REVISION_REQUIRED" && student ? (
            <ActionForm action={addVersionAction}>
              <input type="hidden" name="submissionId" value={s.id} />
              <h3>Upload a revised version</h3>
              <div className="field"><label htmlFor="v-f">File</label><input id="v-f" name="file" type="file" required accept={ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",")} /></div>
              <div className="field"><label htmlFor="v-n">What changed? (optional)</label><textarea id="v-n" name="note" maxLength={1000} /></div>
              <SubmitButton pendingText="Uploading…">Upload new version</SubmitButton>
            </ActionForm>
          ) : null}
        </Card>

        <Card title="Feedback and review history">
          {s.feedback.length === 0 ? <Empty>No feedback yet.</Empty> : s.feedback.map((f) => (
            <div className="list-item" key={f.id}>
              <strong>{f.author.name}</strong> <span className="badge neutral">{f.author.role.toLowerCase()}</span> <Badge value={f.decision} />
              <div className="muted small">On version {f.version.versionNumber} · {fmtDateTime(f.createdAt)}</div>
              <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{f.body}</p>
              {f.strengths ? <><strong>Strengths</strong><p style={{ whiteSpace: "pre-wrap" }}>{f.strengths}</p></> : null}
              {f.areasForImprovement ? <><strong>Areas for improvement</strong><p style={{ whiteSpace: "pre-wrap" }}>{f.areasForImprovement}</p></> : null}
              {f.nextSteps ? <><strong>Suggested next steps</strong><p style={{ whiteSpace: "pre-wrap" }}>{f.nextSteps}</p></> : null}
            </div>
          ))}
          <ActionForm action={feedbackAction} resetOnSuccess>
            <input type="hidden" name="submissionId" value={s.id} />
            <h3>{canReview ? "Review latest version" : "Add a comment"}</h3>
            {canReview ? (
              <>
                <div className="field"><label htmlFor="decision">Review outcome</label>
                  <select id="decision" name="decision" defaultValue="COMMENT"><option value="COMMENT">Comment only</option><option value="REVISION_REQUIRED">Request revision</option><option value="ACCEPTED">Accept this version</option></select>
                  <small>Your decision is your academic judgement; the system does not score or grade.</small></div>
                <div className="field"><label htmlFor="strengths">Strengths (optional)</label><textarea id="strengths" name="strengths" maxLength={3000} /></div>
                <div className="field"><label htmlFor="areas-for-improvement">Areas for improvement (optional)</label><textarea id="areas-for-improvement" name="areasForImprovement" maxLength={3000} /></div>
                <div className="field"><label htmlFor="next-steps">Suggested next steps (optional)</label><textarea id="next-steps" name="nextSteps" maxLength={3000} /></div>
              </>
            ) : (
              <>
                <input type="hidden" name="decision" value="COMMENT" />
                {level === "SUPERVISOR" ? <p className="muted small">A review decision is available only while the latest version is awaiting review.</p> : null}
              </>
            )}
            <div className="field"><label htmlFor="body">{canReview ? "Overall feedback" : "Comment"}</label><textarea id="body" name="body" required maxLength={5000} /></div>
            <SubmitButton>{canReview ? "Save review" : "Post comment"}</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
