import Link from "next/link";
import { toneOf } from "@/lib/format";
import { label } from "@/lib/format";

export const Badge = ({ value }: { value: string }) => <span className={`badge ${toneOf(value)}`}>{label(value)}</span>;

export function Card({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="card">
      {title || action ? <div className="card-head">{title ? <h2>{title}</h2> : <span />}{action}</div> : null}
      {children}
    </section>
  );
}

export const PageHead = ({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) => (
  <div className="page-head"><div>{eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}<h1>{title}</h1></div>{children}</div>
);

export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div>{children}</div>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Progress({ value, text }: { value: number | null; text: string }) {
  return (
    <div>
      <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0} aria-label={text}><span style={{ width: `${value ?? 0}%` }} /></div>
      <small className="muted">{value === null ? `${text}: nothing recorded yet` : `${text}: ${value}%`}</small>
    </div>
  );
}

export function Pagination({ page, pages, base, params }: { page: number; pages: number; base: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(p));
    return `${base}?${q.toString()}`;
  };
  return (
    <nav className="pager" aria-label="Pagination">
      {page > 1 ? <Link className="button ghost" href={href(page - 1)}>← Previous</Link> : <span />}
      <span className="muted">Page {page} of {pages}</span>
      {page < pages ? <Link className="button ghost" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}

export const Stat = ({ label: l, value, hint }: { label: string; value: number | string; hint?: string }) => (
  <div className="card"><div className="muted">{l}</div><div className="number">{value}</div>{hint ? <div className="muted small">{hint}</div> : null}</div>
);
