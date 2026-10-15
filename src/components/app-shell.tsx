import Link from "next/link";
import type { UserRole } from "@prisma/client";
import { logoutAction } from "@/app/actions/auth";
import { label } from "@/lib/format";
import { AccountMenu } from "./account-menu";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

const NAV: Record<UserRole, { href: string; text: string }[]> = {
  STUDENT: [
    { href: "/dashboard", text: "Dashboard" }, { href: "/projects", text: "My projects" }, { href: "/tasks", text: "Tasks" },
    { href: "/submissions", text: "Submissions" }, { href: "/feedback", text: "Feedback" }, { href: "/notifications", text: "Notifications" },
  ],
  SUPERVISOR: [
    { href: "/dashboard", text: "Dashboard" }, { href: "/projects", text: "Supervised projects" }, { href: "/tasks", text: "Tasks" },
    { href: "/submissions", text: "Reviews" }, { href: "/feedback", text: "Feedback" }, { href: "/reports", text: "Reports" }, { href: "/notifications", text: "Notifications" },
  ],
  ADMIN: [
    { href: "/dashboard", text: "Overview" }, { href: "/projects", text: "Projects" }, { href: "/tasks", text: "Tasks" },
    { href: "/submissions", text: "Submissions" }, { href: "/feedback", text: "Feedback" }, { href: "/notifications", text: "Notifications" },
    { href: "/reports", text: "Reports" }, { href: "/admin/users", text: "Users" }, { href: "/admin/audit", text: "Audit log" },
  ],
};

export function AppShell({ user, unread, children }: { user: { name: string; role: UserRole }; unread: number; children: React.ReactNode }) {
  return (
    <div className="layout">
      <a href="#main" className="skip">Skip to main content</a>
      <aside className="side">
        <div className="brand">PROJECT HUB<span>COLLABORATION &amp; SUPERVISION</span></div>
        <nav className="nav" aria-label="Main">
          {NAV[user.role].map((n) => (
            <NavLink key={n.href} href={n.href}>
              {n.text}{n.href === "/notifications" && unread > 0 ? <span className="count" aria-label={`${unread} unread`}>{unread}</span> : null}
            </NavLink>
          ))}
        </nav>
        <p className="side-note">Task completion shows recorded activity. It is not an academic grade; supervisors make academic judgements.</p>
      </aside>
      <main className="main" id="main">
        <header className="top">
          <span className="top-actions">
            <ThemeToggle />
            <AccountMenu name={user.name} role={label(user.role)} />
            <form action={logoutAction}><button className="button sign-out">Sign out</button></form>
          </span>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
