import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { t, tf, tr } from "../../lib/i18n";

// The hero's route, drawn once on load: the clerk demo's real plan (two courses, from the demo
// profile's pathway to AI operations specialist). Motion follows the app's rules (none with
// reduce-motion or Lite mode).
const W = 640, H = 150;
const PTS: [number, number][] = [[40, 96], [240, 46], [430, 104], [600, 62]];
const STOPS = ["Critical thinking", "Prompt engineering and AI workflow design"];

function curve(pts: [number, number][]) {
  return pts.reduce((d, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${d} C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
  }, "");
}

export function HeroRoute() {
  const end = PTS[PTS.length - 1];
  return (
    <figure className="lp-route route-map" aria-label={tf("route.aria", { n: STOPS.length, from: tr("Data entry clerk"), to: tr("AI operations specialist") })} role="img">
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <path className="route-line upcoming" d={curve(PTS)} />
        <path className="route-line travelled lp-route-draw" d={curve(PTS)} pathLength={1} />
        {PTS.slice(1, -1).map(([x, y], i) => (
          <g key={i} className="route-stop" style={{ animationDelay: `${300 + i * 200}ms` }}>
            <circle cx={x} cy={y} r={11} />
            <text x={x} y={y + 4} textAnchor="middle">{i + 1}</text>
            <text className="route-stop-label" x={x} y={y + (i % 2 ? 30 : -18)} textAnchor="middle">{tr(STOPS[i])}</text>
          </g>
        ))}
        <g className="route-start">
          <circle cx={PTS[0][0]} cy={PTS[0][1]} r={7} />
          <text className="route-here-label" x={PTS[0][0] - 8} y={PTS[0][1] + 26} textAnchor="start">{t("route.here")}: {tr("Data entry clerk")}</text>
        </g>
        <g className="route-pin" transform={`translate(${end[0]} ${end[1]})`}>
          <path d="M0 0 C -9 -12, -12 -18, -12 -24 A 12 12 0 1 1 12 -24 C 12 -18, 9 -12, 0 0 Z" />
          <circle cx={0} cy={-24} r={4.5} className="route-pin-dot" />
          <text className="route-end-label" x={14} y={-40} textAnchor="end">{tr("AI operations specialist")}</text>
        </g>
      </svg>
    </figure>
  );
}

// A live fact line: how many roles Laluan tracks and which forecast it uses, read from the API.
// A free server can be asleep, so after a short wait a fixed sentence shows instead.
export function FactLine() {
  const [facts, setFacts] = useState<{ roles: number; snapshot: string; date: string } | null>(null);
  const [asleep, setAsleep] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(() => live && setAsleep(true), 2500);
    Promise.all([api.roles(), api.health()])
      .then(([roles, health]) => { if (live) { setFacts({ roles: roles.length, snapshot: health.snapshot, date: health.snapshot_imported }); window.clearTimeout(timer); } })
      .catch(() => live && setAsleep(true));
    return () => { live = false; window.clearTimeout(timer); };
  }, []);
  return (
    <p className="lp-facts" aria-live="polite">
      <span className="lp-facts-dot" aria-hidden="true" />
      {facts ? tf("lp.factLive", { n: facts.roles, snapshot: facts.snapshot, date: facts.date })
        : asleep ? t("lp.factFixed") : " "}
    </p>
  );
}
