import type { RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { Sdgs } from "./Sdgs";

export function RoleCard({ role, scenario, onOpen }: { role: RoleMatch; scenario: Scenario; onOpen: () => void }) {
  const o = role.outlook[scenario];
  const move = role.rank_change_vs_baseline;
  return (
    <button className={role.at_risk ? "card at-risk" : "card"} onClick={onOpen}>
      <div className="card-head">
        <span className="rank">#{role.rank}{move > 0 ? ` ▲${move}` : move < 0 ? ` ▼${-move}` : ""}</span>
        {role.robust_pick && <span className="badge gold">Robust pick</span>}
        {role.is_current_role && <span className="badge">Your current role</span>}
      </div>
      <h2>{role.title}</h2>
      <div className="fit" role="img" aria-label={`Fit ${percent(role.fit)} percent`}>
        <div style={{ width: `${role.fit * 100}%` }} />
      </div>
      <div className="card-row">
        <span className="fit-num">{percent(role.fit)}% fit</span>
        <span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span>
      </div>
      <p className="muted">Estimate to {role.estimate_range.year}: {signed(role.estimate_range.low)}% to {signed(role.estimate_range.high)}% jobs across scenarios</p>
      {role.why.sdg_points > 0 && <span className="badge good">Serves your goals: SDG {role.why.matched_sdgs.join(", ")}</span>}
      <Sdgs sdgs={role.sdgs} />
      <span className="source">Source: {role.citation.snapshot_id} (imported {role.citation.imported})</span>
    </button>
  );
}
