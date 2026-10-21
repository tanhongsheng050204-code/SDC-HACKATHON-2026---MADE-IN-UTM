import { useId } from "react";
import type { Pathway } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

// Each segment belongs to its own course, including completions out of order.
export function RouteMap({ plan, title }: { plan: Pathway; title: string }) {
  const id = useId().replace(/:/g, "");
  const points = [{ x: 100, y: 28 }, ...plan.steps.map((_, i) => ({
    x: i % 2 ? 140 : 60, y: 92 + i * 64,
  })), { x: 100, y: 92 + plan.steps.length * 64 }];
  const segments = points.slice(1).map((p, i) => {
    const prev = points[i], middle = (prev.y + p.y) / 2;
    return `M${prev.x} ${prev.y} C${prev.x} ${middle} ${p.x} ${middle} ${p.x} ${p.y}`;
  });
  const height = points[points.length - 1].y + 28;
  const complete = plan.steps.every(s => s.done) && !plan.uncovered_skills.length;
  return (
    <figure className="route-map">
      <figcaption><span className="eyebrow">{t("path.yourRoute")}</span><h2>{tr(title)}</h2></figcaption>
      <p className="route-origin">● {t("path.youAreHere")}</p>
      <svg viewBox={`0 0 200 ${height}`} role="img" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>{tf("path.mapDescription", { n: plan.steps.length, done: plan.steps.filter(s => s.done).length, role: tr(title) })}</title>
        <defs><mask id={`${id}-draw`}>
          <path d={segments.join(" ")} pathLength="1" className="route-reveal" fill="none" stroke="white" strokeWidth="12" />
        </mask></defs>
        <g mask={`url(#${id}-draw)`}>
          {segments.map((d, i) => <path key={i} d={d} className={`route-segment ${i < plan.steps.length ? plan.steps[i].done ? "done" : "" : complete ? "done" : ""}`} />)}
        </g>
        <circle cx="100" cy="28" r="7" fill="var(--ink)" />
        {plan.steps.map((step, i) => <g key={step.course.id} className={`route-stop ${step.done ? "done" : ""}`} style={{ animationDelay: `${(i + 1) / (plan.steps.length + 1) * 550}ms` }}>
          <title>{tf("path.stopLabel", { n: i + 1, course: tr(step.course.title) })}{step.done ? ` · ${t("pl.finished")}` : ""}</title>
          <circle cx={points[i + 1].x} cy={points[i + 1].y} r="15" />
          <text x={points[i + 1].x} y={points[i + 1].y + 5} textAnchor="middle">{step.done ? "✓" : i + 1}</text>
        </g>)}
        <path transform={`translate(100 ${points[points.length - 1].y})`} d="M0 10C-4 5-12-2-12-9a12 12 0 0 1 24 0C12-2 4 5 0 10ZM0-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" fill="var(--gold-bright)" fillRule="evenodd" />
      </svg>
      <p className="route-destination">{t("path.destination")}<strong>{tr(title)}</strong></p>
      <p className="source">{t("path.mapKey")}</p>
    </figure>
  );
}
