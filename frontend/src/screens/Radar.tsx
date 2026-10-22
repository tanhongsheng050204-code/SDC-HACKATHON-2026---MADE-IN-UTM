import { useEffect, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { MalaysiaAiUseCard } from "../components/MalaysiaPanels";
import { api, ForecastMeta, Profile, Radar as RadarData, Scenario, SkillForecast, SkillTrend } from "../lib/api";
import { signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS, TREND_TEXT } from "../lib/labels";

const BANDS = ["rising", "steady", "declining"] as const;
const SHOWN_MAX = 300;  // beyond this a percentage stops meaning much; the range still shows the spread

const pct = (n: number) => (n > SHOWN_MAX ? `>+${SHOWN_MAX}%` : `${signed(Math.round(n))}%`);
// "2024Q3" → mid-quarter, "2024" (or the number 2024) → mid-year.
const periodTime = (p: string | number) => {
  const s = String(p);
  return s.includes("Q") ? +s.slice(0, 4) + (+s.slice(-1) - 1) / 4 + 0.125 : +s.slice(0, 4) + 0.5;
};

/** History as a solid line, the forecast as a dashed line to the horizon with its 80% range shaded. */
function Spark({ name, f, scenario }: { name: string; f: SkillForecast; scenario: Scenario }) {
  const band = f.scenarios?.[scenario];
  const h = (f.history ?? []).filter((p) => typeof p?.share_pct === "number" && p.period != null);
  if (!band || h.length < 2) return null;
  const recent = h.slice(-4);
  const level = recent.reduce((s, p) => s + p.share_pct, 0) / recent.length;
  const start = recent.reduce((s, p) => s + periodTime(p.period), 0) / recent.length;
  const end = f.horizon_year + 0.5;
  const at = (change: number) => level * (1 + change / 100);
  const values = [...h.map((p) => p.share_pct), at(band.low_pct), at(Math.min(band.high_pct, SHOWN_MAX * 2))];
  const max = Math.max(...values), min = Math.min(...values, 0);
  const t0 = periodTime(h[0].period);
  const W = 132, H = 34;
  const x = (time: number) => ((time - t0) / (end - t0)) * (W - 2) + 1;
  const y = (v: number) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const line = h.map((p, i) => `${i ? "L" : "M"}${x(periodTime(p.period)).toFixed(1)},${y(p.share_pct).toFixed(1)}`).join(" ");
  const cone = `M${x(start)},${y(level)} L${x(end)},${y(at(Math.min(band.high_pct, SHOWN_MAX * 2)))} L${x(end)},${y(at(band.low_pct))} Z`;
  return (
    <svg className={`spark ${band.label}`} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={tf("fc.chartAria", { name, from: h[0].period, year: f.horizon_year })}>
      <path className="spark-cone" d={cone} />
      <path className="spark-line" d={line} />
      <path className="spark-ahead" d={`M${x(start)},${y(level)} L${x(end)},${y(at(Math.min(band.change_pct, SHOWN_MAX * 2)))}`} />
    </svg>
  );
}

function SkillRow({ s, scenario }: { s: SkillTrend; scenario: Scenario }) {
  const band = s.forecast?.scenarios?.[scenario];
  const sources = s.sources ?? [];
  return (
    <li className={s.mine ? "mine" : ""} title={sources.join("\n")}>
      <span>
        {tr(s.name)}
        {s.mine && <span className="badge">{t("radar.yours")}</span>}
        {s.forecast?.emerging && <span className="badge emerging" title={t("fc.emergingHelp")}>{t("fc.emerging")}</span>}
      </span>
      {band ? (
        <span className="fc-num">
          <strong>{tf("fc.byYear", { pct: pct(band.change_pct), year: s.forecast!.horizon_year })}</strong>
          <span className={`fc-sure ${band.sure ? "sure" : ""}`} title={t("fc.sureHelp")}>{band.sure ? t("fc.sure") : t("fc.unsure")}</span>
        </span>
      ) : (
        <span className="muted">{typeof s.trend === "number" ? `${signed(Math.round(s.trend * 100))}%` : ""}</span>
      )}
      {band && s.forecast && (
        <span className="fc-detail">
          <Spark name={tr(s.name)} f={s.forecast} scenario={scenario} />
          <small className="muted">{band.low_pct > SHOWN_MAX ? tf("fc.rangeAbove", { hi: `+${SHOWN_MAX}%` })
            : tf("fc.range80", { lo: pct(band.low_pct), hi: pct(band.high_pct) })}</small>
        </span>
      )}
      {sources.length > 0 && (band ? (
        <details className="radar-src"><summary className="source">{tf("fc.sources", { n: sources.length })}</summary>
          <small className="source">{sources.join(" · ")}</small></details>
      ) : <small className="source radar-src">{sources.join(" · ")}</small>)}
    </li>
  );
}

function Backtest({ meta }: { meta: ForecastMeta }) {
  const b = meta.backtest;
  if (!b || typeof b.model_error !== "number") return null;
  const asPct = (logErr: number) => Math.round((Math.exp(logErr) - 1) * 100);
  return (
    <div className="card">
      <h3>{t("fc.backtestTitle")}</h3>
      <p>{tf("fc.backtestDir", { n: b.clear_trends, right: b.direction_right, naive: b.always_rising_right })}</p>
      <p className="muted">{tf(b.model_error < b.no_change_error ? "fc.backtestBetter" : "fc.backtestWorse",
        { model: asPct(b.model_error), naive: asPct(b.no_change_error) })}</p>
      <p className="muted">{t("fc.method")}</p>
    </div>
  );
}

export function Radar({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const [data, setData] = useState<RadarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("baseline");
  useEffect(() => { api.radar(profile.id).then(setData).catch(() => setError(t("radar.failed"))); }, [profile.id]);

  if (error) return <section><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section><p className="muted">{t("radar.loading")}</p></section>;

  // Every field is read defensively: snapshots approved at different times carry different extras.
  const allSkills = data.skills ?? [];
  const labelOf = (s: SkillTrend) => s.forecast?.scenarios?.[scenario]?.label ?? s.label;
  const visible = onlyMine ? allSkills.filter((s) => s.mine) : allSkills;
  const noData = allSkills.filter((s) => s.label === "no_data");
  const capabilities = data.capability_momentum ?? [];
  const momentum = capabilities.some((c) => c.momentum !== null);
  const meta = data.forecast ?? null;
  const jobs = meta?.history?.jobs;
  const horizon = meta?.horizon_year ?? 2030;
  const changeOf = (s: SkillTrend) => s.forecast?.scenarios?.[scenario]?.change_pct ?? (s.trend ?? 0) * 100;
  const byChange = (a: SkillTrend, b: SkillTrend) => changeOf(b) - changeOf(a);
  const roles = (data.roles ?? []).filter((r) => r.scenarios?.[scenario])
    .sort((a, b) => b.scenarios[scenario].index - a.scenarios[scenario].index);
  return (
    <section>
      <div className="page-head"><h1>{t("h.radar")}</h1>
        <p className="muted">{t("note.estimate")}</p></div>
      <DataBanner illustrative={data.illustrative} imported={data.imported} />
      {meta && (
        <div className="radar-controls">
          <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
            {SCENARIOS.map((s) => (
              <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => setScenario(s.id)}>{s.label}</button>
            ))}
          </div>
          {jobs?.periods && <p className="muted">{tf("fc.what", { year: horizon, from: jobs.periods[0], to: jobs.periods[1] })} {t("fc.scenarioNote")}</p>}
        </div>
      )}
      {allSkills.length === 0 ? (
        <div className="banner warning">{t("radar.noTrends")}</div>
      ) : (
        <>
          <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {t("radar.onlyMine")}</label>
          <div className="radar">
            {BANDS.map((band) => {
              const skills = visible.filter((s) => labelOf(s) === band).sort(byChange);
              return (
                <div key={band} className={`radar-col ${band}`}>
                  <h3 className={`outlook ${band === "rising" ? "growing" : band}`}>{TREND_TEXT[band]} ({skills.length})</h3>
                  <ul>
                    {skills.map((s) => <SkillRow key={s.skill_id} s={s} scenario={scenario} />)}
                    {skills.length === 0 && <li className="muted">{t("radar.none")}</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      {noData.length > 0 && (
        <details><summary className="muted">{tf("radar.noDataCount", { n: noData.length })}</summary>
          <p className="muted">{t("radar.twoCounts")}</p>
          <ul className="plain-list">
            {noData.map((s) => <li key={s.skill_id}><strong>{tr(s.name)}</strong>{(s.sources ?? []).length > 0 && <small className="source radar-src">{s.sources.join(" · ")}</small>}</li>)}
          </ul>
        </details>
      )}
      <div className="card">
        <h3>{t("fc.rolesTitle")}</h3>
        <p className="muted">{tf("fc.rolesSub", { year: horizon })}</p>
        <ul className="radar-roles">
          {roles.map((r) => {
            const now = r.scenarios[scenario];
            const all = Object.values(r.scenarios).map((o) => o.index).filter((n) => typeof n === "number");
            const my = r.malaysia;
            return (
              <li key={r.role_id}>
                <span>{tr(r.title)}</span>
                <span className={`outlook ${now.label}`}>{OUTLOOK_TEXT[now.label]}</span>
                <strong>{tf("fc.byYear", { pct: pct(now.index), year: horizon })}</strong>
                <small className="muted">{tf("fc.acrossScenarios", { lo: pct(Math.min(...all)), hi: pct(Math.max(...all)) })}</small>
                {my && (my.history ?? []).length > 0 && typeof my.change_pct === "number" && (
                  <small className="muted radar-my">{tf("fc.malaysia", { pct: pct(my.change_pct), year: my.horizon_year,
                    from: my.history[0].period, to: my.history[my.history.length - 1].period })}</small>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {meta && <Backtest meta={meta} />}
      <MalaysiaAiUseCard />
      {momentum && (
        <div className="card">
          <h3>{t("radar.momentum")}</h3>
          <p className="muted">{t("radar.momentumSub")}</p>
          <ul className="momentum">
            {capabilities.map((c) => {
              const m = c.momentum ?? 0;
              return (
                <li key={c.id}>
                  <span>{tr(c.name)}</span>
                  <span className="bar"><span style={{ width: `${Math.abs(m) * 50}%`, marginLeft: m < 0 ? `${50 - Math.abs(m) * 50}%` : "50%" }} className={m < 0 ? "neg" : "pos"} /></span>
                  <span className="muted">{c.momentum !== null ? signed(Math.round(c.momentum * 100) / 100) : "–"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="source">Snapshot {data.snapshot_id} · imported {data.imported}
        {(data.inputs ?? []).map((i) => <span key={i.source}> · {i.source} (retrieved {i.retrieved})</span>)}
        {meta?.history && Object.values(meta.history).map((h) => h?.periods && (
          <span key={h.source}> · {h.source} {h.periods[0]}–{h.periods[1]} (retrieved {h.retrieved})</span>
        ))}</p>
      <button className="primary" onClick={onNext}>{t("a.seeRoles")}</button>
    </section>
  );
}
