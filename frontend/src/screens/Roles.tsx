import { useEffect, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { Kpis } from "../components/Kpis";
import { Change, compareMatches, RefreshPanel, WhatChanged } from "../components/RefreshPanel";
import { RoleCard } from "../components/RoleCard";
import { api, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { t } from "../lib/i18n";
import { SCENARIOS } from "../lib/labels";
import { KEYS, load, save } from "../lib/storage";

// Below this fit no role is a realistic short move, so we say so instead of implying one is.
const CLOSE_FIT = 0.35;

export function Roles({ profile, scenario, year, onScenario, onYear, onOpen }: {
  profile: Profile; scenario: Scenario; year?: number;
  onScenario: (s: Scenario) => void; onYear: (y: number) => void; onOpen: (r: RoleMatch) => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [tipSeen, setTipSeen] = useState(() => load(KEYS.sliderTip) === "1");

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.matches(profile.id, scenario, year)
      .then((d) => { if (live) { setData(d); setError(null); } })
      // Keep the last list on screen; it is still correct for the previous choice.
      .catch(() => live && setError("Couldn't update the list. Showing your last results."))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [profile.id, profile.interests.join(","), profile.completed_courses.length, scenario, year]);

  async function afterRefresh() {
    const before = data;
    const after = await api.matches(profile.id, scenario, year);
    setData(after);
    if (before) setChanges(compareMatches(before, after, scenario));
  }
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
      <div className="segmented" role="radiogroup" aria-label="AI adoption scenario">
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
        ))}
      </div>
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
      {data && <p className="muted">{data.scenario.description}</p>}
      {data && <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />}
      {error && <p className="error" role="alert">{error}</p>}
      <RefreshPanel onDone={afterRefresh} />
      {changes && <WhatChanged changes={changes} snapshot={data?.signal_source.snapshot_id ?? ""} onClose={() => setChanges(null)} />}
      {noCloseRole && (
        <div className="banner">{t("roles.noClose")}</div>
      )}
      <div className={loading && data ? "grid is-updating" : "grid"} aria-busy={loading}>
        {data?.roles.map((r) => <RoleCard key={r.role_id} role={r} scenario={scenario} onOpen={() => onOpen(r)} />)}
      </div>
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
