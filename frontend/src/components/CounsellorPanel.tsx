import { useState } from "react";
import { api, Counsellor } from "../lib/api";
import { KEYS, load, save } from "../lib/storage";

// Admin: approve or revoke career-centre counsellors. Internal tool, English only.
export function CounsellorPanel() {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [reviewer, setReviewer] = useState(() => load(KEYS.reviewer) ?? "");
  const [list, setList] = useState<Counsellor[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    save(KEYS.adminToken, token, "session");
    try { setList(await api.adminCounsellors(token)); }
    catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't load counsellors."); }
  }
  async function decide(c: Counsellor, approve: boolean) {
    if (reviewer.trim().length < 2) { setError("Type your name first."); return; }
    save(KEYS.reviewer, reviewer);
    try { await api.decideCounsellor(token, c.user_id, approve, reviewer.trim()); await refresh(); }
    catch { setError("Couldn't save that decision."); }
  }
  return (
    <div className="card admin-feedback">
      <h2>Career-centre counsellors</h2>
      <p className="muted">Approved counsellors can create classes. A student who joins shares only their name, destination, readiness, courses finished, skills proven, last active, target date and on-track status. Revoking stops their dashboards at once.</p>
      <div className="progress-form">
        <label>Admin token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <label>Your name<input value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></label>
        <button className="btn ink" onClick={refresh}>Load</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {list && (list.length === 0 ? <p className="muted">No requests yet.</p> : (
        <ul className="feedback-list">{list.map((c) => (
          <li key={c.user_id}>
            <span className={`badge ${c.status === "approved" ? "good" : c.status === "revoked" ? "risk" : "sun"}`}>{c.status}</span>{" "}
            <strong>{c.name}</strong>, {c.organisation} <span className="muted">· {c.email ?? "no email"} · asked {c.requested_at.slice(0, 10)}
              {c.decided_by ? ` · ${c.status} by ${c.decided_by}` : ""}</span>
            <div className="actions">
              {c.status !== "approved" && <button className="btn ink sm" onClick={() => decide(c, true)}>Approve</button>}
              {c.status === "approved" && <button className="btn quiet sm" onClick={() => decide(c, false)}>Revoke</button>}
            </div>
          </li>
        ))}</ul>
      ))}
    </div>
  );
}
