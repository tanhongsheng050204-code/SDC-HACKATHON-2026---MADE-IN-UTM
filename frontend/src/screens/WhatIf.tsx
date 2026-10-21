import { useEffect, useMemo, useState } from "react";
import { InfoTip } from "../components/InfoTip";
import { api, Explore, Profile, Skill } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

const PRESETS = [{ value: 0.5, label: "Slow" }, { value: 1, label: "Today's trend" }, { value: 1.6, label: "Accelerated" }];

// Two levers, one answer: how fast AI arrives (any speed, not just three scenarios) and which
// skills you might learn. Nothing here changes the profile; it only shows cause and effect.
export function WhatIf({ profile, onRoles }: { profile: Profile; onRoles: () => void }) {
  const [adoption, setAdoption] = useState(1);
  const [added, setAdded] = useState<string[]>([]);
  const [data, setData] = useState<Explore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [suggested, setSuggested] = useState<string[]>([]);
  const [more, setMore] = useState("");

  useEffect(() => {
    api.skills().then(setSkills).catch(() => undefined);
    // Suggest the skills missing from your current top five roles, most important first.
    api.matches(profile.id, "baseline").then((m) => {
      const order: string[] = [];
      m.roles.slice(0, 5).forEach((r) => r.missing.forEach((s) => { if (!order.includes(s.skill_id)) order.push(s.skill_id); }));
      setSuggested(order.slice(0, 10));
    }).catch(() => undefined);
  }, [profile.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      api.explore(profile.id, adoption, added).then((d) => { setData(d); setError(null); })
        .catch(() => setError("Couldn't recalculate. Check your connection and try again."));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [profile.id, adoption, added, profile.completed_courses.length]);

  const name = (id: string) => skills.find((s) => s.id === id)?.name ?? id;
  const toggle = (id: string) => setAdded(added.includes(id) ? added.filter((x) => x !== id) : [...added, id]);
  const preset = PRESETS.find((p) => Math.abs(p.value - adoption) < 0.001);
  const others = useMemo(() => skills.filter((s) => !profile.skills.includes(s.id) && !suggested.includes(s.id)), [skills, profile.skills, suggested]);

  return (
    <section className="whatif">
      <div className="page-head"><h1>{t("h.whatif")}</h1>
        <p className="muted">Move the levers and watch your future roles respond. Nothing here changes your profile.</p></div>

      <div className="card whatif-lever">
        <div className="card-row">
          <h2>How fast will employers adopt AI? <InfoTip term="gl.adoption" label="AI adoption speed" /></h2>
          <strong className="adoption-value">{adoption.toFixed(2)}× <span className="badge">{preset ? preset.label : "your own assumption"}</span></strong>
        </div>
        <input type="range" min={0.5} max={2} step={0.05} value={adoption} aria-label="AI adoption speed"
          aria-valuetext={`${adoption.toFixed(2)} times today's trend${preset ? `, ${preset.label}` : ""}`}
          onChange={(e) => setAdoption(Number(e.target.value))} />
        <div className="adoption-presets">
          {PRESETS.map((p) => (
            <button key={p.value} className={preset?.value === p.value ? "chip covered" : "chip"} onClick={() => setAdoption(p.value)}>
              {p.label} · {p.value}×
            </button>
          ))}
        </div>
        {data && <Tipping data={data} adoption={adoption} />}
      </div>

      <div className="card whatif-lever">
        <h2>What if I learn…</h2>
        <p className="muted">Tick skills you might learn. Suggestions are the skills missing from your top five roles.</p>
        <div className="chips">
          {suggested.map((id) => (
            <button key={id} className={added.includes(id) ? "chip covered" : "chip"} aria-pressed={added.includes(id)} onClick={() => toggle(id)}>
              {added.includes(id) ? "✓ " : "+ "}{name(id)}
            </button>
          ))}
        </div>
        <label className="narrow">Another skill
          <select value={more} onChange={(e) => { if (e.target.value && !added.includes(e.target.value)) setAdded([...added, e.target.value]); setMore(""); }}>
            <option value="">Choose a skill</option>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        {added.length > 0 && (
          <div className="chips">{added.filter((id) => !suggested.includes(id)).map((id) => (
            <button key={id} className="chip covered" onClick={() => toggle(id)} aria-label={`Remove ${name(id)}`}>✓ {name(id)} ×</button>
          ))}<button className="link" onClick={() => setAdded([])}>Clear all</button></div>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {data && <Results data={data} onRoles={onRoles} />}
      {data && <p className="source">{data.assumption} Forecast {data.source.snapshot_id}, imported {data.source.imported}.</p>}
    </section>
  );
}

function Tipping({ data, adoption }: { data: Explore; adoption: number }) {
  const tip = data.tipping;
  const series = tip.series.filter((p) => p.current_index !== null) as { adoption: number; current_index: number; top: string }[];
  return (
    <div className="tipping">
      <h3>Tipping points</h3>
      <ul className="tipping-list">
        {tip.current_role && (tip.current_changes.length
          ? tip.current_changes.map((c) => (
            <li key={`c${c.adoption}`}><strong>{tip.current_role}</strong> turns from {OUTLOOK_TEXT[c.from]} to {OUTLOOK_TEXT[c.to]} at <strong>{c.adoption.toFixed(2)}×</strong> AI speed.</li>))
          : <li><strong>{tip.current_role}</strong> stays in the same outlook band at every speed from {tip.range[0]}× to {tip.range[1]}×.</li>)}
        {tip.top_changes.map((c) => (
          <li key={`t${c.adoption}`}>Your top match switches from <strong>{c.from}</strong> to <strong>{c.to}</strong> at <strong>{c.adoption.toFixed(2)}×</strong>.</li>
        ))}
        {tip.top_changes.length === 0 && <li>Your top match is the same at every speed.</li>}
        {tip.always_top5.length > 0 && <li>In your top five at <em>every</em> speed: <strong>{tip.always_top5.join(", ")}</strong>.</li>}
      </ul>
      {series.length > 1 && <CurrentJobChart series={series} adoption={adoption} title={tip.current_role ?? ""} />}
    </div>
  );
}

// Your current job's outlook against AI speed, with the band edges marked.
function CurrentJobChart({ series, adoption, title }: { series: { adoption: number; current_index: number }[]; adoption: number; title: string }) {
  const W = 560, H = 170, L = 44, R = 12, T = 12, B = 28;
  const xs = (a: number) => L + ((a - 0.5) / 1.5) * (W - L - R);
  const vals = series.map((p) => p.current_index);
  const lo = Math.min(-15, ...vals) - 5, hi = Math.max(15, ...vals) + 5;
  const ys = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const path = series.map((p, i) => `${i ? "L" : "M"}${xs(p.adoption).toFixed(1)},${ys(p.current_index).toFixed(1)}`).join("");
  const here = series.reduce((best, p) => (Math.abs(p.adoption - adoption) < Math.abs(best.adoption - adoption) ? p : best), series[0]);
  return (
    <figure className="tip-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: outlook ${signed(here.current_index)}% at ${adoption.toFixed(2)} times AI speed`}>
        {[10, -10].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={ys(v)} y2={ys(v)} className="band-line" />
            <text x={W - R} y={ys(v) - 4} textAnchor="end" className="band-label">{v > 0 ? "Growing above" : "Declining below"} {signed(v)}%</text></g>
        ))}
        <line x1={L} x2={W - R} y1={ys(0)} y2={ys(0)} className="zero-line" />
        <path d={path} className="tip-line" />
        <line x1={xs(here.adoption)} x2={xs(here.adoption)} y1={T} y2={H - B} className="here-line" />
        <circle cx={xs(here.adoption)} cy={ys(here.current_index)} r={5} className="here-dot" />
        {[0.5, 1, 1.5, 2].map((a) => <text key={a} x={xs(a)} y={H - 8} textAnchor="middle" className="axis">{a}×</text>)}
        {[hi - 5, 0, lo + 5].map((v) => <text key={v} x={L - 6} y={ys(v) + 4} textAnchor="end" className="axis">{signed(Math.round(v))}%</text>)}
      </svg>
      <figcaption className="source">{title}: expected change in jobs to 2030 at each AI speed. At {adoption.toFixed(2)}×: {signed(here.current_index)}%.</figcaption>
    </figure>
  );
}

function Results({ data, onRoles }: { data: Explore; onRoles: () => void }) {
  const learning = data.added_skills.length > 0;
  return (
    <div className="card">
      <div className="card-row"><h2>Your roles {learning ? `if you learn ${data.added_skills.map((s) => s.name).join(", ")}` : `at ${data.adoption.toFixed(2)}× AI speed`}</h2>
        <button className="link" onClick={onRoles}>See them in Future roles →</button></div>
      <ol className="whatif-list">
        {data.ranking.slice(0, 8).map((r) => {
          const move = r.rank_before - r.rank;
          return (
            <li key={r.role_id}>
              <span className="rank">#{r.rank}</span>
              <span className="whatif-title">{r.title}
                {move !== 0 && <span className={`badge ${move > 0 ? "good" : "risk"}`}>{move > 0 ? `▲ ${move}` : `▼ ${-move}`}</span>}</span>
              <span className="fit whatif-fit" role="img" aria-label={`Fit ${percent(r.fit_before)} percent now${r.fit !== r.fit_before ? `, ${percent(r.fit)} percent after learning` : ""}`}>
                <span className="after" style={{ width: `${r.fit * 100}%` }} /><span className="before" style={{ width: `${r.fit_before * 100}%` }} />
              </span>
              <span className="whatif-fitnum">{percent(r.fit_before)}%{r.fit !== r.fit_before && <> → <strong>{percent(r.fit)}%</strong></>}</span>
              <span className={`badge ${OUTLOOK_TONE[r.label]}`}>{OUTLOOK_TEXT[r.label]} {signed(r.index)}%</span>
            </li>
          );
        })}
      </ol>
      {learning && <p className="muted">To make these real, learn the skills (the pathway shows courses) and tick them off, or add skills you already have on My profile.</p>}
    </div>
  );
}
