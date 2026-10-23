import { useEffect, useState } from "react";
import { api, Matches, PendingPreview, RefreshStatus, Scenario } from "../lib/api";
import { signed } from "../lib/format";
import { KEYS, load, save } from "../lib/storage";
import { t, tf, tr } from "../lib/i18n";

// New trend data never reaches users on its own: a refresh saves a snapshot for review, and an
// admin approves it (with their name) or rejects it (with a reason) after seeing what would change.
export function RefreshPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [reviewer, setReviewer] = useState(() => load(KEYS.reviewer) ?? "");
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [preview, setPreview] = useState<PendingPreview | null>(null);
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPending(t = token) {
    if (!t) return;
    try {
      const waiting = await api.pending(t);
      setPreview(waiting.length ? await api.pendingPreview(t, waiting[0].snapshot_id) : null);
    } catch { /* wrong token or offline: the buttons below report it */ }
  }
  useEffect(() => { loadPending(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function start(force: boolean) {
    setError(null); setDecided(null);
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
        if (s.state === "done") await loadPending();
        return;
      }
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!preview) return;
    setError(null);
    save(KEYS.reviewer, reviewer.trim());
    try {
      await api.decide(token, preview.snapshot_id, decision, reviewer.trim(), reason.trim());
      setDecided(decision === "approve"
        ? `Approved by ${reviewer.trim()}. Everyone now sees ${preview.snapshot_id}.`
        : `Rejected by ${reviewer.trim()}. Users keep ${preview.live_snapshot_id}; the snapshot is kept for the record.`);
      setPreview(null); setReason(""); setStatus(null);
      if (decision === "approve") await onDone();
    } catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't save the decision. Try again."); }
  }

  const running = status?.state === "running";
  const moved = preview?.roles.filter((r) => r.change !== null && Math.abs(r.change) >= 0.5) ?? [];
  return (
    <details className="card admin" open={!!preview || undefined}>
      <summary>Admin: refresh trend data{preview && <span className="badge gold">1 waiting for review</span>}</summary>
      <p className="muted">Pulls the latest AI research counts (arXiv, or OpenAlex if arXiv is busy), job-posting counts and Malaysian employment by occupation (OpenDOSM), the monthly Malaysian labour force (OpenDOSM), how many Malaysian postings name each role (freehire.me) and the consumer price index, then builds a new dated forecast. <strong>Nothing changes for users until a person approves it.</strong> Older forecasts are kept.</p>
      <div className="two-col">
        <label>Admin token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onBlur={() => loadPending()} /></label>
        <label>Your name (recorded with your decision) <input type="text" maxLength={60} value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button className="primary" disabled={running || !token || !!preview} onClick={() => start(false)}>{running ? "Refreshing…" : "Refresh trend data"}</button>
        <button disabled={running || !token || !!preview} onClick={() => start(true)}>Collect again (slower)</button>
      </div>
      {status && status.steps.length > 0 && <ol className="muted steps-log">{status.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {status?.state === "failed" && <p className="error" role="alert">Refresh failed: {status.error}. The previous forecast is still in use.</p>}

      {preview && (
        <div className="review">
          <p className="eyebrow">Waiting for review · {preview.snapshot_id}</p>
          <h3>{moved.length === 0 ? "No role's outlook moves by more than half a point" : `${moved.length} roles would change (baseline scenario, to the horizon year)`}</h3>
          {moved.length > 0 && (
            <div className="table-wrap">
              <table className="heatmap">
                <thead><tr><th>Role</th><th>Now</th><th>Proposed</th><th>Change</th></tr></thead>
                <tbody>
                  {moved.map((r) => (
                    <tr key={r.role_id}>
                      <th scope="row">{tr(r.title)}</th>
                      <td>{r.before !== null ? `${signed(r.before)}%` : "new"}</td>
                      <td>{signed(r.after)}%{r.label_after !== r.label_before && <span className="badge">{r.label_after}</span>}</td>
                      <td className={r.change! < 0 ? "hm-risk" : "hm-good"}>{signed(r.change!)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">Skill trends: {preview.skills.rising} rising, {preview.skills.steady} steady, {preview.skills.declining} declining, {preview.skills.no_data} without data.
            {preview.inputs.map((i) => <span key={i.source}> · {i.source} (retrieved {i.retrieved})</span>)}</p>
          {preview.channels && (
            <p className="muted">Market-wide: the labour market adds {signed(preview.channels.labour_market_points ?? 0)} points to every role
              {preview.channels.labour_latest_month && ` (OpenDOSM, ${preview.channels.labour_latest_month})`}; live postings can move
              {" "}{preview.channels.roles_with_live_posting_points} role{preview.channels.roles_with_live_posting_points === 1 ? "" : "s"} this time
              {preview.channels.inflation_pct !== null && `; prices rising ${preview.channels.inflation_pct}% a year`}
              {preview.channels.sector_points && Object.keys(preview.channels.sector_points).length > 0
                && `; sector shift ${Object.entries(preview.channels.sector_points).map(([name, points]) => `${name} ${signed(points)}`).join(", ")}`}
              {!!preview.channels.malaysian_research_capabilities
                && `; Malaysian research measured for ${preview.channels.malaysian_research_capabilities} capabilities`}.</p>
          )}
          <label>Reason (needed to reject) <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. job-posting counts look too small this month" /></label>
          <div className="actions">
            <button className="primary" disabled={reviewer.trim().length < 2} onClick={() => decide("approve")}>Approve and publish</button>
            <button disabled={reviewer.trim().length < 2 || reason.trim().length < 3} onClick={() => decide("reject")}>Reject</button>
          </div>
        </div>
      )}
      {decided && <p className="badge good" role="status">{decided}</p>}
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
      <p className="eyebrow">{tf("chg.eyebrow", { id: snapshot })}</p>
      <h3>{changes.length === 0 ? t("chg.nothing") : t("chg.changed")}</h3>
      <ul>
        {changes.slice(0, 6).map((c) => (
          <li key={c.role_id}>
            <strong>{tr(c.title)}</strong>: {tf("chg.line", { from: c.before, to: c.after, o1: signed(c.outlookBefore), o2: signed(c.outlookAfter) })}
          </li>
        ))}
      </ul>
      <button className="link" onClick={onClose}>{t("a.dismiss")}</button>
    </div>
  );
}
