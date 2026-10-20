import { useEffect, useState } from "react";
import { ShareCard } from "../components/ShareCard";
import { api, MalaysiaPay, Pathway, Profile, RoleMatch, Scenario } from "../lib/api";
import { jobLinks, onetUrl, percent, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { COST, HRD, OUTLOOK_TEXT, priceText, SCENARIOS } from "../lib/labels";

export function RoleDetail({ profile, role, scenario, onImpact, onProfile, onBack }: {
  profile: Profile; role: RoleMatch; scenario: Scenario;
  onImpact: () => void; onProfile: (p: Profile) => void; onBack: () => void;
}) {
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<MalaysiaPay | null>(null);
  useEffect(() => { api.role(role.role_id).then((r) => setLocal(r.malaysia)).catch(() => setLocal(null)); }, [role.role_id]);

  async function build() {
    setBusy(true); setError(null);
    try { setPlan(await api.pathway(profile.id, role.role_id)); }
    catch { setError("Couldn't build the plan. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  async function toggle(courseId: string, done: boolean) {
    try {
      onProfile(await api.complete(profile.id, courseId, done));
      setPlan(await api.pathway(profile.id, role.role_id));
    } catch { setError("Couldn't save your progress. Try again."); }
  }

  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {t("nav.roles")}</button>
      <div className="page-head"><h1>{role.title}</h1><p className="muted">{role.summary}</p></div>

      <details className="card why" open>
        <summary>Why this rank? Score {role.why.score.toFixed(2)}</summary>
        <ul>
          <li>Skill fit {percent(role.why.fit)}% × 0.6 = <strong>{role.why.fit_points.toFixed(2)}</strong></li>
          <li>Outlook in this scenario, scaled 0–1, × 0.4 = <strong>{role.why.outlook_points.toFixed(2)}</strong></li>
          <li>Serves a goal you chose: <strong>+{role.why.sdg_points.toFixed(2)}</strong>{role.why.matched_sdgs.length > 0 && ` (SDG ${role.why.matched_sdgs.join(", ")})`}</li>
        </ul>
        <p className="source">Outlook source: {role.citation.snapshot_id}, imported {role.citation.imported}{role.citation.note && ` · ${role.citation.note}`}</p>
      </details>

      <table className="outlooks">
        <caption>Outlook in each scenario (current: {scenario})</caption>
        <tbody>{SCENARIOS.map((s) => {
          const o = role.outlook[s.id];
          return <tr key={s.id}><th scope="row">{s.label}</th><td className={`outlook ${o.label}`}>{OUTLOOK_TEXT[o.label]}</td><td>{o.index > 0 ? "+" : ""}{o.index}%</td></tr>;
        })}</tbody>
      </table>

      {local && <InMalaysia pay={local} wefChange={role.outlook.baseline.index} />}

      <div className="job-links"><span className="muted">See open jobs:</span>
        {jobLinks(role.title).map((l) => <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>

      <div className="two-col">
        <div><h2>You have</h2><div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)}</div></div>
        <div><h2>You need</h2><div className="chips">{role.missing.map((s) => <span key={s.skill_id} className="chip missing">{s.name}{s.weight === 3 ? " (core)" : ""}</span>)}</div></div>
      </div>
      <p className="source">Skills for this role: the Laluan team's list{role.skills_source.onet_code
        ? <>, checked against O*NET occupation <a href={onetUrl(role.skills_source.onet_code)} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a>{role.skills_source.onet_note && ` (${role.skills_source.onet_note.replace(/\.$/, "")})`}</>
        : " (a new role with no O*NET occupation yet)"}.</p>

      {role.missing.length === 0 && (
        <div className="empty-state">
          <p><strong>You already have every skill on our list for this role.</strong> Apply for it now, or pick a stretch role higher up the list to keep growing.</p>
          <div className="actions">
            <button onClick={onBack}>Choose a stretch role</button>
            <button onClick={onImpact}>{t("a.impact")}</button>
          </div>
        </div>
      )}
      {role.missing.length > 0 && !plan && (
        <button className="primary" disabled={busy} onClick={build}>{busy ? t("a.building") : t("a.build")}</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {plan && <Plan plan={plan} role={role} onToggle={toggle} />}
      {plan && (
        <>
          <div className="actions">
            <button className="primary" onClick={onImpact}>{t("a.impact")}</button>
            <button onClick={() => window.print()}>{t("a.print")}</button>
          </div>
          <ShareCard profile={profile} roleId={role.role_id} />
        </>
      )}
    </section>
  );
}

function Plan({ plan, role, onToggle }: { plan: Pathway; role: RoleMatch; onToggle: (courseId: string, done: boolean) => void }) {
  const done = plan.steps.filter((s) => s.done);
  const uncovered = plan.uncovered_skills.map((id) => role.missing.find((m) => m.skill_id === id)?.name ?? id);
  return (
    <>
      <div className="readiness card">
        <div className="card-row"><h3>Readiness for {role.title}</h3><strong className="readiness-num">{percent(plan.readiness)}%</strong></div>
        <div className="fit" role="img" aria-label={`Readiness ${percent(plan.readiness)} percent`}><div style={{ width: `${plan.readiness * 100}%` }} /></div>
        <p className="muted">Started at {percent(plan.fit)}% · {done.length} of {plan.steps.length} steps done · about {plan.hours_left} hours left</p>
        {done.length > 0 && (
          <div className="chips">{done.flatMap((s) => s.skills).map((k) => <span key={k.skill_id} className="badge gold">★ {k.name}</span>)}</div>
        )}
      </div>
      <h3>Your pathway: {plan.steps.length} steps, about {plan.total_hours} hours</h3>
      <p>{plan.summary}</p>
      {plan.grounding && (
        <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
          {plan.grounding.all_supported ? "Every sentence is backed by the course catalogue" : `Check sentences ${plan.grounding.unsupported.join(", ")}: not found in the catalogue`}
        </p>
      )}
      {uncovered.length > 0 && (
        <p className="muted">No course in our catalogue teaches {uncovered.join(", ")} yet. Ask a counsellor or your employer about on-the-job training.</p>
      )}
      <ol className="steps">
        {plan.steps.map((s) => {
          const c = s.course;
          return (
            <li key={s.step} className={s.done ? "card is-done" : "card"}>
              <div className="card-row"><strong>{s.skills.map((k) => k.name).join(", ")}</strong>
                <span className="step-badges">
                  <span className={`badge ${COST[c.cost]?.tone ?? ""}`}>{c.cost === "paid" ? priceText(c.price_rm, c.cost) : COST[c.cost]?.label ?? c.cost}</span>
                  {c.hrd_corp && HRD[c.hrd_corp] && <span className={`badge ${HRD[c.hrd_corp].tone}`} title={c.hrd_note}>{HRD[c.hrd_corp].label}</span>}
                </span></div>
              <span>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title} · {c.provider}</span>
              <span className="muted">About {c.hours} hours · {c.level} · {s.why}</span>
              <span className="source">From the Laluan course catalogue · {c.url ? (c.checked ? `link checked ${c.checked}` : "link not yet checked") : "no single course page: search the provider"}</span>
              {c.price_note && <span className="source">{c.price_note}{c.hrd_note ? ` ${c.hrd_note}` : ""}{c.price_checked ? ` Price checked ${c.price_checked}.` : ""}</span>}
              {c.cost === "paid" && <span className="source">Prices change: confirm with the provider, and ask your employer about an HRD Corp claim before enrolling.</span>}
              <label className="check"><input type="checkbox" checked={s.done} onChange={(e) => onToggle(c.id, e.target.checked)} /> I finished this</label>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// Local reality next to the global forecast: DOSM pay and employee numbers for the role's MASCO
// group. The two can disagree (Malaysian clerical jobs still grew after 2019); we show both.
function InMalaysia({ pay, wefChange }: { pay: MalaysiaPay; wefChange: number }) {
  const change = pay.employees_change_pct;
  return (
    <div className="card in-malaysia">
      <div className="card-row"><h3>In Malaysia today</h3><span className="badge">{pay.label}</span></div>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Median monthly pay, {pay.year}</span><strong>RM {pay.median_rm.toLocaleString("en-MY")}</strong>
          <span className="badge">mean RM {pay.mean_rm.toLocaleString("en-MY")}</span></div>
        <div className="kpi"><span className="kpi-label">Employees in this group since {pay.trend_from}</span>
          <strong>{change === null ? "–" : `${signed(change)}%`}</strong>
          <span className="badge">{Math.round(pay.employees_thousands).toLocaleString("en-MY")} thousand in {pay.year}</span></div>
        <div className="kpi"><span className="kpi-label">WEF global outlook to 2030</span><strong>{signed(wefChange)}%</strong>
          <span className="badge">baseline scenario</span></div>
      </div>
      {change !== null && (change > 0) !== (wefChange > 0) && (
        <p className="muted">These point in different directions: employment in this group has {change > 0 ? "grown" : "fallen"} in Malaysia since {pay.trend_from}, while the global forecast expects the role to {wefChange > 0 ? "grow" : "shrink"}. The group is broad, and forecasts look ahead while these figures look back.</p>
      )}
      <p className="source">Source: <a href={pay.source_url} target="_blank" rel="noreferrer">{pay.source}</a> ({pay.licence}), retrieved {pay.retrieved}. {pay.note} The role is matched to the whole MASCO group, so pay for the role itself may differ.</p>
    </div>
  );
}
