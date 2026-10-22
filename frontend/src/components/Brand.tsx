// Laluan's mascot, drawn for Laluan: a girl with a brown bob and a blue top. Her head on a mint
// tile is the logo; WalkingGirl is the same girl in full, who walks the route on the landing page.
const HAIR = "#9A5B36", LINE = "#4A2C1A", SKIN = "#FCDCC4", TOP = "#3B82C4", TOP_DARK = "#2C6AA6";

function GirlHead() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M14 36C11 19 21 9 32 9s21 10 18 27v11c0 4-4 5-6 3V37H20v13c-2 2-6 1-6-3z" fill={HAIR} stroke={LINE} strokeWidth="1.6" />
      <circle cx="18.5" cy="34" r="3" fill={SKIN} stroke={LINE} strokeWidth="1.3" />
      <circle cx="45.5" cy="34" r="3" fill={SKIN} stroke={LINE} strokeWidth="1.3" />
      <ellipse cx="32" cy="33" rx="13.5" ry="13" fill={SKIN} stroke={LINE} strokeWidth="1.6" />
      <path d="M18.5 31C18 19 25 14 32 14c8 0 14.5 5 13.5 17-3.5-4.5-8-7.5-12.5-8.5-3.5 4-8.5 7-14.5 8.5z" fill={HAIR} stroke={LINE} strokeWidth="1.6" />
      <ellipse cx="26.5" cy="34.5" rx="2.4" ry="3" fill="#2B1B12" />
      <ellipse cx="37.5" cy="34.5" rx="2.4" ry="3" fill="#2B1B12" />
      <circle cx="27.3" cy="33.4" r=".9" fill="#fff" />
      <circle cx="38.3" cy="33.4" r=".9" fill="#fff" />
      <ellipse cx="22.5" cy="39" rx="2.3" ry="1.4" fill="#F4A7A0" opacity=".75" />
      <ellipse cx="41.5" cy="39" rx="2.3" ry="1.4" fill="#F4A7A0" opacity=".75" />
      <path d="M29 39.5q3 3 6 0" fill="none" stroke={LINE} strokeWidth="1.5" />
    </g>
  );
}

/** The logo: the girl's head and collar on a mint tile. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="#DDF0E8" />
      <path d="M13 64c0-9 8-14.5 19-14.5S51 55 51 64z" fill={TOP} stroke={LINE} strokeWidth="1.6" />
      <path d="M26 50.5l6 4.5 6-4.5-2.5-1.5h-7z" fill="#fff" stroke={LINE} strokeWidth="1.2" strokeLinejoin="round" />
      <g transform="translate(0 -3)"><GirlHead /></g>
    </svg>
  );
}

/** The girl in full, walking: legs and arms swing (CSS .walker, off with reduce motion / Lite). */
export function WalkingGirl({ width = 44 }: { width?: number }) {
  return (
    <svg className="walker" width={width} height={width * 1.65} viewBox="0 14 40 66" fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="20" cy="78.5" rx="9" ry="1.5" fill="#10241F" opacity=".18" />
      <g className="walker-body" strokeLinejoin="round" strokeLinecap="round">
        <g className="walker-leg back"><rect x="16.5" y="54" width="5" height="18" rx="2.5" fill="#33405C" stroke={LINE} strokeWidth="1.2" /><ellipse cx="19" cy="73" rx="4" ry="2.4" fill="#5C3A24" stroke={LINE} strokeWidth="1.1" /></g>
        <g className="walker-leg front"><rect x="18.5" y="54" width="5" height="18" rx="2.5" fill="#3E4A6B" stroke={LINE} strokeWidth="1.2" /><ellipse cx="21" cy="73" rx="4" ry="2.4" fill="#6B4430" stroke={LINE} strokeWidth="1.1" /></g>
        <g className="walker-arm back"><rect x="9" y="40" width="4.5" height="14" rx="2.2" fill={TOP_DARK} stroke={LINE} strokeWidth="1.1" /><circle cx="11.2" cy="55" r="2.3" fill={SKIN} stroke={LINE} strokeWidth="1" /></g>
        <path d="M10.5 58c0-11 3.5-19 9.5-19s9.5 8 9.5 19z" fill={TOP} stroke={LINE} strokeWidth="1.3" />
        <path d="M16.5 39.5l3.5 3 3.5-3-1.5-1h-4z" fill="#fff" stroke={LINE} strokeWidth="1" />
        <g className="walker-arm front"><rect x="26.5" y="40" width="4.5" height="14" rx="2.2" fill={TOP} stroke={LINE} strokeWidth="1.1" /><circle cx="28.8" cy="55" r="2.3" fill={SKIN} stroke={LINE} strokeWidth="1" /></g>
        <g transform="translate(1.5 12.5) scale(.58)"><GirlHead /></g>
      </g>
    </svg>
  );
}

function rosette(R: number, r: number, d: number, steps = 1200): string {
  // Hypotrochoid: a point at distance d from the centre of a circle of radius r rolling inside
  // a circle of radius R. Integer ratios close the curve.
  const turns = r / gcd(R, r);
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const k = (R - r) / r;
    const x = (R - r) * Math.cos(t) + d * Math.cos(k * t);
    const y = (R - r) * Math.sin(t) - d * Math.sin(k * t);
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return "M" + points.join("L") + "Z";
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

const CURVES = [rosette(180, 48, 92), rosette(150, 35, 70), rosette(210, 66, 120)];

/** Fine-line rosette behind the hero. Decorative only. */
export function Rosette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-260 -260 520 520" aria-hidden="true" focusable="false">
      {CURVES.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth={0.6} opacity={0.55 - i * 0.12} />
      ))}
    </svg>
  );
}
