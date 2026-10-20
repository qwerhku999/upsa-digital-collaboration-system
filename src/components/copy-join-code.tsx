"use client";

import { useState } from "react";

export function CopyJoinCode({ code }: { code: string }) {
  const [message, setMessage] = useState("");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Join code copied.");
    } catch {
      setMessage("Copy failed. Select and copy the code shown here.");
    }
  }

  return (
    <div className="join-code">
      <strong className="mono" aria-label={`Project join code: ${code}`}>{code}</strong>
      <button className="button ghost" type="button" onClick={copyCode}>Copy code</button>
      <span className="muted small" role="status" aria-live="polite">{message}</span>
    </div>
  );
}
