import { useState } from "react";
import { api, Matches, RefreshStatus, Scenario } from "../lib/api";
import { signed } from "../lib/format";
import { KEYS, load, save } from "../lib/storage";

export function RefreshPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(force: boolean) {
    setError(null);
    save(KEYS.adminToken, token, "session");
    try { setStatus(await api.refreshStart(token, force)); }
    catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't start the refresh."); return; }
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      let s: RefreshStatus;
      try { s = await api.refreshStatus(token); }
      catch { setError("Lost contact with the server during the refresh. The previous forecast is still in use."); return; }
      setStatus(s);
      if (s.state !== "running") {
        if (s.state === "done") await onDone();
        return;
      }
    }
  }

  const running = status?.state === "running";
  return (
    <details className="card admin">
      <summary>Admin: refresh trend data</summary>
      <p className="muted">Pulls the latest AI research counts (arXiv, or OpenAlex if arXiv is busy) and job-posting counts, then saves a new dated forecast. Older forecasts are kept.</p>
      <label>Admin token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <div className="actions">
        <button className="primary" disabled={running || !token} onClick={() => start(false)}>{running ? "Refreshing…" : "Refresh trend data"}</button>
        <button disabled={running || !token} onClick={() => start(true)}>Collect again (slower)</button>
      </div>
      {status && status.steps.length > 0 && <ol className="muted steps-log">{status.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {status?.state === "failed" && <p className="error" role="alert">Refresh failed: {status.error}. The previous forecast is still in use.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}

export interface Change { role_id: string; title: string; before: number; after: number; outlookBefore: number; outlookAfter: number }

// Roles whose rank moved, or whose outlook moved by at least half a point, biggest move first.
export function compareMatches(before: Matches, after: Matches, scenario: Scenario): Change[] {
  const old = new Map(before.roles.map((r) => [r.role_id, r]));
  return after.roles
    .flatMap((r) => {
      const o = old.get(r.role_id);
      if (!o) return [];
      return [{ role_id: r.role_id, title: r.title, before: o.rank, after: r.rank,
        outlookBefore: o.outlook[scenario].index, outlookAfter: r.outlook[scenario].index }];
    })
    .filter((c) => c.before !== c.after || Math.abs(c.outlookAfter - c.outlookBefore) >= 0.5)
    .sort((a, b) => Math.abs(b.outlookAfter - b.outlookBefore) - Math.abs(a.outlookAfter - a.outlookBefore));
}

export function WhatChanged({ changes, snapshot, onClose }: { changes: Change[]; snapshot: string; onClose: () => void }) {
  return (
    <div className="card changed" role="status">
      <p className="eyebrow">New trend data · {snapshot}</p>
      <h3>{changes.length === 0 ? "Nothing changed for you" : "Your plan changed because the trend data changed"}</h3>
      <ul>
        {changes.slice(0, 6).map((c) => (
          <li key={c.role_id}>
            <strong>{c.title}</strong>: rank #{c.before} → #{c.after}, outlook {signed(c.outlookBefore)}% → {signed(c.outlookAfter)}%
          </li>
        ))}
      </ul>
      <button className="link" onClick={onClose}>Dismiss</button>
    </div>
  );
}
