import type { RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { t } from "../lib/i18n";
import { PayLine } from "./PayLine";
import { Sdgs } from "./Sdgs";

export function RoleCard({ role, scenario, onOpen }: { role: RoleMatch; scenario: Scenario; onOpen: () => void }) {
  const o = role.outlook[scenario];
  // With "What if I learn...?" on, show how far the tried skills move this role; otherwise vs baseline.
  const move = role.rank_without_extra !== undefined ? role.rank_without_extra - role.rank : role.rank_change_vs_baseline;
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
      <PayLine pay={role.pay} change={role.pay_change_rm} compact />
      <p className="muted">Estimate to {role.estimate_range.year}: {signed(role.estimate_range.low)}% to {signed(role.estimate_range.high)}% jobs across scenarios</p>
      {role.why.matched_preferences.length > 0 && <span className="badge good">{t("survey.fits")} {role.why.matched_preferences.map((m) => m.label).join(", ")}</span>}
      {role.carry_over.length > 0 && <span className="muted carry">{t("lead.bring")}: {role.carry_over.map((s) => s.name).join(", ")}</span>}
      {role.why.entry_points > 0 && <span className="badge gold">{t("lead.openToGrads")}</span>}
      <Sdgs sdgs={role.sdgs} />
      <span className="source">Source: {role.citation.snapshot_id} (imported {role.citation.imported})</span>
    </button>
  );
}
