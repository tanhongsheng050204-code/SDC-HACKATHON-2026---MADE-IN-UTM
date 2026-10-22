import { useState } from "react";
import { AdminLogEntry, api } from "../lib/api";
import { KEYS, load, save } from "../lib/storage";

const ACTIONS: Record<string, string> = {
  trend_refresh_started: "Started a trend refresh",
  snapshot_approved: "Approved a forecast",
  snapshot_rejected: "Rejected a forecast",
  snapshot_imported: "Imported a forecast",
  evidence_search_started: "Started an evidence search",
  evidence_search_stopped: "Stopped an evidence search",
  evidence_approved: "Approved evidence",
  evidence_rejected: "Rejected evidence",
  counsellor_approved: "Approved a counsellor",
  counsellor_revoked: "Revoked a counsellor",
};

// Admin: every action taken on this page, newest first, with the name typed. Internal tool, English only.
export function AdminLogPanel() {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [log, setLog] = useState<AdminLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function refresh() {
    setError(null);
    save(KEYS.adminToken, token, "session");
    try { setLog(await api.adminLog(token)); }
    catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't load the log."); }
  }
  return (
    <div className="card admin-feedback">
      <h2>Admin action log</h2>
      <p className="muted">Every approval, rejection, refresh and counsellor decision, with who and when. No personal data.</p>
      <div className="progress-form">
        <label>Admin token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <button className="btn ink" onClick={refresh}>Load</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {log && (log.length === 0 ? <p className="muted">Nothing yet.</p> : (
        <div className="table-scroll">
          <table className="usage-table">
            <thead><tr><th scope="col">When (UTC)</th><th scope="col">Action</th><th scope="col">On</th><th scope="col">By</th></tr></thead>
            <tbody>{log.map((e, i) => (
              <tr key={i}><td>{e.created_at.slice(0, 16).replace("T", " ")}</td><td>{ACTIONS[e.action] ?? e.action}</td>
                <td>{e.subject ?? "—"}</td><td>{e.actor ?? "admin token"}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
