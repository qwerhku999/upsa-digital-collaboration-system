"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children, onNavigate }: { href: string; children: React.ReactNode; onNavigate?: () => void }) {
  const path = usePathname();
  const active = path === href || (href !== "/dashboard" && path.startsWith(`${href}/`));
  return <Link href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate}>{children}</Link>;
}
