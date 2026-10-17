"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "./nav-link";

type NavigationItem = { href: string; text: string };

export function MobileNavigation({ items, unread }: { items: NavigationItem[]; unread: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="mobile-navigation">
      <div className="mobile-brand brand">PROJECT HUB<span>COLLABORATION &amp; SUPERVISION</span></div>
      <button
        className="button ghost mobile-menu-button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="mobile-navigation-dialog"
        onClick={() => setOpen(true)}
      >
        Menu
      </button>
      <dialog
        ref={dialogRef}
        id="mobile-navigation-dialog"
        className="mobile-drawer"
        aria-label="Main navigation"
        onClose={() => setOpen(false)}
      >
        <div className="drawer-head">
          <div className="brand">PROJECT HUB<span>COLLABORATION &amp; SUPERVISION</span></div>
          <button className="button ghost drawer-close" type="button" onClick={() => dialogRef.current?.close()}>
            Close
          </button>
        </div>
        <nav className="nav drawer-nav" aria-label="Main">
          {items.map(({ href, text }) => (
            <NavLink key={href} href={href} onNavigate={() => dialogRef.current?.close()}>
              {text}{href === "/notifications" && unread > 0 ? <span className="count" aria-label={`${unread} unread`}>{unread}</span> : null}
            </NavLink>
          ))}
        </nav>
        <p className="side-note">Task completion shows recorded activity. It is not an academic grade; supervisors make academic judgements.</p>
      </dialog>
    </div>
  );
}
