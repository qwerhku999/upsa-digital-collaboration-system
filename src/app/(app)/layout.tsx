import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { syncDeadlineNotifications, unreadCount } from "@/server/services/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await syncDeadlineNotifications(user); // reminders are generated server-side from real due dates
  return <AppShell user={user} unread={await unreadCount(user)}>{children}</AppShell>;
}
