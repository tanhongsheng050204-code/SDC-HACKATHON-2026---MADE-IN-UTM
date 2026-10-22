import { useEffect, useState } from "react";
import { ExportBar } from "../components/ExportBar";
import { SdgTile } from "../components/Sdgs";
import { api, ClassResult, Scenario } from "../lib/api";
import { t, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE, SCENARIOS } from "../lib/labels";

// For TVET and university career centres: an anonymous class list in, the cohort's picture out.
// Totals only; any group under three shows as "fewer than 3".
export function ClassView({ loadSample }: { loadSample: boolean }) {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<ClassResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null);
    try { setResult(await api.classAnalyse(text, s)); }
    catch (e) { setError(e instanceof Error ? e.message : t("class.readFailed")); setResult(null); }
    finally { setBusy(false); }
  }
  async function sample() {
    try { const text = await api.classSample(); setCsv(text); analyse(text); }
    catch { setError(t("class.sampleFailed")); }
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text); analyse(text);
  }
  useEffect(() => { if (loadSample) sample(); }, [loadSample]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <p className="muted">{t("class.intro")}</p>
      <div className="card">
        <h2>{t("class.yourClass")}</h2>
        <p className="muted">{t("class.format")}</p>
        <label className="sr-only" htmlFor="class-csv">{t("class.yourClass")}</label>
        <textarea id="class-csv" rows={6} value={csv} onChange={(e) => setCsv(e.target.value)}
          placeholder={"programme,skills\nDiploma in Business,Excel; social media; communication\nDegree in Computing,Python; SQL; git"} />
        <div className="actions">
          <button className="primary" disabled={busy || csv.trim().length < 10} onClick={() => analyse()}>{busy ? t("class.analysing") : t("class.analyse")}</button>
          <label className="btn quiet file-btn">{t("class.upload")}<input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></label>
          <button onClick={sample} disabled={busy}>{t("class.sample")}</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {result && (
        <>
          <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
            {SCENARIOS.map((s) => (
              <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => { setScenario(s.id); analyse(csv, s.id); }}>{t(`sc.${s.id}`)}</button>
            ))}
          </div>
          <ExportBar name="laluan-class-view" rows={() => [
            [t("class.exportTitle"), new Date().toISOString().slice(0, 10), t(`sc.${scenario}`)], [t("class.totalsOnly")], [],
            [t("class.students"), String(result.students)], [],
            [t("class.bestFit")], ...result.best_fit.map((r) => [r.title, String(r.students), OUTLOOK_TEXT[r.outlook[scenario].label]]), [],
            [t("class.gaps")], ...result.top_gaps.map((g) => [g.name, String(g.students), g.course?.title ?? "", g.course?.url ?? ""]), [],
            [t("class.courses")], ...result.courses.map((c) => [c.course.title, c.course.provider, c.course.url, c.hours, String(c.students_helped)]),
          ]} />
          <p className="banner info" role="note">{t("class.totalsOnly")}</p>
          <div className="home-kpis">
            <div className="kpi"><span className="kpi-label">{t("class.students")}</span><strong>{result.students}</strong>
              <span className="kpi-foot">{result.programmes.map((p) => `${tr(p.name)}: ${p.students}`).join(" · ")}</span></div>
          </div>

          <div className="card">
            <h2>{t("class.bestFit")}</h2>
            <table className="heatmap"><tbody>
              {result.best_fit.map((r) => (
                <tr key={r.role_id}><th scope="row">{tr(r.title)}</th><td>{r.students}</td>
                  <td><span className={`badge ${OUTLOOK_TONE[r.outlook[scenario].label]}`}>{OUTLOOK_TEXT[r.outlook[scenario].label]}</span></td></tr>
              ))}
            </tbody></table>
          </div>

          <div className="card">
            <h2>{t("class.gaps")}</h2>
            <table className="heatmap"><tbody>
              {result.top_gaps.map((g) => (
                <tr key={g.skill_id}><th scope="row">{tr(g.name)}</th><td>{g.students}</td>
                  <td>{g.course && <a href={g.course.url} target="_blank" rel="noreferrer">{tr(g.course.title)} ↗</a>}</td></tr>
              ))}
            </tbody></table>
          </div>

          {result.by_programme.length > 0 && (
            <div className="card">
              <h2>{t("class.byProgramme")}</h2>
              <p className="muted">{t("class.byProgrammeSub")}</p>
              <div className="table-wrap"><table className="heatmap">
                <thead><tr><th>{t("class.programme")}</th><th>{t("class.students")}</th><th>{t("class.bestFit")}</th><th>{t("class.gaps")}</th></tr></thead>
                <tbody>{result.by_programme.map((p) => (
                  <tr key={p.name}>
                    <th scope="row">{tr(p.name)}</th><td>{p.students}</td>
                    <td>{p.best_fit.map((b) => `${tr(b.title)} (${b.students})`).join(", ")}</td>
                    <td>{p.top_gaps.map((g, i) => <span key={g.skill_id}>{i > 0 && ", "}{g.course ? <a href={g.course.url} target="_blank" rel="noreferrer">{tr(g.name)}</a> : tr(g.name)} ({g.students})</span>)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </div>
          )}

          <div className="card">
            <h2>{t("class.courses")}</h2>
            <ol>{result.courses.map((c) => (
              <li key={c.course.id}><a href={c.course.url} target="_blank" rel="noreferrer">{tr(c.course.title)}</a> · {c.course.provider} · {c.hours} h · {t("class.helps")} {c.students_helped}</li>
            ))}</ol>
          </div>

          {result.sdg_contribution.length > 0 && (
            <div className="card">
              <h2>{t("class.sdgs")}</h2>
              <div className="chips">{result.sdg_contribution.map((s) => (
                <span key={s.number} className="chip"><SdgTile sdg={s} small />{tr(s.name)}: {s.students}</span>
              ))}</div>
            </div>
          )}
          {result.problems.length > 0 && <p className="source">{result.problems.join(" · ")}</p>}
        </>
      )}
    </>
  );
}
