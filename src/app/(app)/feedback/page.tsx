import Link from "next/link";
import { Badge, Card, Empty, PageHead } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import { listRecentFeedback } from "@/server/services/feedback";

export const metadata = { title: "Feedback | Project Hub" };

export default async function FeedbackPage() {
  const user = await requireUser();
  const items = await listRecentFeedback(user, 40);
  return (
    <>
      <PageHead eyebrow="SUPERVISORY COMMUNICATION" title="Feedback" />
      <Card>
        {items.length === 0 ? <Empty>No feedback yet. Feedback appears here after a supervisor reviews a submission.</Empty> : items.map((f) => (
          <div className="list-item" key={f.id}>
            <Link href={`/submissions/${f.submission.id}`}><strong>{f.submission.title}</strong></Link> <Badge value={f.decision} />
            <div className="muted small">{f.submission.project.title} · version {f.version.versionNumber} · {f.author.name} · {fmtDateTime(f.createdAt)}</div>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{f.body}</p>
          </div>
        ))}
      </Card>
    </>
  );
}
