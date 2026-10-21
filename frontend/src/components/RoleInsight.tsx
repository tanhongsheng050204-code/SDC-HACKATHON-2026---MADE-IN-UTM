import type { Insight } from "../lib/api";
import { signed } from "../lib/format";
import { OUTLOOK_TEXT } from "../lib/labels";
import { InfoTip } from "./InfoTip";

// "Why this could work" vs "What could go wrong": two honest columns, each point with its source.
export function RoleCase({ insight }: { insight: Insight }) {
  return (
    <div className="role-case">
      <div className="card case-col pro">
        <h2>Why this could work for you</h2>
        {insight.pros.length === 0 ? <p className="muted">Nothing stands out in its favour for your profile yet.</p> : (
          <ul>{insight.pros.map((p) => <li key={p.text}><span>{p.text}</span><small className="source">{p.source}</small></li>)}</ul>
        )}
      </div>
      <div className="card case-col con">
        <h2>What could go wrong</h2>
        {insight.cons.length === 0 ? <p className="muted">No warning signs in our data for this role.</p> : (
          <ul>{insight.cons.map((p) => <li key={p.text}><span>{p.text}</span><small className="source">{p.source}</small></li>)}</ul>
        )}
      </div>
    </div>
  );
}

// Forecast x-ray: every step from the published figure to the outlook shown, as a running total.
export function ForecastXray({ xray }: { xray: Insight["xray"] }) {
  let running = 0;
  const max = Math.max(1, ...xray.steps.map((s) => Math.abs(s.value)), Math.abs(xray.result.index));
  return (
    <details className="card xray">
      <summary>How this forecast is built <InfoTip term="gl.xray" label="forecast x-ray" /></summary>
      <ol className="xray-steps">
        {xray.steps.map((s, i) => {
          running = Math.round((running + s.value) * 10) / 10;
          return (
            <li key={s.label}>
              <div className="xray-row">
                <span className="xray-label">{i === 0 ? "" : s.value >= 0 ? "+ " : "− "}{s.label}</span>
                <span className="xray-bar" aria-hidden="true">
                  <span className={s.value < 0 ? "neg" : "pos"} style={{ width: `${(Math.abs(s.value) / max) * 50}%`, [s.value < 0 ? "right" : "left"]: "50%" }} />
                </span>
                <strong className="xray-value">{i === 0 ? `${signed(s.value)}%` : `${signed(s.value)} pts`}</strong>
              </div>
              <small className="source">{s.detail}{i > 0 && ` · running total ${signed(running)}%`}</small>
            </li>
          );
        })}
        <li className="xray-total">
          <div className="xray-row"><span className="xray-label">= Outlook shown</span><span />
            <strong className="xray-value">{signed(xray.result.index)}% · {OUTLOOK_TEXT[xray.result.label]}</strong></div>
          <small className="source">{xray.result.bands}. In the ranking: {xray.ranking_points.detail} = {xray.ranking_points.points.toFixed(2)} points.</small>
        </li>
      </ol>
      <p className="source">Snapshot {xray.source.snapshot_id}, imported {xray.source.imported} · <a href={xray.source.url} target="_blank" rel="noreferrer">source</a></p>
    </details>
  );
}
