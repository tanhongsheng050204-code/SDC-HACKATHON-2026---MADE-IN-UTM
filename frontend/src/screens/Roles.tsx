import { useEffect, useRef, useState, type ReactNode } from "react";
import { SpeedPanel } from "../components/AdoptionSlider";
import { DataBanner } from "../components/DataBanner";
import { EmergingRoles } from "../components/EmergingRoles";
import { ExposureMap } from "../components/ExposureMap";
import { SdgLens } from "../components/SdgLens";
import { RoleGraph } from "../components/RoleGraph";
import { Sheet } from "../components/Sheet";
import { percent } from "../lib/format";
import { AiAssisted } from "../components/AiAssisted";
import { api, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { ForecastHow } from "../components/ForecastHow";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS } from "../lib/labels";
import { KEYS, load, save } from "../lib/storage";

// Below this fit no role is a realistic short move, so we say so instead of implying one is.
const CLOSE_FIT = 0.35;
const TOP = 5;
const SPEEDS: Record<Scenario, StringKey> = { slow: "roles.speedSlow", baseline: "roles.speedBase", accelerated: "roles.speedFast" };
const ARROW: Record<string, string> = { growing: "▲", emerging: "▲", stable: "■", declining: "▼" };
const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n))}%`;
const bare = (label: string) => label.replace(/^[^\p{L}]+/u, "");  // "▲ Growing" → "Growing"
type View = "list" | "graph" | "exposure";
type Open = "custom" | "sdg" | "how" | "more" | null;

// Future roles: one bar picks the future (AI speed, year), a sentence sums up the answer, and the
// best matches follow at once. Filters, method and extra modules sit in sheets or folded rows.
export function Roles({ profile, scenario, year, adoption, onScenario, onAdoption, onYear, onOpen, onSurvey }: {
  profile: Profile; scenario: Scenario; year?: number; adoption?: number;
  onScenario: (s: Scenario) => void; onAdoption: (a: number | undefined) => void;
  onYear: (y: number) => void; onOpen: (r: RoleMatch) => void; onSurvey: () => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [onlyGoal, setOnlyGoal] = useState<number | null>(null);  // SDG lens: show only roles serving this goal
  const [extra, setExtra] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [all, setAll] = useState(false);
  const [moved, setMoved] = useState<number | null>(null);
  const lastTop = useRef<{ key: string; ids: string[] } | null>(null);
  const [view, setView] = useState<View>(() => {
    const v = load(KEYS.rolesView);
    return v === "graph" || v === "exposure" ? v : "list";
  });
  function changeView(v: View) { setView(v); save(KEYS.rolesView, v); }

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.matches(profile.id, scenario, year, adoption, extra)
      .then((d) => { if (live) { setData(d); setError(null); } })
      // Keep the last list on screen; it is still correct for the previous choice.
      .catch(() => live && setError(t("roles.updateFailed")))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [profile.id, profile.completed_courses.length, scenario, year, adoption, extra.join(",")]);

  // After the AI speed changes, say how many of the top 5 moved (the En-ROADS "vs baseline" idea).
  useEffect(() => {
    if (!data) return;
    const key = `${scenario}|${adoption ?? ""}`;
    const ids = data.roles.slice(0, TOP).map((r) => r.role_id);
    const prev = lastTop.current;
    if (prev && prev.key !== key) setMoved(ids.filter((id, i) => prev.ids[i] !== id).length);
    lastTop.current = { key, ids };
  }, [data]);  // eslint-disable-line react-hooks/exhaustive-deps

  const noCloseRole = data && data.roles.length > 0 && data.roles.every((r) => r.fit < CLOSE_FIT);
  const hasJob = Boolean(profile.current_role_id) && profile.audience !== "graduate";
  const top = data?.roles[0];
  // The shortest route is only worth a badge when it saves real time: 30% fewer hours than the top role.
  const candidate = data?.shortest_route ? data.roles.find((r) => r.role_id === data.shortest_route) : undefined;
  const shortest = candidate && top && candidate.role_id !== top.role_id && (candidate.plan_hours ?? 0) <= 0.7 * (top.plan_hours ?? 0) ? candidate : undefined;
  const roles = (data?.roles ?? []).filter((r) => onlyGoal === null || r.sdgs.some((g) => g.number === onlyGoal));
  const shown = all ? roles : roles.slice(0, TOP);
  const current = data?.current_role;
  const shownYear = data?.year ?? year;

  const yearStepper = data && (
    <span className="roles-year">
      <span className="roles-label">{t("roles.year")}</span>
      <span className="roles-stepper">
        <button aria-label={t("roles.earlier")} disabled={data.year <= data.year_range[0]} onClick={() => onYear(data.year - 1)}>‹</button>
        <strong aria-live="polite">{data.year}</strong>
        <button aria-label={t("roles.later")} disabled={data.year >= data.year_range[1]} onClick={() => onYear(data.year + 1)}>›</button>
      </span>
    </span>
  );
  const sdgButton = data && (
    <button className="roles-pill" aria-expanded={open === "sdg"} onClick={() => setOpen("sdg")}>
      🌍 {onlyGoal ? tf("roles.sdgOne", { n: onlyGoal }) : t("roles.sdg")} ▾</button>
  );
  const viewSwitch = data && (
    <div className="segmented roles-view" role="radiogroup" aria-label={t("graph.title")}>
      <button role="radio" aria-checked={view === "list"} onClick={() => changeView("list")}>{t("graph.list")}</button>
      <button role="radio" aria-checked={view === "graph"} onClick={() => changeView("graph")}>{t("graph.graph")}</button>
      <button role="radio" aria-checked={view === "exposure"} onClick={() => changeView("exposure")}>{t("map.exposureTab")}</button>
    </div>
  );
  const howButton = data && <button className="link" onClick={() => setOpen("how")}>ⓘ {t("roles.how")}</button>;

  return (
    <section className="roles-page">
      <div className="page-head">
        <h1>{t("h.roles")}</h1>
        {profile.story && <p className="muted">{profile.display_name}: {profile.story}</p>}
      </div>

      <div className="roles-bar">
        <span className="roles-label">{t("roles.speed")}</span>
        <div className="segmented roles-speed" role="radiogroup" aria-label={t("roles.speed")}>
          {SCENARIOS.map((s) => (
            <button key={s.id} role="radio" aria-checked={scenario === s.id && adoption === undefined} onClick={() => { onScenario(s.id); setOpen(null); }}>{t(SPEEDS[s.id])}</button>
          ))}
          <button role="radio" aria-checked={adoption !== undefined} aria-expanded={open === "custom"} onClick={() => setOpen(open === "custom" ? null : "custom")}>
            {adoption !== undefined ? `${t("roles.custom")} ${adoption}×` : t("roles.custom")} ▾</button>
        </div>
        <span className="roles-extra">{yearStepper}{sdgButton}</span>
        <span className="roles-spacer" />
        <span className="roles-extra">{viewSwitch}</span>
        <button className="roles-pill roles-more" onClick={() => setOpen("more")}>{t("roles.more")} ▾</button>
      </div>
      {open === "custom" && (
        <div className="roles-pop">
          <SpeedPanel profileId={profile.id} year={year} value={adoption} preset={data?.scenario.adoption ?? 1} onChange={onAdoption} />
        </div>
      )}

      {!data && loading && <SkeletonRows />}
      {error && <p className="error" role="alert">{error}</p>}
      {data && top && (
        <div className="roles-sum" aria-live="polite">
          <p>{tf("roles.best", { role: tr(top.title), fit: percent(top.fit), outlook: bare(OUTLOOK_TEXT[top.outlook[scenario].label]).toLowerCase(), pct: signedPct(top.outlook[scenario].index) })}</p>
          {current && hasJob && (
            current.at_risk || current.outlook[scenario].label === "declining"
              ? <p className="risk">{tf("roles.currentRisk", { role: tr(current.title), year: shownYear ?? "" })}</p>
              : <p>{tf("roles.current", { role: tr(current.title), outlook: bare(OUTLOOK_TEXT[current.outlook[scenario].label]).toLowerCase(), year: shownYear ?? "" })}</p>
          )}
          {moved !== null && moved > 0 && <p className="muted">{tf("roles.moved", { n: moved })}</p>}
        </div>
      )}
      {noCloseRole && <div className="banner">{t("roles.noClose")}</div>}

      {data && view === "graph" ? (
        <div className={loading ? "is-updating" : undefined} aria-busy={loading}>
          <RoleGraph data={data} profile={profile} scenario={scenario} onOpen={onOpen} />
        </div>
      ) : data && view === "exposure" ? <ExposureMap data={data} scenario={scenario} onOpen={onOpen} /> : data && (
        <>
          <div className="roles-head"><h2>{t("roles.listTitle")}</h2><span className="muted">{tf("roles.count", { n: roles.length })} · {howButton}</span></div>
          <ul className={loading ? "roles-list is-updating" : "roles-list"} aria-busy={loading}>
            {shown.map((r) => <li key={r.role_id}><RoleRow role={r} scenario={scenario} shortest={r.role_id === shortest?.role_id} onOpen={() => onOpen(r)} /></li>)}
          </ul>
          {roles.length > TOP && (
            <button className="link roles-all" onClick={() => setAll(!all)}>{all ? t("roles.showTop") : tf("roles.showAll", { n: roles.length })}</button>
          )}
        </>
      )}

      {data && (
        <section className="roles-explore" aria-labelledby="explore-h">
          <h2 id="explore-h">{t("roles.explore")}</h2>
          <div className="role-rows">
            <Row title={t("whatif.title") + (extra.length ? ` (${extra.length})` : "")} hint={t("roles.whatIfHint")} open={extra.length > 0}>
              <WhatIf data={data} extra={extra} onChange={setExtra} />
            </Row>
            {hasJob && current && (
              <Row title={t("roles.aiTitle")} hint={tf("roles.aiHint", { job: tr(current.title) })}>
                <AiAssisted profile={profile} outlook={current.outlook[scenario]} />
              </Row>
            )}
            <Row title={t("survey.alsoLike")} hint={t("roles.likeHint")}>
              {data.also_like.length > 0 ? (
                <div className="actions">
                  {data.also_like.map((a) => {
                    const match = data.roles.find((r) => r.role_id === a.role_id);
                    return match && <button key={a.role_id} className="btn quiet sm" onClick={() => onOpen(match)}>{tr(a.title)} · #{a.rank}</button>;
                  })}
                </div>
              ) : <button className="link" onClick={onSurvey}>{t("survey.prompt")}</button>}
            </Row>
            <Row title={t("roles.emerging")} hint={t("roles.emergingHint")}>
              <EmergingRoles profile={profile} refreshKey={0} onStart={(roleId) => {
                const match = data.roles.find((r) => r.role_id === roleId);
                if (match) onOpen(match);
              }} />
            </Row>
          </div>
        </section>
      )}

      {open === "sdg" && data && (
        <Sheet title={t("lens.title")} onClose={() => setOpen(null)}>
          <SdgLens roles={data.roles} scenario={scenario} onOpen={onOpen} onlyGoal={onlyGoal} onOnlyGoal={setOnlyGoal} />
        </Sheet>
      )}
      {open === "how" && data && (
        <Sheet title={t("roles.how")} onClose={() => setOpen(null)}>
          <p>{tr(data.scenario.description)}</p>
          <p className="muted">{t("roles.robustNote")}</p>
          <ForecastHow data={data} />
          <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />
          <p className="source">{tf("roles.yearNote", { year: data.year_range[1] })}</p>
          <p className="source">Source: {data.signal_source.source} · published {data.signal_source.published} ·
            imported {data.signal_source.imported} · horizon {data.signal_source.horizon_year}</p>
        </Sheet>
      )}
      {open === "more" && data && (
        <Sheet title={t("roles.moreTitle")} onClose={() => setOpen(null)}>
          <div className="roles-more-body">{yearStepper}{sdgButton}{viewSwitch}</div>
        </Sheet>
      )}
    </section>
  );
}

// One role as a single row: rank, title and badges, fit, outlook, pay and hours to learn.
function RoleRow({ role, scenario, shortest, onOpen }: { role: RoleMatch; scenario: Scenario; shortest: boolean; onOpen: () => void }) {
  const o = role.outlook[scenario];
  // With "What if I learn...?" on, show how far the tried skills move this role; otherwise vs baseline.
  const move = role.rank_without_extra !== undefined ? role.rank_without_extra - role.rank : role.rank_change_vs_baseline;
  const badges: { cls: string; text: string; title?: string }[] = [];
  if (role.is_current_role) badges.push({ cls: "", text: t("card.current") });
  if (shortest) badges.push({ cls: "accent", text: t("route.badge") });
  if (role.robust_pick) badges.push({ cls: "good", text: t("card.robust") });
  if (role.long_shot) badges.push({ cls: "risk", text: t("card.longShot"), title: t("card.longShotHelp") });
  if (role.being_checked) badges.push({ cls: "", text: t("card.newRole"), title: t("card.newRoleHelp") });
  return (
    <button className={`roles-row${role.at_risk ? " at-risk" : ""}`} onClick={onOpen}>
      <span className="roles-rank">{role.rank}{move !== 0 && <small className={move > 0 ? "up" : "down"}>{move > 0 ? `▲${move}` : `▼${-move}`}</small>}</span>
      <span className="roles-name"><strong>{tr(role.title)}</strong>
        {badges.length > 0 && <span className="roles-badges">{badges.slice(0, 2).map((b) => <span key={b.text} className={`badge ${b.cls}`} title={b.title}>{b.text}</span>)}</span>}</span>
      <span className="roles-fit"><span>{tf("roles.fit", { n: percent(role.fit) })}</span>
        <span className="roles-fitbar" role="img" aria-label={tf("card.fitAria", { n: percent(role.fit) })}><i style={{ width: `${role.fit * 100}%` }} /></span></span>
      <span className={`roles-out ${o.label}`}>{ARROW[o.label] ?? ""} {signedPct(o.index)}<small>{bare(OUTLOOK_TEXT[o.label])}</small></span>
      <span className="roles-pay">{role.pay ? `RM ${role.pay.median_rm.toLocaleString("en-MY")}` : "–"}<small>{t("roles.payMonth")}</small></span>
      <span className="roles-hours">{role.plan_hours ? tf("roles.hours", { h: Math.round(role.plan_hours) }) : "–"}<small>{t("roles.toLearn")}</small></span>
    </button>
  );
}

/** One folded line with its title and a short hint; the module opens in place below it. */
function Row({ title, hint, open = false, children }: { title: string; hint: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="role-row" open={open}>
      <summary><strong>{title}</strong><span className="muted">{hint}</span></summary>
      <div className="role-row-body">{children}</div>
    </details>
  );
}

function SkeletonRows() {
  return (
    <div className="roles-list" aria-hidden="true">
      {[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}
    </div>
  );
}

// "What if I learn...?": tick skills you don't have yet and watch the ranking move. Nothing is
// saved; a skill only counts for real once it is proven in the skill tree.
function WhatIf({ data, extra, onChange }: { data: Matches; extra: string[]; onChange: (s: string[]) => void }) {
  const options = new Map<string, string>();
  for (const r of data.roles.slice(0, 6)) for (const s of r.missing) if (!options.has(s.skill_id)) options.set(s.skill_id, s.name);
  for (const id of extra) if (!options.has(id)) options.set(id, id);
  const toggle = (id: string) => onChange(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id].slice(0, 10));
  return (
    <div className="what-if">
      <p className="muted">{t("whatif.sub")}</p>
      <div className="chips">
        {[...options].slice(0, 14).map(([id, name]) => (
          <button key={id} className={extra.includes(id) ? "chip covered" : "chip missing"} aria-pressed={extra.includes(id)} onClick={() => toggle(id)}>
            {extra.includes(id) ? "✓ " : "+ "}{tr(name)}
          </button>
        ))}
      </div>
      {extra.length > 0 && <button className="link" onClick={() => onChange([])}>{t("whatif.clear")}</button>}
    </div>
  );
}
