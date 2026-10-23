import { useEffect, useState } from "react";
import { ExportBar } from "../components/ExportBar";
import { OrgBar, OrgChecked, OrgMenu, OrgStart } from "../components/OrgStart";
import { SdgTile } from "../components/Sdgs";
import { Tabs } from "../components/Tabs";
import { api, ClassResult, Scenario } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

const EXAMPLE = [["programme", "skills"], ["Diploma in Business", "Excel; social media; communication"], ["Degree in Computing", "Python; SQL; git"]];
type Pane = "best" | "gaps" | "programmes" | "courses" | "sdgs";

// For TVET and university career centres: an anonymous class list in, the cohort's picture out.
// Totals only; any group under three shows as "fewer than 3".
export function ClassView({ loadSample }: { loadSample: boolean }) {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<ClassResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("best");

  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null); setCsv(text);
    try { setResult(await api.classAnalyse(text, s)); }
    catch (e) { setError(e instanceof Error ? e.message : t("class.readFailed")); setResult(null); }
    finally { setBusy(false); }
  }
  async function sample() {
    try { analyse(await api.classSample()); } catch { setError(t("class.sampleFailed")); }
  }
  useEffect(() => { if (loadSample) sample(); }, [loadSample]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!result) return (
    <>
      <p className="org-what">{t("class.what")}</p>
      <OrgStart title={t("class.sampleTitle")} example={EXAMPLE} format={t("class.format")} template="laluan-class-template"
        busy={busy} error={error} onSample={sample} onCsv={(text) => analyse(text)} />
    </>
  );
  const top = result.best_fit[0];
  const gap = result.top_gaps[0];
  const panes: { id: Pane; label: string }[] = [
    { id: "best", label: t("class.tBest") }, { id: "gaps", label: t("class.tGaps") },
    ...(result.by_programme.length ? [{ id: "programmes" as const, label: t("class.byProgramme") }] : []),
    { id: "courses", label: t("class.tCourses") },
    ...(result.sdg_contribution.length ? [{ id: "sdgs" as const, label: t("wf.tSdgs") }] : []),
  ];
  const shown = panes.some((p) => p.id === pane) ? pane : "best";
  return (
    <>
      <OrgBar scenario={scenario} onScenario={(s) => { setScenario(s); analyse(csv, s); }}>
        <OrgMenu label={t("org.export")}>
          <ExportBar name="laluan-class-view" rows={() => [
            [t("class.exportTitle"), new Date().toISOString().slice(0, 10), t(`sc.${scenario}`)], [t("class.totalsOnly")], [],
            [t("class.students"), String(result.students)], [],
            [t("class.bestFit")], ...result.best_fit.map((r) => [r.title, String(r.students), OUTLOOK_TEXT[r.outlook[scenario].label]]), [],
            [t("class.gaps")], ...result.top_gaps.map((g) => [g.name, String(g.students), g.course?.title ?? "", g.course?.url ?? ""]), [],
            [t("class.courses")], ...result.courses.map((c) => [c.course.title, c.course.provider, c.course.url, c.hours, String(c.students_helped)]),
          ]} />
        </OrgMenu>
        <button className="btn quiet sm" onClick={() => { setResult(null); setError(null); }}>{t("org.new")}</button>
      </OrgBar>
      {busy && <div className="progress" role="progressbar" aria-label={t("class.analysing")}><span /></div>}
      {error && <p className="error" role="alert">{error}</p>}
      <OrgChecked n={result.students} problems={result.problems} />
      {top && gap && (
        <p className="org-headline">{tf("class.headline", { n: result.students, p: result.programmes.length, role: tr(top.title), gap: tr(gap.name).toLowerCase(), k: gap.students })}</p>
      )}
      <p className="org-lock">🔒 {t("class.totalsOnly")}</p>
      <div className="kpis">
        <div className="kpi"><span className="kpi-label">{t("class.students")}</span><strong>{result.students}</strong></div>
        <div className="kpi"><span className="kpi-label">{t("class.programmes")}</span><strong>{result.programmes.length}</strong></div>
        <div className="kpi"><span className="kpi-label">{t("class.rolesFit")}</span><strong>{result.best_fit.length}</strong></div>
        <div className="kpi"><span className="kpi-label">{t("class.topGap")}</span><strong>{gap ? gap.students : 0}</strong></div>
      </div>

      <Tabs id="class-detail" label={t("wf.details")} tabs={panes} value={shown} onChange={setPane}>
        <div className="card org-pane">
          {shown === "best" && (
            <>
              <p className="muted">{t("class.bestFit")}</p>
              <div className="table-wrap"><table className="heatmap"><tbody>
                {result.best_fit.map((r) => (
                  <tr key={r.role_id}><th scope="row">{tr(r.title)}</th><td>{r.students}</td>
                    <td><span className={`badge ${OUTLOOK_TONE[r.outlook[scenario].label]}`}>{OUTLOOK_TEXT[r.outlook[scenario].label]}</span></td></tr>
                ))}
              </tbody></table></div>
            </>
          )}
          {shown === "gaps" && (
            <>
              <p className="muted">{t("class.gaps")}</p>
              <div className="table-wrap"><table className="heatmap"><tbody>
                {result.top_gaps.map((g) => (
                  <tr key={g.skill_id}><th scope="row">{tr(g.name)}</th><td>{g.students}</td>
                    <td>{g.course && <a href={g.course.url} target="_blank" rel="noreferrer">{tr(g.course.title)} ↗</a>}</td></tr>
                ))}
              </tbody></table></div>
            </>
          )}
          {shown === "programmes" && (
            <>
              <p className="muted">{t("class.byProgrammeSub")}</p>
              <div className="table-wrap"><table className="heatmap">
                <thead><tr><th>{t("class.programme")}</th><th>{t("class.students")}</th><th>{t("class.bestFit")}</th><th>{t("class.gaps")}</th></tr></thead>
                <tbody>{result.by_programme.map((p) => (
                  <tr key={p.name}>
                    <th scope="row">{tr(p.name)}</th><td>{p.students}</td>
                    <td className="wrap">{p.best_fit.map((b) => `${tr(b.title)} (${b.students})`).join(", ")}</td>
                    <td className="wrap">{p.top_gaps.map((g, i) => <span key={g.skill_id}>{i > 0 && ", "}{g.course ? <a href={g.course.url} target="_blank" rel="noreferrer">{tr(g.name)}</a> : tr(g.name)} ({g.students})</span>)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </>
          )}
          {shown === "courses" && (
            <>
              <p className="muted">{t("class.courses")}</p>
              <ol>{result.courses.map((c) => (
                <li key={c.course.id}><a href={c.course.url} target="_blank" rel="noreferrer">{tr(c.course.title)}</a> · {c.course.provider} · {c.hours} h · {t("class.helps")} {c.students_helped}</li>
              ))}</ol>
            </>
          )}
          {shown === "sdgs" && (
            <>
              <p className="muted">{t("class.sdgs")}</p>
              <div className="chips">{result.sdg_contribution.map((s) => (
                <span key={s.number} className="chip"><SdgTile sdg={s} small />{tr(s.name)}: {s.students}</span>
              ))}</div>
            </>
          )}
        </div>
      </Tabs>
    </>
  );
}
