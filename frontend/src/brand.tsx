/** Laluan's mark: a winding path ("laluan") on a teal tile, ending in a waypoint. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M16 50c0-10 14-9 14-19s-10-9-10-16" stroke="#F3F6F4" strokeWidth="5" strokeLinecap="round" />
      <path d="M30 31c4-6 12-6 18-11" stroke="var(--gold-bright)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="48" cy="20" r="5.5" fill="#F3F6F4" />
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
