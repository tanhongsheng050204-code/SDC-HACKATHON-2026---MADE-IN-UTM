import { DataBanner } from "../components/DataBanner";
import { ExportBar } from "../components/ExportBar";
import { downloadCsv, type Cell } from "../lib/exportFile";
import { InfoTip } from "../components/InfoTip";
import { ClassView } from "./ClassView";
import { CounsellorClasses } from "../components/CounsellorClasses";
import { OrgBar, OrgChecked, OrgMenu, OrgStart, SPEEDS } from "../components/OrgStart";
import { SdgTile, Sdgs } from "../components/Sdgs";
import { Tabs } from "../components/Tabs";
import { api, GrantRow, SavedReport, Scenario, Workforce as WorkforceData } from "../lib/api";
import { shortDate } from "../lib/format";
import { useEffect, useState } from "react";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { HEAT, SCENARIOS } from "../lib/labels";

type OrgTab = "company" | "class" | "classes";

// H1: aggregate view for HR teams. The backend refuses files with personal columns; this screen
// only ever shows totals by role.
// Three audiences share this screen: HR teams (a company), career centres (a class) and counsellors.
export function Workforce({ initialTab = "company", userId = null }: { initialTab?: OrgTab; userId?: string | null }) {
  const [tab, setTab] = useState<OrgTab>(initialTab);
  return (
    <section className="org-page">
      <div className="page-head">
        <h1>{t("h.workforce")}</h1>
      </div>
      <Tabs id="org" label={t("h.workforce")} value={tab} onChange={setTab}
        tabs={[{ id: "company", label: t("org.tCompany") }, { id: "class", label: t("org.tClass") }, { id: "classes", label: t("org.tMine") }]}>
        {tab === "company" ? <Company userId={userId} /> : tab === "class" ? <ClassView loadSample={initialTab === "class"} /> : <CounsellorClasses userId={userId} />}
      </Tabs>
    </section>
  );
}

const EXAMPLE = [["role", "skills"], ["Data entry clerk", "Excel; data entry"], ["Customer service representative", "customer service; communication"]];

function Company({ userId }: { userId: string | null }) {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<WorkforceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<SavedReport | null>(null);  // a saved analysis, not a live one

  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null); setViewing(null); setCsv(text);
    try { setResult(await api.workforce(text, s)); }
    catch (e) { setError(e instanceof Error ? e.message : t("wf.readFailed")); setResult(null); }
    finally { setBusy(false); }
  }
  async function sample() {
    try { analyse(await api.workforceSample()); } catch { setError(t("wf.sampleFailed")); }
  }
  const saved = <SavedReports userId={userId} csv={result && !viewing ? csv : null} scenario={scenario}
    onOpen={(r, data) => { setViewing(r); setScenario(r.scenario); setResult(data); setError(null); }} />;

  if (!result) return (
    <>
      <p className="org-what">{t("wf.what")}</p>
      <OrgStart title={t("wf.sampleTitle")} example={EXAMPLE} format={t("wf.csvHelp")} template="laluan-team-template"
        busy={busy} error={error} onSample={sample} onCsv={(text) => analyse(text)} />
      {userId && <div className="org-bar">{saved}</div>}
    </>
  );
  return (
    <>
      <OrgBar scenario={scenario} onScenario={viewing ? undefined : (s) => { setScenario(s); analyse(csv, s); }}>
        {saved}
        <OrgMenu label={t("org.export")}>
          <ExportBar name="laluan-hr-report" rows={() => reportRows(result, scenario)} />
          {(result.grant_plan?.length ?? 0) > 0 && <button className="btn quiet sm" onClick={() => downloadCsv("laluan-hrd-corp-plan", grantRows(result.grant_plan!))}>{t("grant.title")} (CSV)</button>}
        </OrgMenu>
        <button className="btn quiet sm" onClick={() => { setResult(null); setViewing(null); setError(null); }}>{t("org.new")}</button>
      </OrgBar>
      {busy && <div className="progress" role="progressbar" aria-label={t("wf.analysing")}><span /></div>}
      {error && <p className="error" role="alert">{error}</p>}
      {viewing && <p className="banner info" role="note">{tf("hr.viewing", { name: viewing.name, date: shortDate(viewing.created_at) })}</p>}
      <Results result={result} scenario={scenario} />
    </>
  );
}

const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;

