import { useEffect, useState } from "react";
import { AdoptionSlider, TippingPoints } from "../components/AdoptionSlider";
import { DataBanner } from "../components/DataBanner";
import { Kpis } from "../components/Kpis";
import { EmergingRoles } from "../components/EmergingRoles";
import { ExposureMap } from "../components/ExposureMap";
import { RoleCard } from "../components/RoleCard";
import { RoleGraph } from "../components/RoleGraph";
import { api, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { t, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, SCENARIOS } from "../lib/labels";
import { KEYS, load, save } from "../lib/storage";

// Below this fit no role is a realistic short move, so we say so instead of implying one is.
const CLOSE_FIT = 0.35;

export function Roles({ profile, scenario, year, adoption, onScenario, onAdoption, onYear, onOpen, onSurvey }: {
  profile: Profile; scenario: Scenario; year?: number; adoption?: number;
  onScenario: (s: Scenario) => void; onAdoption: (a: number | undefined) => void;
  onYear: (y: number) => void; onOpen: (r: RoleMatch) => void; onSurvey: () => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipSeen, setTipSeen] = useState(() => load(KEYS.sliderTip) === "1");
  const [view, setView] = useState<"list" | "graph" | "exposure">(() => {
    const v = load(KEYS.rolesView);
    return v === "graph" || v === "exposure" ? v : "list";
  });
  function changeView(v: "list" | "graph" | "exposure") { setView(v); save(KEYS.rolesView, v); }

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

  function dismissTip() { setTipSeen(true); save(KEYS.sliderTip, "1"); }

  const noCloseRole = data && data.roles.length > 0 && data.roles.every((r) => r.fit < CLOSE_FIT);
  return (
    <section>
      <div className="page-head">
        <h1>{t("h.roles")}</h1>
        {profile.story && <p className="muted">{profile.display_name}: {profile.story}</p>}
      </div>
      {!data && loading && <SkeletonCards />}
      {data && <Kpis data={data} scenario={scenario} />}
      <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={scenario === s.id && adoption === undefined} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
        ))}
      </div>
      <AdoptionSlider value={adoption} onChange={onAdoption} />
      {data && <TippingPoints profileId={profile.id} year={year} />}
      {data && (
        <div className="year-slider">
          <label htmlFor="year">{t("k.lookAhead")} <strong>{data.year}</strong> <span className="badge">{t("k.estimate")}</span></label>
          <input id="year" type="range" min={data.year_range[0]} max={data.year_range[1]} step={1}
            value={data.year} onChange={(e) => onYear(Number(e.target.value))} aria-valuetext={`${data.year}`} />
          <div className="year-ticks" aria-hidden="true">
            {Array.from({ length: data.year_range[1] - data.year_range[0] + 1 }, (_, i) => <span key={i}>{data.year_range[0] + i}</span>)}
          </div>
          <p className="source">The sources forecast to {data.year_range[1]}; we do not extend them further.</p>
        </div>
      )}
      {data && !tipSeen && (
        <div className="tip" role="note">
          <p><strong>{t("tip.title")}</strong> {t("tip.body")}</p>
          <button className="link" onClick={dismissTip}>{t("tip.ok")}</button>
        </div>
      )}
      {data && <p className="muted scenario-note">{tr(data.scenario.description)}</p>}
      {data && <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />}
      {error && <p className="error" role="alert">{error}</p>}
      {noCloseRole && (
        <div className="banner">{t("roles.noClose")}</div>
      )}
      {data && profile.audience === "switcher" && data.current_role && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.switchTitle")}</span>
          <strong>{tr(data.current_role.title)}: {OUTLOOK_TEXT[data.current_role.outlook[scenario].label]}</strong>
          <p className="muted">{t("lead.switchList")}</p>
        </div>
      )}
      {data && data.also_like.length > 0 && (
        <div className="card also-like">
          <h2>{t("survey.alsoLike")}</h2>
          <p className="muted">{t("survey.alsoLikeSub")}</p>
          <div className="actions">
            {data.also_like.map((a) => {
              const match = data.roles.find((r) => r.role_id === a.role_id);
              return match && <button key={a.role_id} className="btn quiet sm" onClick={() => onOpen(match)}>{tr(a.title)} · #{a.rank}</button>;
            })}
          </div>
        </div>
      )}
      {data && Object.keys(profile.preferences ?? {}).length === 0 && (
        <p className="muted"><button className="link" onClick={onSurvey}>{t("survey.prompt")}</button></p>
      )}
      {data && <WhatIf data={data} extra={extra} onChange={setExtra} />}
      {data && (
        <div className="segmented view-switch" role="radiogroup" aria-label={t("graph.title")}>
          <button role="radio" aria-checked={view === "list"} onClick={() => changeView("list")}>{t("graph.list")}</button>
          <button role="radio" aria-checked={view === "graph"} onClick={() => changeView("graph")}>{t("graph.graph")}</button>
          <button role="radio" aria-checked={view === "exposure"} onClick={() => changeView("exposure")}>{t("map.exposureTab")}</button>
        </div>
      )}
      {data && view === "graph" ? (
        <div className={loading ? "is-updating" : undefined} aria-busy={loading}>
          <RoleGraph data={data} profile={profile} scenario={scenario} onOpen={onOpen} />
        </div>
      ) : data && view === "exposure" ? <ExposureMap data={data} scenario={scenario} onOpen={onOpen} /> : (
        <div className={loading && data ? "grid is-updating" : "grid"} aria-busy={loading}>
          {data?.roles.map((r) => <RoleCard key={r.role_id} role={r} scenario={scenario} onOpen={() => onOpen(r)} />)}
        </div>
      )}
      {data && (
        <EmergingRoles profile={profile} refreshKey={0} onStart={(roleId) => {
          const match = data.roles.find((r) => r.role_id === roleId);
          if (match) onOpen(match);
        }} />
      )}
      {data && (
        <p className="source">Source: {data.signal_source.source} · published {data.signal_source.published} ·
          imported {data.signal_source.imported} · horizon {data.signal_source.horizon_year}</p>
      )}
    </section>
  );
}

function SkeletonCards() {
  return (
    <div className="grid" aria-hidden="true">
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
    <details className="card what-if" open={extra.length > 0}>
      <summary>{t("whatif.title")}{extra.length > 0 && ` (${extra.length})`}</summary>
      <p className="muted">{t("whatif.sub")}</p>
      <div className="chips">
        {[...options].slice(0, 14).map(([id, name]) => (
          <button key={id} className={extra.includes(id) ? "chip covered" : "chip missing"} aria-pressed={extra.includes(id)} onClick={() => toggle(id)}>
            {extra.includes(id) ? "✓ " : "+ "}{tr(name)}
          </button>
        ))}
      </div>
      {extra.length > 0 && <button className="link" onClick={() => onChange([])}>{t("whatif.clear")}</button>}
    </details>
  );
}
