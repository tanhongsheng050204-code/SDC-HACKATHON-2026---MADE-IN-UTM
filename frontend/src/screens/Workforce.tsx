import { DataBanner } from "../components/DataBanner";
import { ExportBar } from "../components/ExportBar";
import type { Cell } from "../lib/exportFile";
import { InfoTip } from "../components/InfoTip";
import { ClassView } from "./ClassView";
import { CounsellorClasses } from "../components/CounsellorClasses";
import { SdgTile, Sdgs } from "../components/Sdgs";
import { api, GrantRow, SavedReport, Scenario, Workforce as WorkforceData } from "../lib/api";
import { shortDate } from "../lib/format";
import { useEffect, useState } from "react";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { HEAT, SCENARIOS } from "../lib/labels";

// H1: aggregate view for HR teams. The backend refuses files with personal columns; this screen
// only ever shows totals by role.
// Two audiences share this screen: HR teams (a company) and career centres (a class).
export function Workforce({ initialTab = "company", userId = null }: { initialTab?: "company" | "class" | "classes"; userId?: string | null }) {
  const [tab, setTab] = useState<"company" | "class" | "classes">(initialTab);
  return (
    <section>
      <div className="page-head">
        <h1>{t("h.workforce")}</h1>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "company"} onClick={() => setTab("company")}>{t("class.tabCompany")}</button>
        <button role="tab" aria-selected={tab === "class"} onClick={() => setTab("class")}>{t("class.tabClass")}</button>
        <button role="tab" aria-selected={tab === "classes"} onClick={() => setTab("classes")}>{t("cls.tab")}</button>
      </div>
      {tab === "company" ? <Company userId={userId} /> : tab === "class" ? <ClassView loadSample={initialTab === "class"} /> : <CounsellorClasses userId={userId} />}
    </section>
  );
}

function Company({ userId }: { userId: string | null }) {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<WorkforceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SavedReport | null>(null);  // a saved analysis, not a live one

  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null); setViewing(null);
    try { setResult(await api.workforce(text, s)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that file"); setResult(null); }
    finally { setBusy(false); }
  }
  async function sample() {
    try {
      const text = await api.workforceSample();
      setCsv(text);
      analyse(text);
    } catch { setError("Couldn't load the sample company."); }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    analyse(text);
  }

  return (
    <>
      <div>
        <p className="muted">{t("wf.sub")}</p>
      </div>
      <div className="card">
        <h2>{t("wf.team")}</h2>
        <p className="muted">{t("wf.csvHelp")}</p>
        <label className="sr-only" htmlFor="wf-csv">{t("wf.csv")}</label>
        <textarea id="wf-csv" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={"role,skills\nData entry clerk,Excel; data entry\nCustomer service representative,customer service; communication"} />
        <div className="actions">
          <button className="primary" disabled={busy || csv.trim().length < 10} onClick={() => analyse()}>{busy ? t("wf.analysing") : t("wf.analyse")}</button>
          <label className="btn quiet file-btn">{t("wf.upload")}<input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></label>
          <button onClick={sample} disabled={busy}>{t("wf.sample")}</button>
        </div>
        {busy && <div className="progress" role="progressbar" aria-label={t("wf.analysing")}><span /></div>}
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      <SavedReports userId={userId} csv={result && !viewing ? csv : null} scenario={scenario}
        onOpen={(r, data) => { setViewing(r); setScenario(r.scenario); setResult(data); setError(null); }} />
      {!result && !busy && !error && (
        <div className="empty-state"><p>{t("wf.empty")}</p></div>
      )}
      {viewing && <p className="banner info" role="note">{tf("hr.viewing", { name: viewing.name, date: shortDate(viewing.created_at) })}</p>}
      {result && <Results result={result} scenario={scenario} onScenario={viewing ? undefined : (s) => { setScenario(s); analyse(csv, s); }} />}
    </>
  );
}

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

