import type { Sdg } from "../lib/api";
import { sdgStyle } from "../lib/format";

// A small tile sits next to the goal's name, so it is hidden from screen readers to avoid
// reading the name twice.
export function SdgTile({ sdg, small }: { sdg: Sdg; small?: boolean }) {
  if (small) return <span className="sdg small" style={sdgStyle(sdg.colour)} aria-hidden="true">{sdg.number}</span>;
  return (
    <span className="sdg" role="img" style={sdgStyle(sdg.colour)} title={`SDG ${sdg.number} ${sdg.name}`}
      aria-label={`SDG ${sdg.number} ${sdg.name}`}>{sdg.number}</span>
  );
}

export function Sdgs({ sdgs }: { sdgs: Sdg[] }) {
  return <div className="sdgs">{sdgs.map((g) => <SdgTile key={g.number} sdg={g} />)}</div>;
}
