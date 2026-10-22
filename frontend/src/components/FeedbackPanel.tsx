import { useState } from "react";
import { api, AdminFeedback, AdminUsage } from "../lib/api";
import { KEYS, load, save } from "../lib/storage";

const EVENTS = ["onboarding_started", "onboarding_finished", "demo_opened", "destination_set", "course_finished",
  "skill_proven", "card_created", "coach_asked", "app_installed"];

// Admin: what people said ("Was this helpful?", problem reports) and anonymous usage counts.
// Internal tool, so English only, like the rest of the Admin page.
export function FeedbackPanel() {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [days, setDays] = useState(30);
  const [feedback, setFeedback] = useState<AdminFeedback | null>(null);
  const [usage, setUsage] = useState<AdminUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setError(null);
    save(KEYS.adminToken, token, "session");
    try {
      const [f, u] = await Promise.all([api.adminFeedback(token), api.adminUsage(token, days)]);
      setFeedback(f); setUsage(u);
    } catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't load feedback."); }
  }

  const share = (target: string) => {
    const yes = feedback?.totals.find((x) => x.target === target && x.helpful === true)?.count ?? 0;
    const no = feedback?.totals.find((x) => x.target === target && x.helpful === false)?.count ?? 0;
    return `${yes} helpful · ${no} not helpful`;
  };
  const dayList = usage ? [...new Set(usage.days.map((d) => d.day))] : [];

  return (
    <div className="card admin-feedback">
      <h2>Feedback and usage</h2>
      <p className="muted">No profile IDs: feedback keeps the day and the note with contact details removed; usage is a count per event per day.</p>
      <div className="progress-form">
        <label>Admin token<input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
        <label>Days<select value={days} onChange={(e) => setDays(Number(e.target.value))}>{[7, 30, 90].map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        <button className="btn ink" onClick={loadAll}>Load</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {usage && (
        <>
          <h3>Usage since {usage.since}</h3>
          <div className="table-scroll">
            <table className="usage-table">
              <thead><tr><th scope="col">Event</th><th scope="col">Total</th>{dayList.slice(-7).map((d) => <th key={d} scope="col">{d.slice(5)}</th>)}</tr></thead>
              <tbody>{EVENTS.map((e) => (
                <tr key={e}><th scope="row">{e.replace(/_/g, " ")}</th><td>{usage.totals[e] ?? 0}</td>
                  {dayList.slice(-7).map((d) => <td key={d}>{usage.days.find((x) => x.day === d && x.event === e)?.count ?? 0}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}
      {feedback && (
        <>
          <h3>Was this helpful?</h3>
          <p>Coach answers: {share("coach")}. Role advice: {share("role_advice")}.</p>
          <h3>Latest feedback and problem reports</h3>
          {feedback.recent.length === 0 ? <p className="muted">Nothing yet.</p> : (
            <ul className="feedback-list">{feedback.recent.map((f, i) => (
              <li key={i}>
                <span className="badge">{f.day}</span>{" "}
                <span className={`badge ${f.target === "problem" ? "sun" : f.helpful ? "good" : "risk"}`}>
                  {f.target === "problem" ? `Problem${f.screen ? ` · ${f.screen}` : ""}` : `${f.target === "coach" ? "Coach" : `Role ${f.subject}`}: ${f.helpful ? "helpful" : "not helpful"}`}
                </span>
                {f.reason && <span className="muted"> · {f.reason.replace(/_/g, " ")}</span>}
                {f.language && <span className="muted"> · {f.language}</span>}
                {f.note && <p>{f.note}</p>}
              </li>
            ))}</ul>
          )}
        </>
      )}
    </div>
  );
}
