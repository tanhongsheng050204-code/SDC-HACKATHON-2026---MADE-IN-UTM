import { useEffect, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { MalaysiaAiUseCard } from "../components/MalaysiaPanels";
import { Sheet } from "../components/Sheet";
import { api, ForecastBand, ForecastMeta, Profile, Radar as RadarData, Scenario, Skill, SkillForecast, SkillTrend } from "../lib/api";
import { signed } from "../lib/format";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { OUTLOOK_TEXT, TREND_TEXT } from "../lib/labels";

const BANDS = ["rising", "steady", "declining"] as const;
type Band = typeof BANDS[number];
const SHOWN_MAX = 300;  // beyond this a percentage stops meaning much; the range still shows the spread
const TOP = 5;  // rows per column before "Show all"
const SPEEDS: { id: Scenario; label: StringKey }[] = [
  { id: "slow", label: "radar.speedSlow" }, { id: "baseline", label: "radar.speedBase" }, { id: "accelerated", label: "radar.speedFast" },
];
const ARROW: Record<Band, string> = { rising: "▲", steady: "■", declining: "▼" };

const pct = (n: number) => (n > SHOWN_MAX ? `>+${SHOWN_MAX}%` : `${signed(Math.round(n))}%`);
// "2024Q3" → mid-quarter, "2024" (or the number 2024) → mid-year.
const periodTime = (p: string | number) => {
  const s = String(p);
  return s.includes("Q") ? +s.slice(0, 4) + (+s.slice(-1) - 1) / 4 + 0.125 : +s.slice(0, 4) + 0.5;
};
// Three levels people can read at a glance: the model's own "likely" flag, else whether the 80%
// range stays on one side of zero (the direction is clear even if the size is not).
const confidence = (b: ForecastBand): 1 | 2 | 3 => (b.sure ? 3 : b.low_pct > 0 || b.high_pct < 0 ? 2 : 1);
const CONF_WORD: Record<1 | 2 | 3, StringKey> = { 3: "radar.c3", 2: "radar.c2", 1: "radar.c1" };

function Dots({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span className="conf-dots" role="img" aria-label={t(CONF_WORD[level])}>
      {[1, 2, 3].map((i) => <i key={i} className={i <= level ? "on" : ""} />)}
    </span>
  );
}

/** History as a solid line, the forecast as a dashed line to the horizon; the large one shades its 80% range. */
function Spark({ name, f, scenario, large = false }: { name: string; f: SkillForecast; scenario: Scenario; large?: boolean }) {
  const band = f.scenarios?.[scenario];
  const h = (f.history ?? []).filter((p) => typeof p?.share_pct === "number" && p.period != null);
  if (!band || h.length < 2) return <span className="spark-none" aria-hidden="true" />;
  const recent = h.slice(-4);
  const level = recent.reduce((s, p) => s + p.share_pct, 0) / recent.length;
  const start = recent.reduce((s, p) => s + periodTime(p.period), 0) / recent.length;
  const end = f.horizon_year + 0.5;
  const at = (change: number) => level * (1 + change / 100);
  const values = [...h.map((p) => p.share_pct), at(band.change_pct > SHOWN_MAX * 2 ? SHOWN_MAX * 2 : band.change_pct),
    ...(large ? [at(band.low_pct), at(Math.min(band.high_pct, SHOWN_MAX * 2))] : [])];
  const max = Math.max(...values), min = Math.min(...values, 0);
  const t0 = periodTime(h[0].period);
  const W = large ? 400 : 56, H = large ? 160 : 20, pad = large ? 22 : 2;
  const x = (time: number) => ((time - t0) / (end - t0)) * (W - 2) + 1;
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - pad - 2);
  const line = h.map((p, i) => `${i ? "L" : "M"}${x(periodTime(p.period)).toFixed(1)},${y(p.share_pct).toFixed(1)}`).join(" ");
  const cone = `M${x(start)},${y(level)} L${x(end)},${y(at(Math.min(band.high_pct, SHOWN_MAX * 2)))} L${x(end)},${y(at(band.low_pct))} Z`;
  const tip = y(at(Math.min(band.change_pct, SHOWN_MAX * 2)));
  return (
    <svg className={`spark ${band.label}${large ? " large" : ""}`} width={large ? "100%" : W} height={large ? undefined : H} viewBox={`0 0 ${W} ${H}`}
      role="img" aria-label={tf("fc.chartAria", { name, from: h[0].period, year: f.horizon_year })} preserveAspectRatio="xMidYMid meet">
      {large && <path className="spark-cone" d={cone} />}
      <path className="spark-line" d={line} />
      <path className="spark-ahead" d={`M${x(start)},${y(level)} L${x(end)},${tip}`} />
      {large && (
        <>
          <circle className="spark-tip" cx={x(end)} cy={tip} r={4} />
          <line className="spark-axis" x1={1} x2={W - 1} y1={H - pad} y2={H - pad} />
          <text x={1} y={H - 6}>{String(h[0].period).slice(0, 4)}</text>
          <text x={x(start)} y={H - 6} textAnchor="middle">{t("radar.now")}</text>
          <text x={W - 1} y={H - 6} textAnchor="end">{f.horizon_year}</text>
        </>
      )}
    </svg>
  );
}