// What the reskilling moves cost: course fees from the catalogue's dated prices, split by HRD Corp
// status, and staff time at DOSM group-median pay. Estimates for planning, not quotes.
function Budget({ budget, hours, inPlace }: { budget: WorkforceData["budget"]; hours: number; inPlace: WorkforceData["in_place"] }) {
  const stay = inPlace.reduce((sum, r) => ({ time: sum.time + r.staff_time_rm, hours: sum.hours + r.avg_hours * r.people, people: sum.people + r.people }), { time: 0, hours: 0, people: 0 });
  if (hours === 0) return null;
  return (
    <div className="card budget">
      <h2>{t("bud.title")}</h2>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">{t("bud.fees")}</span><strong>{rm(budget.total_rm)}</strong>
          <span className="badge">{budget.total_rm === 0 && !budget.unpriced_courses.length ? t("bud.allFree") : tf("bud.peopleFees", { n: budget.people_with_fees })}</span></div>
        {budget.total_rm > 0 && <>  {/* nothing to claim when every course is free */}
          <div className="kpi"><span className="kpi-label">{t("bud.claimable")}</span><strong>{rm(budget.claimable_rm)}</strong>
            <span className="badge good">{t("hrd.claimable")}</span></div>
          <div className="kpi"><span className="kpi-label">{t("bud.ask")}</span><strong>{rm(budget.ask_provider_rm)}</strong>
            <span className="badge">{t("hrd.check")}</span></div>
        </>}
        <div className="kpi"><span className="kpi-label">{t("bud.time")} <InfoTip term="gl.masco" label={t("bud.time")} /></span><strong>{rm(budget.staff_time_rm)}</strong>
          <span className="badge">{tf("bud.timeNote", { h: hours.toLocaleString() })}</span></div>
      </div>
      {stay.people > 0 && <p><strong>{tf("bud.compare", { stay: rm(stay.time), h: stay.hours.toLocaleString(), move: rm(budget.staff_time_rm) })}</strong></p>}
      {budget.unpriced_courses.length > 0 && <p className="banner">{tf("bud.unpriced", { list: budget.unpriced_courses.join(", ") })}</p>}
      <p className="source">{tf("bud.source", { year: budget.pay_year })}</p>
    </div>
  );
}

