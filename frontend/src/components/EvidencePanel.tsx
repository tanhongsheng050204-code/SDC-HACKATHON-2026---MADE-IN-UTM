import { useEffect, useState } from "react";
import { api, EmergingDetail, EmergingPending, EvidenceDetail, EvidencePending, EvidenceStatus } from "../lib/api";
import { KEYS, load, save } from "../lib/storage";
import { EvidenceBadge } from "./SkillEvidence";

// Skill evidence never reaches users on its own: a search saves one result per role for review,
// and an admin approves it (after unticking any quote or added skill they doubt) or rejects it.
export function EvidencePanel({ onDone }: { onDone: () => Promise<void> }) {
  const [token, setToken] = useState(() => load(KEYS.adminToken, "session") ?? "");
  const [reviewer, setReviewer] = useState(() => load(KEYS.reviewer) ?? "");
  const [status, setStatus] = useState<EvidenceStatus | null>(null);
  const [pending, setPending] = useState<EvidencePending[]>([]);
  const [detail, setDetail] = useState<EvidenceDetail | null>(null);
  const [emerging, setEmerging] = useState<EmergingPending[]>([]);
  const [card, setCard] = useState<EmergingDetail | null>(null);
  const [dropSources, setDropSources] = useState<Set<string>>(new Set());
  const [dropAdded, setDropAdded] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPending(t = token) {
    if (!t) return;
    try { setPending(await api.evidencePending(t)); setEmerging(await api.emergingPending(t)); }
    catch { /* wrong token or offline: buttons report it */ }
  }
  useEffect(() => { loadPending(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function start(mode: "roles" | "emerging" = "roles") {
    setError(null); setNote(null);
    save(KEYS.adminToken, token, "session");
    try { setStatus(await api.evidenceStart(token, mode)); }
    catch (e) { setError(String(e).includes("401") ? "Admin token required." : String(e).includes("409") ? "A search is already running." : "Couldn't start the search."); return; }
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      let s: EvidenceStatus;
      try { s = await api.evidenceStatus(token); }
      catch { setError("Lost contact with the server during the search."); return; }
      setStatus(s);
      if (s.state !== "running") { await loadPending(); return; }
    }
  }

  async function open(id: string) {
    setError(null); setNote(null);
    try {
      setDetail(await api.evidenceDetail(token, id));
      setDropSources(new Set()); setDropAdded(new Set()); setReason("");
    } catch { setError("Couldn't open that result."); }
  }

  function toggle(set: Set<string>, value: string, update: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    update(next);
  }

  async function openCard(id: string) {
    setError(null); setNote(null); setReason("");
    try { setCard(await api.emergingDetail(token, id)); } catch { setError("Couldn't open that card."); }
  }

  async function decideCard(decision: "approve" | "reject") {
    if (!card) return;
    setError(null);
    save(KEYS.reviewer, reviewer.trim());
    try {
      await api.evidenceDecide(token, card.id, decision, { reviewer: reviewer.trim(), reason: reason.trim() || undefined });
      setNote(`${decision === "approve" ? "Approved" : "Rejected"}: ${card.title.en}, by ${reviewer.trim()}.`);
      setCard(null);
      await loadPending();
      if (decision === "approve") await onDone();
    } catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't save the decision. Try again."); }
  }

  async function decide(decision: "approve" | "reject") {
    if (!detail) return;
    setError(null);
    save(KEYS.reviewer, reviewer.trim());
    try {
      await api.evidenceDecide(token, detail.id, decision, {
        reviewer: reviewer.trim(), reason: reason.trim() || undefined,
        drop_sources: [...dropSources], drop_added: [...dropAdded],
      });
      setNote(`${decision === "approve" ? "Approved" : "Rejected"}: ${detail.title}, by ${reviewer.trim()}.`);
      setDetail(null);
      await loadPending();
      if (decision === "approve") await onDone();
    } catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't save the decision. Try again."); }
  }

  const running = status?.state === "running";
  const name = (id: string) => detail?.skill_names[id] ?? id;
  return (
    <details className="card admin" open={pending.length + emerging.length > 0 || undefined}>
      <summary>Admin: skill evidence and emerging roles{pending.length + emerging.length > 0 && <span className="badge gold">{pending.length + emerging.length} waiting for review</span>}</summary>
      <p className="muted">Searches the web for current Malaysian job ads for every role and the exact sentences that ask for each skill (about 2 minutes). Skills that 2+ ads ask for are proposed for the role. <strong>Nothing changes for users until you approve a role.</strong> Open each link you doubt; untick a whole page, or one quote that is not on the page or is tagged with the wrong skill.</p>
      <div className="two-col">
        <label>Admin token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onBlur={() => loadPending()} /></label>
        <label>Your name (recorded with your decision) <input type="text" maxLength={60} value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></label>
      </div>
      <div className="actions">
        <button className="primary" disabled={running || !token} onClick={() => start("roles")}>{running ? "Searching…" : "Refresh skill evidence"}</button>
        <button disabled={running || !token} onClick={() => start("emerging")} title="One web search per AI capability, about 5 minutes">Find emerging roles</button>
      </div>
      {status && status.steps.length > 0 && <ol className="muted steps-log">{status.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {status?.state === "failed" && <p className="error" role="alert">Search failed: {status.error}</p>}

      {emerging.length > 0 && !detail && !card && (
        <div className="table-wrap">
          <table className="heatmap">
            <thead><tr><th>Emerging role (prediction)</th><th>From AI capability</th><th>Sources</th><th></th></tr></thead>
            <tbody>{emerging.map((e) => (
              <tr key={e.id}>
                <th scope="row">{e.title}</th><td>{e.capability_name}{e.momentum !== null && ` (+${e.momentum.toFixed(2)})`}</td>
                <td>{e.sources}</td><td><button className="link" onClick={() => openCard(e.id)}>Review</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {card && (
        <div className="review">
          <p className="eyebrow">Emerging role waiting for review · from {card.capability_name} · searched {card.searched}</p>
          <h3>{card.title.en}</h3>
          <p className="muted">BM: {card.title.ms} · 中文: {card.title.zh}</p>
          <p>{card.summary.en}</p>
          <p><strong>Stepping stone:</strong> {card.stepping_stone_title}. {card.stepping_reason.en}</p>
          <p><strong>Skills:</strong> {card.skills.map((s) => card.skill_names[s] ?? s).join(", ")}</p>
          {card.sdg && <p><strong>SDG {card.sdg.number}:</strong> {card.sdg.reason.en}</p>}
          <h3>Sources ({card.sources.length})</h3>
          {card.sources.map((s) => (
            <div key={s.url} className="evidence-page">
              <strong>{s.title || s.url}</strong> <span className="badge">{s.kind === "job_ad" ? "Job ad" : "Web page"}</span>
              {!s.grounded && <span className="badge risk">not among the search's sources: check it</span>}
              <p><q>{s.quote}</q></p>
              <a className="source" href={s.url} target="_blank" rel="noreferrer">{s.url} ↗</a>
            </div>
          ))}
          <p className="muted">Check that the job title is real (open the sources), that the stepping stone makes sense, and that the BM and 中文 titles read naturally. Approving shows this card to every user, labelled as a prediction; it is never ranked.</p>
          <label>Reason (needed to reject) <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the source is a blog, not a real job" /></label>
          <div className="actions">
            <button className="primary" disabled={reviewer.trim().length < 2} onClick={() => decideCard("approve")}>Approve</button>
            <button disabled={reviewer.trim().length < 2 || reason.trim().length < 3} onClick={() => decideCard("reject")}>Reject</button>
            <button className="link" onClick={() => setCard(null)}>Back to the list</button>
          </div>
        </div>
      )}

      {pending.length > 0 && !detail && !card && (
        <div className="table-wrap">
          <table className="heatmap">
            <thead><tr><th>Role</th><th>Job ads</th><th>Other pages</th><th>Proposed skills</th><th></th></tr></thead>
            <tbody>{pending.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.title}{p.widened && <span className="badge">widened</span>}</th>
                <td>{p.job_ads}</td><td>{p.pages - p.job_ads}</td><td>{p.added_names.length ? p.added_names.join(", ") : "—"}</td>
                <td><button className="link" onClick={() => open(p.id)}>Review</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {detail && (
        <div className="review">
          <p className="eyebrow">Waiting for review · {detail.title} · searched {detail.searched}{detail.widened && " · widened to any page"}</p>
          {detail.summary.added.length > 0 && (
            <>
              <h3>Skills to add to this role (weight 1)</h3>
              {detail.summary.added.map((a) => (
                <label key={a.skill_id} className="check">
                  <input type="checkbox" checked={!dropAdded.has(a.skill_id)} onChange={() => toggle(dropAdded, a.skill_id, setDropAdded)} />
                  {name(a.skill_id)} · {a.job_ads} job ads
                </label>
              ))}
            </>
          )}
          <h3>The role's skills</h3>
          <ul className="plain-list">{detail.role_skills.map((id) => {
            const e = detail.summary.skills[id];
            return <li key={id}>{name(id)} {e && <EvidenceBadge e={e} />}</li>;
          })}</ul>
          <h3>Pages found ({detail.sources.length})</h3>
          {detail.sources.map((page) => (
            <div key={page.url} className={`evidence-page ${dropSources.has(page.url) ? "dropped" : ""}`}>
              <label className="check">
                <input type="checkbox" checked={!dropSources.has(page.url)} onChange={() => toggle(dropSources, page.url, setDropSources)} />
                <strong>{page.employer || page.title}</strong> <span className="badge">{page.kind === "job_ad" ? "Job ad" : "Web page"}</span>
                {!page.grounded && <span className="badge risk">not among the search's sources: check it</span>}
              </label>
              <ul className="citations">{page.quotes.map((q, i) => {
                const key = `${page.url}#${q.skill_id}`;
                return (
                  <li key={i}><label className="check">
                    <input type="checkbox" disabled={!q.skill_id || dropSources.has(page.url)} checked={!dropSources.has(key) && !dropSources.has(page.url)}
                      onChange={() => toggle(dropSources, key, setDropSources)} />
                    <span><strong>{q.skill_id ? name(q.skill_id) : `${q.skill_name} (not in catalogue)`}</strong>: <q>{q.quote}</q></span>
                  </label></li>
                );
              })}</ul>
              <a className="source" href={page.url} target="_blank" rel="noreferrer">{page.url} ↗</a>
            </div>
          ))}
          {detail.summary.not_in_catalogue.length > 0 && (
            <p className="muted">Named in ads but not in our catalogue (for the team): {detail.summary.not_in_catalogue.map((n) => `${n.name} (${n.count})`).join(", ")}</p>
          )}
          <label>Reason (needed to reject) <input type="text" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. most ads are from Singapore" /></label>
          <div className="actions">
            <button className="primary" disabled={reviewer.trim().length < 2} onClick={() => decide("approve")}>Approve</button>
            <button disabled={reviewer.trim().length < 2 || reason.trim().length < 3} onClick={() => decide("reject")}>Reject</button>
            <button className="link" onClick={() => setDetail(null)}>Back to the list</button>
          </div>
        </div>
      )}
      {note && <p className="badge good" role="status">{note}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}