export function Radar({ profile, onNext, onPathway, onProfile, onFlash }: {
  profile: Profile; onNext: () => void; onPathway: () => void; onProfile: (p: Profile) => void; onFlash: (message: string) => void;
}) {
  const [data, setData] = useState<RadarData | null>(null);
  const [names, setNames] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [showAll, setShowAll] = useState<Record<Band, boolean>>({ rising: false, steady: false, declining: false });
  const [open, setOpen] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { api.radar(profile.id).then(setData).catch(() => setError(t("radar.failed"))); }, [profile.id]);
  useEffect(() => { api.skills().then(setNames).catch(() => setNames([])); }, []);

  if (error) return <section><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section><p className="muted">{t("radar.loading")}</p></section>;

  // Every field is read defensively: snapshots approved at different times carry different extras.
  const allSkills = data.skills ?? [];
  const mine = new Set(profile.skills);
  const isMine = (s: SkillTrend) => s.mine || mine.has(s.skill_id);
  const bandOf = (s: SkillTrend) => s.forecast?.scenarios?.[scenario];
  const labelOf = (s: SkillTrend) => bandOf(s)?.label ?? s.label;
  const changeOf = (s: SkillTrend) => bandOf(s)?.change_pct ?? (s.trend ?? 0) * 100;
  const noData = allSkills.filter((s) => s.label === "no_data");
  const capabilities = data.capability_momentum ?? [];
  const momentum = capabilities.some((c) => c.momentum !== null);
  const meta = data.forecast ?? null;
  const jobs = meta?.history?.jobs;
  const horizon = meta?.horizon_year ?? 2030;
  const roles = (data.roles ?? []).filter((r) => r.scenarios?.[scenario])
    .sort((a, b) => b.scenarios[scenario].index - a.scenarios[scenario].index);
  const skillName = (id: string) => tr(allSkills.find((s) => s.skill_id === id)?.name ?? names.find((s) => s.id === id)?.name ?? id);

  // Your skills: every skill on the profile, with its forecast where there is one.
  const yours = profile.skills.map((id) => ({ id, s: allSkills.find((x) => x.skill_id === id && x.label !== "no_data") }));
  const count = { rising: 0, steady: 0, declining: 0 } as Record<Band, number>;
  yours.forEach(({ s }) => { const l = s && labelOf(s); if (l === "rising" || l === "steady" || l === "declining") count[l]++; });
  const risingMine = yours.filter(({ s }) => s && labelOf(s) === "rising").map(({ s }) => tr(s!.name).toLowerCase());
  const verdict = count.declining > count.rising ? t("radar.vDecl") : count.rising >= 3 ? t("radar.vRising")
    : risingMine.length ? tf("radar.vSteadyTop", { skill: risingMine[0] }) : t("radar.vSteady");
  const toAdd = allSkills.filter((s) => !isMine(s) && labelOf(s) === "rising" && bandOf(s)?.sure)
    .sort((a, b) => changeOf(b) - changeOf(a)).slice(0, 2);

  const detail = open ? allSkills.find((s) => s.skill_id === open) : undefined;
  async function addSkill(id: string) {
    setAdding(true);
    try {
      const p = await api.updateProfile({ ...profile, skills: [...profile.skills, id] });
      onProfile(p); onFlash(tf("radar.added", { skill: skillName(id) })); setOpen(null);
    } catch { onFlash(t("radar.addFailed")); }
    finally { setAdding(false); }
  }

  return (
    <section className="radar-page">
      <div className="radar-top">
        <h1>{tf("radar.h", { year: horizon })}</h1>
        {meta && (
          <div className="radar-speed">
            <span className="radar-speed-label">{t("radar.speed")}
              <button className="radar-info" aria-expanded={info} aria-label={t("radar.infoBtn")} onClick={() => setInfo(!info)}>i</button></span>
            <div className="segmented" role="radiogroup" aria-label={t("radar.speed")}>
              {SPEEDS.map((s) => <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => setScenario(s.id)}>{t(s.label)}</button>)}
            </div>
          </div>
        )}
      </div>
      {info && (
        <div className="radar-info-box" role="note">
          <strong>{t("radar.infoBtn")}</strong>
          <p>{tf("radar.info1", { from: jobs?.periods?.[0] ?? "2023", year: horizon })}</p>
          <p>{t("radar.info2")}</p>
        </div>
      )}
      <DataBanner illustrative={data.illustrative} imported={data.imported} />

      {allSkills.length === 0 ? <div className="banner warning">{t("radar.noTrends")}</div> : (
        <>
          {yours.length > 0 && (
            <div className="radar-mine">
              <div className="radar-mine-head"><h2>{verdict}</h2>
                <span className="muted">{tf("radar.mineCount", { r: count.rising, s: count.steady, d: count.declining })}</span></div>
              <div className="radar-tiles">
                {yours.map(({ id, s }) => {
                  const b = s && bandOf(s);
                  const l = s ? labelOf(s) : null;
                  return s && (l === "rising" || l === "steady" || l === "declining") ? (
                    <button key={id} className={`radar-tile ${l}`} onClick={() => setOpen(id)}>
                      <span className="radar-tile-name">{tr(s.name)}</span>
                      <span className="radar-tile-num">{ARROW[l]} {pct(changeOf(s))}</span>
                      {b && <Dots level={confidence(b)} />}
                    </button>
                  ) : (
                    <div key={id} className="radar-tile none">
                      <span className="radar-tile-name">{skillName(id)}</span>
                      <span className="muted">{t("radar.noAds")}</span>
                    </div>
                  );
                })}
              </div>
              {toAdd.length > 0 && (
                <div className="radar-add"><span>{t("radar.addRising")}</span>
                  {toAdd.map((s) => <button key={s.skill_id} className="skill-add" onClick={() => setOpen(s.skill_id)}>+ {tr(s.name)} {pct(changeOf(s))}</button>)}
                </div>
              )}
            </div>
          )}

          <div className="radar-legend">
            <span>{tf("radar.legendPct", { year: horizon })}</span>
            {([3, 2, 1] as const).map((l) => <span key={l}><Dots level={l} /> {t(CONF_WORD[l])}</span>)}
            <span><i className="radar-dot" /> {t("radar.yours").toLowerCase()}</span>
          </div>
          <div className="radar">
            {BANDS.map((band) => {
              const skills = allSkills.filter((s) => labelOf(s) === band)
                .sort((a, b) => Number(isMine(b)) - Number(isMine(a)) || (band === "declining" ? changeOf(a) - changeOf(b) : changeOf(b) - changeOf(a)));
              const shown = showAll[band] ? skills : skills.filter((s, i) => i < TOP || isMine(s));
              return (
                <div key={band} className={`radar-col ${band}`}>
                  <h2>{TREND_TEXT[band]} <small>{skills.length}</small></h2>
                  <ul>
                    {shown.map((s) => {
                      const b = bandOf(s);
                      return (
                        <li key={s.skill_id}>
                          <button className={`radar-row${isMine(s) ? " mine" : ""}`} onClick={() => setOpen(s.skill_id)}>
                            <span className="radar-row-name">{isMine(s) && <i className="radar-dot" aria-label={t("radar.yours")} />}<span>{tr(s.name)}</span></span>
                            {s.forecast ? <Spark name={tr(s.name)} f={s.forecast} scenario={scenario} /> : <span className="spark-none" />}
                            <strong className="radar-row-num">{pct(changeOf(s))}</strong>
                            {b ? <Dots level={confidence(b)} /> : <span />}
                          </button>
                        </li>
                      );
                    })}
                    {skills.length === 0 && <li className="muted">{t("radar.none")}</li>}
                  </ul>
                  {skills.length > TOP && (
                    <button className="link radar-more" onClick={() => setShowAll({ ...showAll, [band]: !showAll[band] })}>
                      {showAll[band] ? t("radar.showFewer") : tf("radar.showAll", { n: skills.length })}</button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <details className="radar-how">
        <summary>{t("radar.how")}</summary>
        <div className="radar-how-body">
          <p className="source">{data.source}</p>
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
          {roles.length > 0 && (
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
          )}
          {noData.length > 0 && (
            <div>
              <p className="muted">{tf("radar.noDataCount", { n: noData.length })} {t("radar.twoCounts")}</p>
              <p className="source">{noData.map((s) => tr(s.name)).join(" · ")}</p>
            </div>
          )}
          <p className="source">Snapshot {data.snapshot_id} · imported {data.imported}
            {(data.inputs ?? []).map((i) => <span key={i.source}> · {i.source} (retrieved {i.retrieved})</span>)}
            {meta?.history && Object.values(meta.history).map((h) => h?.periods && (
              <span key={h.source}> · {h.source} {h.periods[0]}–{h.periods[1]} (retrieved {h.retrieved})</span>
            ))}</p>
        </div>
      </details>
      <button className="primary" onClick={onNext}>{t("radar.cta")} →</button>

      {detail && (
        <Sheet title={tr(detail.name)} onClose={() => setOpen(null)}>
          <SkillDetail s={detail} scenario={scenario} mine={isMine(detail)} label={labelOf(detail)} busy={adding}
            onAdd={() => addSkill(detail.skill_id)} onCourse={onPathway} />
        </Sheet>
      )}
    </section>
  );
}

function SkillDetail({ s, scenario, mine, label, busy, onAdd, onCourse }: {
  s: SkillTrend; scenario: Scenario; mine: boolean; label: string; busy: boolean; onAdd: () => void; onCourse: () => void;
}) {
  const f = s.forecast;
  const b = f?.scenarios?.[scenario];
  const sources = s.sources ?? [];
  return (
    <div className="radar-detail">
      {mine && <span className="badge">{t("radar.yours")}</span>}
      {b && f ? (
        <>
          <p><strong className={`radar-big ${label}`}>{pct(b.change_pct)}</strong> <span className="muted">{tf("radar.byYear", { year: f.horizon_year })}</span></p>
          <Spark name={tr(s.name)} f={f} scenario={scenario} large />
          <ul className="radar-facts">
            <li>{b.low_pct > SHOWN_MAX ? tf("radar.rangeAbove", { hi: `+${SHOWN_MAX}%` }) : tf("radar.range", { lo: pct(b.low_pct), hi: pct(b.high_pct) })}</li>
            <li><Dots level={confidence(b)} /> {t(confidence(b) === 3 ? "radar.conf3" : confidence(b) === 2 ? "radar.conf2" : "radar.conf1")}</li>
            {f.scenarios.slow && f.scenarios.accelerated && (
              <li>{tf("radar.scen", { slow: pct(f.scenarios.slow.change_pct), base: pct(f.scenarios.baseline.change_pct), fast: pct(f.scenarios.accelerated.change_pct) })}</li>
            )}
            {f.emerging && <li>{t("fc.emergingHelp")}</li>}
          </ul>
        </>
      ) : (
        <p className="muted">{typeof s.trend === "number" ? `${signed(Math.round(s.trend * 100))}%` : t("radar.noAds")}</p>
      )}
      {sources.length > 0 && (
        <details className="radar-src"><summary className="source">{tf("fc.sources", { n: sources.length })}</summary>
          <ul className="radar-src-list">{sources.map((x) => <li key={x} className="source">{x}</li>)}</ul></details>
      )}
      {mine ? <button className="btn quiet" onClick={onCourse}>{t("radar.course")}</button>
        : <button className="primary" onClick={onAdd} disabled={busy} aria-busy={busy}>{t("radar.add")}</button>}
    </div>
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
