import { useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { ClassView } from "./ClassView";
import { SdgTile, Sdgs } from "../components/Sdgs";
import { api, Scenario, Workforce as WorkforceData } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { HEAT, SCENARIOS } from "../lib/labels";

// H1: aggregate view for HR teams. The backend refuses files with personal columns; this screen
// only ever shows totals by role.
// Two audiences share this screen: HR teams (a company) and career centres (a class).
export function Workforce({ initialTab = "company" }: { initialTab?: "company" | "class" }) {
  const [tab, setTab] = useState<"company" | "class">(initialTab);
  return (
    <section>
      <div className="page-head">
        <h1>{t("h.workforce")}</h1>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "company"} onClick={() => setTab("company")}>{t("class.tabCompany")}</button>
        <button role="tab" aria-selected={tab === "class"} onClick={() => setTab("class")}>{t("class.tabClass")}</button>
      </div>
      {tab === "company" ? <Company /> : <ClassView loadSample={initialTab === "class"} />}
    </section>
  );
}

function Company() {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<WorkforceData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null);
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
      {!result && !busy && !error && (
        <div className="empty-state"><p>{t("wf.empty")}</p></div>
      )}
      {result && <Results result={result} scenario={scenario} onScenario={(s) => { setScenario(s); analyse(csv, s); }} />}
    </>
  );
}

function Results({ result, scenario, onScenario }: { result: WorkforceData; scenario: Scenario; onScenario: (s: Scenario) => void }) {
  const src = result.signal_source;
  return (
    <>
      <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
        ))}
      </div>
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

      <div className="card">
        <h2>{t("wf.moves")}</h2>
        {result.moves.length === 0 ? <p className="muted">{t("wf.noMoves")}</p> : (
          <div className="table-wrap">
            <table className="heatmap">
              <thead><tr><th>{t("wf.from")}</th><th>{t("wf.to")}</th><th>{t("wf.peopleCol")}</th><th>{t("wf.hoursEach")}</th><th>{t("wf.fitToday")}</th><th>SDGs</th></tr></thead>
              <tbody>
                {result.moves.map((m) => (
                  <tr key={m.from_role + m.to_role}>
                    <td>{tr(m.from_role)}</td><th scope="row">{tr(m.to_role)}</th><td>{m.people}</td><td>{m.avg_hours}</td>
                    <td>{percent(m.avg_fit_now)}%</td><td><Sdgs sdgs={m.sdgs} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
