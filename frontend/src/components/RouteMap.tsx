import type { Pathway } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

// The career route as a stylised map: one winding line from "You are here" through a stop per
// course to the destination pin. Finished stretches are solid, the rest dashed; the solid line
// draws itself when the page opens (switched off by reduce-motion and Lite mode in CSS).
const W = 640, H = 168, PAD_X = 48;

function points(n: number): [number, number][] {
  // n + 2 points: start, one per course, destination; alternating up and down like a road.
  const count = n + 2;
  return Array.from({ length: count }, (_, i) => {
    const x = PAD_X + (i * (W - 2 * PAD_X)) / (count - 1);
    const y = i === 0 || i === count - 1 ? H / 2 : i % 2 ? H * 0.28 : H * 0.72;
    return [x, y];
  });
}

function path(pts: [number, number][]): string {
  return pts.reduce((d, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const mx = (px + x) / 2;
    return `${d} C ${mx} ${py}, ${mx} ${y}, ${x} ${y}`;
  }, "");
}

export function RouteMap({ plan, from, to, compact = false }: { plan: Pathway; from: string; to: string; compact?: boolean }) {
  const pts = points(plan.steps.length);
  const done = plan.steps.filter((s) => s.done).length;
  // You are at the last finished stop: everything before it is travelled.
  const here = done;
  const travelled = pts.slice(0, here + 1);
  const arrived = plan.steps.length > 0 && done === plan.steps.length;
  return (
    <figure className={`route-map${compact ? " compact" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tf("route.aria", { n: plan.steps.length, from, to: tr(to) })}>
        <path className="route-line upcoming" d={path(pts)} />
        {travelled.length > 1 && <path className="route-line travelled" d={path(arrived ? pts : travelled)} pathLength={1} />}
        {pts.slice(1, -1).map(([x, y], i) => {
          const step = plan.steps[i];
          return (
            <g key={step.step} className={`route-stop${step.done ? " is-done" : ""}`} style={{ animationDelay: `${150 + i * 120}ms` }}>
              <circle cx={x} cy={y} r={11} />
              <text x={x} y={y + 4} textAnchor="middle">{step.done ? "✓" : step.step}</text>
              {!compact && <text className="route-stop-label" x={x} y={y + (i % 2 ? -18 : 28)} textAnchor="middle">{tr(step.skills[0]?.name ?? "")}</text>}
            </g>
          );
        })}
        <g className="route-start">
          <circle cx={pts[0][0]} cy={pts[0][1]} r={7} />
          <text className="route-end-label" x={pts[0][0] - 10} y={pts[0][1] + 26} textAnchor="start">{from}</text>
        </g>
        <g className="route-pin" transform={`translate(${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]})`}>
          <path d="M0 0 C -9 -12, -12 -18, -12 -24 A 12 12 0 1 1 12 -24 C 12 -18, 9 -12, 0 0 Z" />
          <circle cx={0} cy={-24} r={4.5} className="route-pin-dot" />
          <text className="route-end-label" x={14} y={-42} textAnchor="end">{tr(to)}</text>
        </g>
        <g className="route-here" transform={`translate(${pts[here][0]} ${pts[here][1]})`}>
          <circle r={here === 0 ? 0 : 15} className="route-here-ring" />
          <text x={0} y={here === 0 ? -16 : -22} textAnchor="middle">{t("route.here")}</text>
        </g>
      </svg>
    </figure>
  );
}
