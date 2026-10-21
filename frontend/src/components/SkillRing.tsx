// A ring that fills in thirds: Basic, Working, Advanced. Green once complete.
export function SkillRing({ level, size = 48 }: { level: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const filled = (Math.max(0, Math.min(3, level)) / 3) * c;
  const mid = size / 2;
  const marks = [0, 1, 2].map((i) => {
    const angle = (i / 3) * 2 * Math.PI - Math.PI / 2;
    return { x1: mid + (r - 4) * Math.cos(angle), y1: mid + (r - 4) * Math.sin(angle),
             x2: mid + (r + 4) * Math.cos(angle), y2: mid + (r + 4) * Math.sin(angle) };
  });
  return (
    <svg className="skill-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="ring-track" cx={mid} cy={mid} r={r} />
      {level > 0 && (
        <circle className={level >= 3 ? "ring-fill done" : "ring-fill"} cx={mid} cy={mid} r={r}
          strokeDasharray={`${filled} ${c}`} transform={`rotate(-90 ${mid} ${mid})`} />
      )}
      {marks.map((m, i) => <line key={i} className="ring-mark" {...m} />)}
    </svg>
  );
}