// The same role, AI-assisted: the AI skills it adds, hours and costs per group (totals only).
function InPlaceTable({ title, sub, rows }: { title: string; sub: string; rows: WorkforceData["in_place"] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{sub}</p>
      <div className="table-wrap">
        <table className="heatmap">
          <thead><tr><th>{t("wf.role")}</th><th>{t("wf.peopleCol")}</th><th>{t("aa.skills")}</th><th>{t("wf.hoursEach")}</th><th>{t("bud.feesEach")}</th><th>{t("bud.time")}</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.role_id}>
              <th scope="row">{tf("aa.title", { role: tr(r.title) })}</th><td>{r.people}</td>
              <td>{r.ai_skills.map((s) => tr(s)).join(", ")}</td><td>{r.avg_hours}</td><td>{rm(r.fees_each_rm)}</td><td>{rm(r.staff_time_rm)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

const HRD_KEY = { claimable: "hrd.claimable", check: "hrd.check", not_needed: "grant.notNeeded" } as const;

function grantRows(plan: GrantRow[]): Cell[][] {
  return [[t("grant.course"), t("grant.provider"), t("grant.link"), t("grant.forRoles"), t("wf.peopleCol"), t("grant.hoursEach"),
    t("grant.hoursTotal"), t("grant.priceEach"), t("grant.feesTotal"), t("grant.hrd"), t("grant.checked")],
  ...plan.map((r) => [r.title, r.provider, r.url, r.for_roles.join("; "), r.people, r.hours_each, r.hours_total,
    r.price_each_rm ?? t("grant.noPrice"), r.fees_total_rm ?? t("grant.noPrice"), t(HRD_KEY[r.hrd_corp]), r.checked])];
}

// The whole report as one CSV: what the screen shows, section by section, with its source.
function reportRows(result: WorkforceData, scenario: Scenario): Cell[][] {
  const src = result.signal_source;
  const out: Cell[][] = [
    [t("exp.hrTitle")], [t("exp.made"), new Date().toISOString().slice(0, 10)], [t("exp.scenario"), t(`sc.${scenario}`)],
    [t("exp.forecast"), `${src.snapshot_id} (${src.imported.slice(0, 10)})`], [t("exp.totalsOnly")], [],
    [t("wf.people"), result.employees], [t("wf.declining"), result.at_risk], [t("wf.hours"), result.total_hours], [],
    [t("wf.heatmap")], [t("wf.role"), t("wf.peopleCol"), ...SCENARIOS.map((s) => t(`sc.${s.id}`)), t("wf.fitToday")],
    ...result.roles.map((r) => [r.title, r.headcount, ...SCENARIOS.map((s) => `${signed(r.outlook[s.id].index)}%`), `${percent(r.avg_fit)}%`]), [],
    [t("wf.moves")], [t("wf.from"), t("wf.to"), t("wf.peopleCol"), t("wf.hoursEach"), t("bud.feesEach"), t("wf.fitToday")],
    ...result.moves.map((m) => [m.from_role, m.to_role, m.people, m.avg_hours, m.fees_each_rm, `${percent(m.avg_fit_now)}%`]), [],
  ];
  if (result.in_place.length) out.push([t("wf.inPlace")], [t("wf.role"), t("wf.peopleCol"), t("aa.skills"), t("wf.hoursEach"), t("bud.feesEach"), t("bud.time")],
    ...result.in_place.map((r) => [r.title, r.people, r.ai_skills.join("; "), r.avg_hours, r.fees_each_rm, r.staff_time_rm]), []);
  const b = result.budget;
  out.push([t("bud.title")], [t("bud.fees"), b.total_rm], [t("bud.claimable"), b.claimable_rm], [t("bud.ask"), b.ask_provider_rm],
    [t("bud.time"), b.staff_time_rm], [tf("bud.source", { year: b.pay_year })], []);
  if (result.grant_plan?.length) out.push([t("grant.title")], [t("grant.disclaimer")], ...grantRows(result.grant_plan), []);
  if (result.sdg_contribution.length) out.push([t("wf.sdgs")], ...result.sdg_contribution.map((g) => [`SDG ${g.number} ${g.name}`, g.people]));
  return out;
}

// For the company's own HRD Corp application: each course in the moves, who takes it, hours, dated
// price and HRD Corp status. Laluan does not submit claims.
function GrantPlan({ plan }: { plan: GrantRow[] }) {
  if (!plan.length) return null;
  const fees = plan.reduce((sum, r) => sum + (r.fees_total_rm ?? 0), 0);
  const claimable = plan.filter((r) => r.hrd_corp === "claimable").reduce((sum, r) => sum + (r.fees_total_rm ?? 0), 0);
  return (
    <div className="card grant-plan">
      <div className="progress-head">
        <h2>{t("grant.title")}</h2>
        <ExportBar name="laluan-hrd-corp-plan" rows={() => grantRows(plan)} print={false} />
      </div>
      <p className="muted">{t("grant.sub")}</p>
      <div className="table-wrap">
        <table className="heatmap">
          <thead><tr><th>{t("grant.course")}</th><th>{t("wf.peopleCol")}</th><th>{t("grant.hoursTotal")}</th><th>{t("grant.feesTotal")}</th><th>{t("grant.hrd")}</th></tr></thead>
          <tbody>{plan.map((r) => (
            <tr key={r.course_id}>
              <th scope="row"><a href={r.url} target="_blank" rel="noreferrer">{tr(r.title)} ↗</a><small className="grant-meta">{r.provider} · {tf("grant.forList", { list: r.for_roles.map((x) => tr(x)).join(", ") })}</small></th>
              <td>{r.people}</td><td>{r.hours_total.toLocaleString()}</td>
              <td>{r.fees_total_rm === null ? t("grant.noPrice") : rm(r.fees_total_rm)}</td>
              <td><span className={`badge ${r.hrd_corp === "claimable" ? "good" : ""}`}>{t(HRD_KEY[r.hrd_corp])}</span></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p><strong>{tf("grant.totals", { fees: rm(fees), claimable: rm(claimable) })}</strong></p>
      <p className="banner">{t("grant.disclaimer")}</p>
    </div>
  );
}

// Saved analyses for a logged-in HR person: save the one on screen under a name, reopen or delete
// earlier ones. Only the aggregate result is kept on the server, never the CSV.
function SavedReports({ userId, csv, scenario, onOpen }: {
  userId: string | null; csv: string | null; scenario: Scenario; onOpen: (r: SavedReport, data: WorkforceData) => void;
}) {
  const [list, setList] = useState<SavedReport[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { if (userId) api.savedReports().then(setList).catch(() => setList([])); else setList(null); }, [userId]);
  if (!userId) return <p className="muted hr-login">{t("hr.loginToSave")}</p>;
  async function save() {
    if (!csv) return;
    try {
      const made = await api.saveReport(csv, scenario, name.trim() || t("hr.defaultName"));
      setList((l) => [made, ...(l ?? [])]); setName(""); setMsg({ text: t("hr.saved") });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : t("app.failed"), error: true }); }
  }
  async function open(r: SavedReport) {
    try { const full = await api.savedReport(r.id); onOpen(r, full.result); }
    catch { setMsg({ text: t("app.failed"), error: true }); }
  }
  async function remove(r: SavedReport) {
    if (!window.confirm(tf("app.removeConfirm", { title: r.name }))) return;
    try { await api.deleteReport(r.id); setList((l) => (l ?? []).filter((x) => x.id !== r.id)); }
    catch { setMsg({ text: t("app.failed"), error: true }); }
  }
  return (
    <div className="card hr-saved">
      <h2>{t("hr.title")}</h2>
      <p className="muted">{t("hr.sub")}</p>
      {csv && (
        <div className="hr-save-row">
          <label>{t("hr.name")}<input maxLength={80} value={name} placeholder={t("hr.defaultName")} onChange={(e) => setName(e.target.value)} /></label>
          <button className="btn ink" onClick={save}>{t("hr.save")}</button>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="hr-list">{list.map((r) => (
          <li key={r.id}>
            <span><strong>{r.name}</strong> · {shortDate(r.created_at)} · {t(`sc.${r.scenario}`)} · {tf("hr.counts", { n: r.employees, risk: r.at_risk })}</span>
            <span className="export-bar">
              <button className="btn sm" onClick={() => open(r)}>{t("hr.open")}</button>
              <button className="btn quiet sm" onClick={() => remove(r)}>{t("app.remove")}</button>
            </span>
          </li>
        ))}</ul>
      )}
      {list && list.length === 0 && !csv && <p className="muted">{t("hr.none")}</p>}
      {msg && <p className={msg.error ? "error" : "muted"} role={msg.error ? "alert" : "status"}>{msg.text}</p>}
    </div>
  );
}

function Results({ result, scenario, onScenario }: { result: WorkforceData; scenario: Scenario; onScenario?: (s: Scenario) => void }) {
  const src = result.signal_source;
  return (
    <>
      <div className="report-head">
        <p className="print-only"><strong>{t("exp.hrTitle")}</strong> · {new Date().toISOString().slice(0, 10)} · {t(`sc.${scenario}`)} · {src.snapshot_id}</p>
        <ExportBar name="laluan-hr-report" rows={() => reportRows(result, scenario)} />
      </div>
      {onScenario && (
        <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
          {SCENARIOS.map((s) => (
            <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
          ))}
        </div>
      )}
      <DataBanner illustrative={src.illustrative} imported={src.imported} />
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">{t("wf.people")}</span><strong>{result.employees}</strong><span className="badge">{tf("wf.roles", { n: result.roles.length })}</span></div>
        <div className="kpi"><span className="kpi-label">{t("wf.declining")}</span><strong>{result.at_risk}</strong>
          <span className={`badge ${result.at_risk ? "risk" : "good"}`}>{tf("wf.ofTeam", { n: result.employees ? percent(result.at_risk / result.employees) : 0 })}</span></div>
        <div className="kpi"><span className="kpi-label">{t("wf.hours")}</span><strong>{result.total_hours.toLocaleString()}</strong><span className="badge">{t("wf.fromCatalogue")}</span></div>
        <div className="kpi"><span className="kpi-label">{t("k.data")}</span><strong>{src.imported.slice(0, 10)}</strong>
          <span className={`badge ${src.illustrative ? "risk" : "good"}`}>{src.illustrative ? t("k.illustrative") : t("k.cited")}</span></div>
      </div>

      <div className="card">
        <h2>{t("wf.heatmap")}</h2>
        <div className="table-wrap">
          <table className="heatmap">
            <thead><tr><th>{t("wf.role")}</th><th>{t("wf.peopleCol")}</th>{SCENARIOS.map((s) => <th key={s.id}>{t(`sc.${s.id}`)}</th>)}<th>{t("wf.fitToday")}</th></tr></thead>
            <tbody>
              {result.roles.map((r) => (
                <tr key={r.role_id}>
                  <th scope="row">{tr(r.title)}</th><td>{r.headcount}</td>
                  {SCENARIOS.map((s) => <td key={s.id} className={HEAT[r.outlook[s.id].label]}>{signed(r.outlook[s.id].index)}%</td>)}
                  <td>{percent(r.avg_fit)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="source">{tf("wf.heatSource", { id: src.snapshot_id })}</p>
      </div>

      {result.in_place.length > 0 && <InPlaceTable title={t("wf.inPlace")} sub={t("wf.inPlaceSub")} rows={result.in_place} />}

      <div className="card">
        <h2>{t("wf.moves")}</h2>
        {result.moves.length === 0 ? <p className="muted">{t("wf.noMoves")}</p> : (
          <div className="table-wrap">
            <table className="heatmap">
              <thead><tr><th>{t("wf.from")}</th><th>{t("wf.to")}</th><th>{t("wf.peopleCol")}</th><th>{t("wf.hoursEach")}</th><th>{t("bud.feesEach")}</th><th>{t("wf.fitToday")}</th><th>SDGs</th></tr></thead>
              <tbody>
                {result.moves.map((m) => (
                  <tr key={m.from_role + m.to_role}>
                    <td>{tr(m.from_role)}</td><th scope="row">{tr(m.to_role)}</th><td>{m.people}</td><td>{m.avg_hours}</td><td>{rm(m.fees_each_rm)}</td>
                    <td>{percent(m.avg_fit_now)}%</td><td><Sdgs sdgs={m.sdgs} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Budget budget={result.budget} hours={result.total_hours} inPlace={result.in_place} />
      <GrantPlan plan={result.grant_plan ?? []} />
      {result.get_ahead.length > 0 && <InPlaceTable title={t("wf.getAhead")} sub={t("wf.getAheadSub")} rows={result.get_ahead} />}

      {result.sdg_contribution.length > 0 && (
        <div className="card">
          <h2>{t("wf.sdgs")}</h2>
          <div className="sdg-totals">
            {result.sdg_contribution.map((g) => (
              <div key={g.number} className="sdg-total"><SdgTile sdg={g} />
                <span><strong>{tf("wf.peopleN", { n: g.people })}</strong><small>{tr(g.name)}</small></span></div>
            ))}
          </div>
        </div>
      )}
      {result.problems.length > 0 && <div className="banner">{t("wf.skipped")}: {result.problems.join(" · ")}</div>}
    </>
  );
}
