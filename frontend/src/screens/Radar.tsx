import { useEffect, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { api, Profile, Radar as RadarData } from "../lib/api";
import { signed } from "../lib/format";
import { t } from "../lib/i18n";
import { TREND_TEXT } from "../lib/labels";

const BANDS = ["rising", "steady", "declining"] as const;

export function Radar({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const [data, setData] = useState<RadarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  useEffect(() => { api.radar(profile.id).then(setData).catch(() => setError("Couldn't load the radar.")); }, [profile.id]);

  if (error) return <section><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section><p className="muted">Loading the radar…</p></section>;

  const visible = onlyMine ? data.skills.filter((s) => s.mine) : data.skills;
  const noData = data.skills.filter((s) => s.label === "no_data");
  const momentum = data.capability_momentum.some((c) => c.momentum !== null);
  return (
    <section>
      <div className="page-head"><h1>{t("h.radar")}</h1>
        <p className="muted">{t("note.estimate")}</p></div>
      <DataBanner illustrative={data.illustrative} imported={data.imported} />
      {data.skills.length === 0 ? (
        <div className="banner warning">This forecast has no skill trends yet. An admin can run <strong>Refresh trend data</strong> on the Roles screen to pull the latest research and job-posting data.</div>
      ) : (
        <>
          <label className="check"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> {t("radar.onlyMine")}</label>
          <div className="radar">
            {BANDS.map((band) => {
              const skills = visible.filter((s) => s.label === band);
              return (
                <div key={band} className={`radar-col ${band}`}>
                  <h3 className={`outlook ${band === "rising" ? "growing" : band}`}>{TREND_TEXT[band]} ({skills.length})</h3>
                  <ul>
                    {skills.map((s) => (
                      <li key={s.skill_id} className={s.mine ? "mine" : ""} title={s.sources.join("\n")}>
                        <span>{s.name}{s.mine && <span className="badge">Yours</span>}</span>
                        <span className="muted">{s.trend !== null ? `${signed(Math.round(s.trend * 100))}%` : ""}</span>
                        {s.sources.length > 0 && <small className="source radar-src">{s.sources.join(" · ")}</small>}
                      </li>
                    ))}
                    {skills.length === 0 && <li className="muted">None</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
      {noData.length > 0 && (
        <details><summary className="muted">{noData.length} skills have no trend in these sources yet</summary>
          <p className="muted">A trend needs two counts of the same source. Until then we show what we have instead of guessing.</p>
          <ul className="plain-list">
            {noData.map((s) => <li key={s.skill_id}><strong>{s.name}</strong>{s.sources.length > 0 && <small className="source radar-src">{s.sources.join(" · ")}</small>}</li>)}
          </ul>
        </details>
      )}
      {momentum && (
        <div className="card">
          <h3>AI capabilities: research momentum</h3>
          <p className="muted">Paper growth compared with AI research overall. Above zero means accelerating faster than average.</p>
          <ul className="momentum">
            {data.capability_momentum.map((c) => {
              const m = c.momentum ?? 0;
              return (
                <li key={c.id}>
                  <span>{c.name}</span>
                  <span className="bar"><span style={{ width: `${Math.abs(m) * 50}%`, marginLeft: m < 0 ? `${50 - Math.abs(m) * 50}%` : "50%" }} className={m < 0 ? "neg" : "pos"} /></span>
                  <span className="muted">{c.momentum !== null ? signed(Math.round(c.momentum * 100) / 100) : "–"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="source">Snapshot {data.snapshot_id} · imported {data.imported}
        {data.inputs.map((i) => <span key={i.source}> · {i.source} (retrieved {i.retrieved})</span>)}</p>
      <button className="primary" onClick={onNext}>{t("a.seeRoles")}</button>
    </section>
  );
}
