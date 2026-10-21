import type { Sdg } from "../lib/api";
import { sdgStyle } from "../lib/format";
import { getLang, t, tr } from "../lib/i18n";

/** The reason a role or skill serves a goal, in the chosen language (English if not translated). */
export const sdgReason = (g: Sdg) => g.reasons?.[getLang()] || g.reason || "";

// A small tile sits next to the goal's name, so it is hidden from screen readers to avoid
// reading the name twice.
export function SdgTile({ sdg, small }: { sdg: Sdg; small?: boolean }) {
  if (small) return <span className="sdg small" style={sdgStyle(sdg.colour)} aria-hidden="true">{sdg.number}</span>;
  return (
    <span className="sdg" role="img" style={sdgStyle(sdg.colour)} title={`SDG ${sdg.number} ${tr(sdg.name)}`}
      aria-label={`SDG ${sdg.number} ${tr(sdg.name)}`}>{sdg.number}</span>
  );
}

// Each goal with its reason: on the role page and in a passed proof check.
export function SdgReasons({ sdgs, title }: { sdgs: Sdg[]; title: string }) {
  if (sdgs.length === 0) return null;
  return (
    <div className="sdg-reasons">
      <h2>{title}</h2>
      <ul>
        {sdgs.map((g) => (
          <li key={`${g.number}-${g.target ?? ""}`} className="skill-sdg">
            <SdgTile sdg={g} small />
            <span><strong>SDG {g.number} · {tr(g.name)}</strong>{g.target && <span className="muted"> ({t("sdg.target")} {g.target})</span>}<br />{sdgReason(g)}</span>
          </li>
        ))}
      </ul>
      {getLang() !== "en" && <p className="source">{t("sdg.aiDrafted")}</p>}
    </div>
  );
}

export function Sdgs({ sdgs }: { sdgs: Sdg[] }) {
  return <div className="sdgs">{sdgs.map((g) => <SdgTile key={g.number} sdg={g} />)}</div>;
}