// What the reskilling moves cost: course fees from the catalogue's dated prices, split by HRD Corp
// status, and staff time at DOSM group-median pay. Estimates for planning, not quotes.
function Budget({ budget, hours, inPlace }: { budget: WorkforceData["budget"]; hours: number; inPlace: WorkforceData["in_place"] }) {
  const stay = inPlace.reduce((sum, r) => ({ time: sum.time + r.staff_time_rm, hours: sum.hours + r.avg_hours * r.people, people: sum.people + r.people }), { time: 0, hours: 0, people: 0 });
  return (
    <div className="budget">
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
function InPlaceTable({ sub, rows }: { sub: string; rows: WorkforceData["in_place"] }) {
  return (
    <>
      <p className="muted">{sub}</p>
      {rows.length === 0 ? <p className="muted">{t("wf.noneForRole")}</p> : (
        <div className="table-wrap">
          <table className="heatmap">
            <thead><tr><th>{t("wf.role")}</th><th>{t("wf.peopleCol")}</th><th>{t("aa.skills")}</th><th>{t("wf.hoursEach")}</th><th>{t("bud.feesEach")}</th><th>{t("bud.time")}</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.role_id}>
                <th scope="row">{tf("aa.title", { role: tr(r.title) })}</th><td>{r.people}</td>
                <td className="wrap">{r.ai_skills.map((s) => tr(s)).join(", ")}</td><td>{r.avg_hours}</td><td>{rm(r.fees_each_rm)}</td><td>{rm(r.staff_time_rm)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
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
    <div className="grant-plan">
      <h3>{t("grant.title")}</h3>
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

// Saved analyses for a logged-in HR person, as two small menus: save the one on screen under a
// name, reopen or delete earlier ones. Only the aggregate result is kept on the server, never the CSV.
function SavedReports({ userId, csv, scenario, onOpen }: {
  userId: string | null; csv: string | null; scenario: Scenario; onOpen: (r: SavedReport, data: WorkforceData) => void;
}) {
  const [list, setList] = useState<SavedReport[] | null>(null);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { if (userId) api.savedReports().then(setList).catch(() => setList([])); else setList(null); }, [userId]);
  if (!userId) return <span className="muted org-login" title={t("hr.loginToSave")}>{t("org.loginSave")}</span>;
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
  const note = msg && <p className={msg.error ? "error" : "muted"} role={msg.error ? "alert" : "status"}>{msg.text}</p>;
  return (
    <>
      {csv && (
        <OrgMenu label={t("org.save")}>
          <p className="muted">{t("hr.sub")}</p>
          <div className="hr-save-row">
            <label>{t("hr.name")}<input maxLength={80} value={name} placeholder={t("hr.defaultName")} onChange={(e) => setName(e.target.value)} /></label>
            <button className="btn ink" onClick={save}>{t("hr.save")}</button>
          </div>
          {note}
        </OrgMenu>
      )}
      <OrgMenu label={tf("org.saved", { n: list?.length ?? 0 })}>
        {list && list.length > 0 ? (
          <ul className="hr-list">{list.map((r) => (
            <li key={r.id}>
              <span><strong>{r.name}</strong> · {shortDate(r.created_at)} · {t(`sc.${r.scenario}`)} · {tf("hr.counts", { n: r.employees, risk: r.at_risk })}</span>
              <span className="export-bar">
                <button className="btn sm" onClick={() => open(r)}>{t("hr.open")}</button>
                <button className="btn quiet sm" onClick={() => remove(r)}>{t("app.remove")}</button>
              </span>
            </li>
          ))}</ul>
        ) : <p className="muted">{t("hr.none")}</p>}
        {!csv && note}
      </OrgMenu>
    </>
  );
}

type Pane = "moves" | "inplace" | "budget" | "ahead" | "sdgs";

// A headline, four tiles and the role × AI-speed heatmap; the detail sits in tabs below it. Tapping a
// role filters the Moves and Upskill in place tabs.
function Results({ result, scenario }: { result: WorkforceData; scenario: Scenario }) {
  const [pane, setPane] = useState<Pane>("moves");
  const [role, setRole] = useState<string | null>(null);
  const src = result.signal_source;
  const stayFrom = result.in_place.length ? Math.min(...result.in_place.map((r) => r.avg_hours)) : null;
  const moves = result.moves.filter((m) => !role || m.from_role === role);
  const inPlace = result.in_place.filter((r) => !role || r.title === role);
  const panes: { id: Pane; label: string }[] = [
    { id: "moves", label: t("wf.tMoves") },
    ...(result.in_place.length ? [{ id: "inplace" as const, label: t("wf.tInPlace") }] : []),
    ...(result.total_hours > 0 ? [{ id: "budget" as const, label: t("wf.tBudget") }] : []),
    ...(result.get_ahead.length ? [{ id: "ahead" as const, label: t("wf.tAhead") }] : []),
    ...(result.sdg_contribution.length ? [{ id: "sdgs" as const, label: t("wf.tSdgs") }] : []),
  ];
  const shown = panes.some((p) => p.id === pane) ? pane : "moves";
  function pick(title: string) {
    const next = role === title ? null : title;
    setRole(next);
    if (next && shown !== "moves" && shown !== "inplace") setPane("moves");
  }
  return (
    <>
      <p className="print-only"><strong>{t("exp.hrTitle")}</strong> · {new Date().toISOString().slice(0, 10)} · {t(`sc.${scenario}`)} · {src.snapshot_id}</p>
      <DataBanner illustrative={src.illustrative} imported={src.imported} />
      <OrgChecked n={result.employees} problems={result.problems} />
      <p className="org-headline">
        {result.at_risk ? <><em>{tf("wf.headline", { risk: result.at_risk, n: result.employees })}</em></> : t("wf.headlineNone")}
        {stayFrom !== null && <> {tf("wf.headlineStay", { h: stayFrom })}</>}
      </p>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">{t("wf.people")}</span><strong>{result.employees}</strong><span className="badge">{tf("wf.roles", { n: result.roles.length })}</span></div>
        <div className="kpi"><span className="kpi-label">{t("wf.declining")}</span><strong>{result.at_risk}</strong>
          <span className={`badge ${result.at_risk ? "risk" : "good"}`}>{tf("wf.ofTeam", { n: result.employees ? percent(result.at_risk / result.employees) : 0 })}</span></div>
        <div className="kpi"><span className="kpi-label">{t("wf.hours")}</span><strong>{result.total_hours.toLocaleString()}</strong><span className="badge">{t("wf.fromCatalogue")}</span></div>
        <div className="kpi"><span className="kpi-label">{t("k.data")}</span><strong>{src.imported.slice(0, 10)}</strong>
          <span className={`badge ${src.illustrative ? "risk" : "good"}`}>{src.illustrative ? t("k.illustrative") : t("k.cited")}</span></div>
      </div>

      <div className="card">
        <div className="org-card-head"><h2>{t("wf.byRole")}</h2><span className="muted">{t("wf.tapRole")}</span></div>
        <div className="table-wrap">
          <table className="heatmap org-heat">
            <thead><tr><th>{t("wf.role")}</th><th>{t("wf.peopleCol")}</th>{SCENARIOS.map((s) => <th key={s.id} className={s.id === scenario ? "cur" : "alt"}>{t(SPEEDS[s.id])}</th>)}</tr></thead>
            <tbody>
              {result.roles.map((r) => (
                <tr key={r.role_id} className={role === r.title ? "on" : ""}>
                  <th scope="row"><button className="link org-role" aria-pressed={role === r.title} onClick={() => pick(r.title)}>{tr(r.title)}</button></th><td>{r.headcount}</td>
                  {SCENARIOS.map((s) => <td key={s.id} className={`${HEAT[r.outlook[s.id].label]} ${s.id === scenario ? "cur" : "alt"}`}>{signed(r.outlook[s.id].index)}%</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="source">{tf("wf.heatSource", { id: src.snapshot_id })}</p>
      </div>

      {role && <button className="org-filter" onClick={() => setRole(null)} aria-label={t("wf.clearRole")}>{tf("wf.roleIs", { role: tr(role) })} ✕</button>}
      <Tabs id="wf-detail" label={t("wf.details")} tabs={panes} value={shown} onChange={setPane}>
        <div className="card org-pane">
          {shown === "moves" && (moves.length === 0 ? <p className="muted">{role ? t("wf.noneForRole") : t("wf.noMoves")}</p> : (
            <div className="table-wrap">
              <table className="heatmap">
                <thead><tr><th>{t("wf.from")}</th><th>{t("wf.to")}</th><th>{t("wf.peopleCol")}</th><th>{t("wf.hoursEach")}</th><th>{t("bud.feesEach")}</th><th>{t("wf.fitToday")}</th><th>SDGs</th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.from_role + m.to_role}>
                      <td>{tr(m.from_role)}</td><th scope="row">{tr(m.to_role)}</th><td>{m.people}</td><td>{m.avg_hours}</td><td>{rm(m.fees_each_rm)}</td>
                      <td>{percent(m.avg_fit_now)}%</td><td><Sdgs sdgs={m.sdgs} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {shown === "inplace" && <InPlaceTable sub={t("wf.inPlaceSub")} rows={inPlace} />}
          {shown === "budget" && <><Budget budget={result.budget} hours={result.total_hours} inPlace={result.in_place} /><GrantPlan plan={result.grant_plan ?? []} /></>}
          {shown === "ahead" && <InPlaceTable sub={t("wf.getAheadSub")} rows={result.get_ahead} />}
          {shown === "sdgs" && (
            <>
              <p className="muted">{t("wf.sdgs")}</p>
              <div className="sdg-totals">
                {result.sdg_contribution.map((g) => (
                  <div key={g.number} className="sdg-total"><SdgTile sdg={g} />
                    <span><strong>{tf("wf.peopleN", { n: g.people })}</strong><small>{tr(g.name)}</small></span></div>
                ))}
              </div>
            </>
          )}
        </div>
      </Tabs>
    </>
  );
}
