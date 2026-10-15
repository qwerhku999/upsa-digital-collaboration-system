"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function AccountMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <button
        ref={trigger}
        type="button"
        className="button ghost account-trigger"
        aria-expanded={open}
        aria-controls="account-menu-items"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-avatar" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        <span className="account-trigger-copy"><strong>{name}</strong><small>{role}</small></span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="menu-chevron"><path d="m3 6 5 5 5-5" /></svg>
      </button>
      <div className="account-popover" id="account-menu-items" aria-label="Account menu" hidden={!open}>
        <div className="account-popover-heading"><strong>{name}</strong><span>{role}</span></div>
        <Link href="/account/password" onClick={() => setOpen(false)}>Change password</Link>
      </div>
    </div>
  );
}
