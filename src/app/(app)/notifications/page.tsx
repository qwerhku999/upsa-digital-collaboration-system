import Link from "next/link";
import { markAllReadAction, markReadAction } from "@/app/actions/work";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Empty, PageHead, Pagination } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, label, one } from "@/lib/format";
import { listNotifications, unreadCount } from "@/server/services/notifications";

export const metadata = { title: "Notifications | Project Hub" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const unreadOnly = one(sp.filter) === "unread";
  const [{ items, pages }, unread] = await Promise.all([
    listNotifications(user, { page, unreadOnly }),
    unreadCount(user),
  ]);
  return (
    <>
      <PageHead eyebrow="UPDATES" title="Notifications">
        {unread > 0 ? <ActionForm action={markAllReadAction}><SubmitButton variant="ghost">Mark all as read</SubmitButton></ActionForm> : null}
      </PageHead>
      <Card>
        <nav className="filter-links" aria-label="Notification filters">
          <Link aria-current={!unreadOnly ? "page" : undefined} href="/notifications">All notifications</Link>
          <Link aria-current={unreadOnly ? "page" : undefined} href="/notifications?filter=unread">Unread only ({unread})</Link>
        </nav>
        {items.length === 0 ? <Empty action={unreadOnly ? <Link className="button ghost" href="/notifications">View all notifications</Link> : <Link className="button ghost" href="/projects">View projects</Link>}>{unreadOnly ? "You have no unread notifications." : "No notifications yet. Project and task updates will appear here."}</Empty> : items.map((n) => (
          <div className={`list-item ${n.readAt ? "" : "unread"}`} key={n.id}>
            <strong>{n.title}</strong> <span className="badge neutral">{label(n.type)}</span>
            <div>{n.message}</div>
            <div className="muted small">{fmtDateTime(n.createdAt)}</div>
            <div className="row">
              {n.link ? <Link href={n.link}>Open</Link> : null}
              {!n.readAt ? <ActionForm action={markReadAction}><input type="hidden" name="id" value={n.id} /><SubmitButton variant="ghost" pendingText="…">Mark as read</SubmitButton></ActionForm> : <span className="muted small">Read</span>}
            </div>
          </div>
        ))}
        <Pagination page={page} pages={pages} base="/notifications" params={{ filter: unreadOnly ? "unread" : undefined }} />
      </Card>
    </>
  );
}
