import { useEffect, useState } from "react";
import { api, ExposureMap as MapData, Matches, RoleMatch, Scenario } from "../lib/api";
import { signed } from "../lib/format";
import { t } from "../lib/i18n";

// Every role as a point: published AI exposure (mean percentile across studies, with its range as
// a line) against the outlook in the chosen scenario and year. Your top five are highlighted.
const W = 760, H = 400, PAD = { l: 56, r: 250, t: 20, b: 48 };
const LINE = 14; // label height: labels in the right-hand column are pushed apart by at least this

export function ExposureMap({ data, scenario, onOpen }: { data: Matches; scenario: Scenario; onOpen: (r: RoleMatch) => void }) {
  const [map, setMap] = useState<MapData | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.exposureMap(scenario).then(setMap).catch(() => setError(true)); }, [scenario]);
  if (error) return <p className="error" role="alert">{t("map.failed")}</p>;
  if (!map) return <p className="muted">{t("map.loading")}</p>;

  const top = new Set(data.roles.slice(0, 5).map((r) => r.role_id));
  const points = map.points.flatMap((p) => {
    const role = data.roles.find((r) => r.role_id === p.role_id);
    return role ? [{ ...p, role, y: role.outlook[scenario].index }] : [];
  });
  const ys = points.map((p) => p.y);
  const yMin = Math.floor(Math.min(0, ...ys) / 10) * 10 - 10, yMax = Math.ceil(Math.max(...ys) / 10) * 10 + 10;
  const x = (v: number) => PAD.l + (v / 100) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((yMax - v) / (yMax - yMin)) * (H - PAD.t - PAD.b);
  // Labels sit in a column to the right of the plot, at their point's height, nudged apart so they
  // never overlap, each joined to its point by a thin leader line.
  const labelX = W - PAD.r + 14;
  const placed = points.map((p) => ({ ...p, ly: y(p.y) + 4 })).sort((a, b) => a.ly - b.ly);
  placed.forEach((p, i) => { if (i > 0 && p.ly - placed[i - 1].ly < LINE) p.ly = placed[i - 1].ly + LINE; });
  const ticks = Array.from({ length: (yMax - yMin) / 10 + 1 }, (_, i) => yMin + i * 10).filter((v) => v % 20 === 0);

  return (
    <div className="card exp-map">
      <h2>{t("map.title")}</h2>
      <p className="muted">{t("map.sub")}</p>
      <div className="exp-map-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="map-desc">
        <desc id="map-desc">{t("map.desc")}</desc>
        <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />
        {ticks.map((v) => <text key={v} className="tick" x={PAD.l - 8} y={y(v) + 4} textAnchor="end">{signed(v)}%</text>)}
        {[0, 25, 50, 75, 100].map((v) => <text key={v} className="tick" x={x(v)} y={H - PAD.b + 18} textAnchor="middle">{v}%</text>)}
        <text className="axis-label" x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle">{t("map.x")}</text>
        <text className="axis-label" transform={`translate(14 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle">{t("map.y")} {map.horizon_year}</text>
        <text className="quadrant" x={PAD.l + 8} y={PAD.t + 12}>{t("map.safe")}</text>
        {placed.map((p) => (
          <g key={p.role_id} className={`pt ${top.has(p.role_id) ? "is-top" : ""}`} tabIndex={0} role="button"
            aria-label={`${p.title}: ${t("map.x")} ${p.exposure.mean}%, ${signed(p.y)}%`}
            onClick={() => onOpen(p.role)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(p.role); }}>
            <title>{`${p.title}\n${t("exp.moreThan")} ${Math.round(p.exposure.low)}–${Math.round(p.exposure.high)}% ${t("exp.ofOccupations")}\n${signed(p.y)}%`}</title>
            <line className="range" x1={x(p.exposure.low)} x2={x(p.exposure.high)} y1={y(p.y)} y2={y(p.y)} />
            <circle cx={x(p.exposure.mean)} cy={y(p.y)} r={top.has(p.role_id) ? 7 : 5} />
            <polyline className="leader" points={`${x(p.exposure.high) + 4},${y(p.y)} ${labelX - 10},${y(p.y)} ${labelX - 4},${p.ly - 4}`} />
            <text className="pt-label" x={labelX} y={p.ly}>{p.flag ? "! " : ""}{p.title}</text>
          </g>
        ))}
      </svg>
      </div>
      <p className="source">{t("map.legend")} {map.missing.length > 0 && `${t("map.missing")} ${map.missing.map((m) => m.title).join(", ")}.`} {t("map.sources")} {map.sources.join(" · ")}.</p>
    </div>
  );
}
