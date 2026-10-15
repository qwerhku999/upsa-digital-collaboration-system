"use client";

import Link from "next/link";

export default function AppErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-page" role="alert">
      <section className="card">
        <div className="eyebrow">WORKSPACE ERROR</div>
        <h1>We couldn’t load this page</h1>
        <p className="muted">The request failed. You can retry, or return to the dashboard. If the problem continues, contact your system administrator.</p>
        <div className="error-actions">
          <button className="button" type="button" onClick={() => reset()}>Try again</button>
          <Link className="button ghost" href="/dashboard">Go to dashboard</Link>
        </div>
      </section>
    </div>
  );
}
