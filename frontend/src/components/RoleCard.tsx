import type { RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { pick, t, tf, tr } from "../lib/i18n";
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
        {role.robust_pick && <span className="badge gold">{t("card.robust")}</span>}
        {role.is_current_role && <span className="badge">{t("card.current")}</span>}
        {role.long_shot && <span className="badge risk" title={t("card.longShotHelp")}>{t("card.longShot")}</span>}
        {role.being_checked && <span className="badge" title={t("card.newRoleHelp")}>{t("card.newRole")}</span>}
      </div>
      <h2>{tr(role.title)}</h2>
      <div className="fit" role="img" aria-label={tf("card.fitAria", { n: percent(role.fit) })}>
        <div style={{ width: `${role.fit * 100}%` }} />
      </div>
      <div className="card-row">
        <span className="fit-num">{tf("card.fit", { n: percent(role.fit) })}</span>
        <span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span>
      </div>
      <PayLine pay={role.pay} change={role.pay_change_rm} compact />
      <p className="muted">{tf("card.estimate", { year: role.estimate_range.year, low: signed(role.estimate_range.low), high: signed(role.estimate_range.high) })}</p>
      {role.why.matched_preferences.length > 0 && <span className="badge good">{t("survey.fits")} {role.why.matched_preferences.map((m) => pick(m.labels, m.label)).join(", ")}</span>}
      {role.carry_over.length > 0 && <span className="muted carry">{t("lead.bring")}: {role.carry_over.map((s) => tr(s.name)).join(", ")}</span>}
      {role.why.entry_points > 0 && <span className="badge gold">{t("lead.openToGrads")}</span>}
      {role.long_shot && role.stepping_stone && <span className="muted">{tf("card.startWith", { role: tr(role.stepping_stone.title) })}</span>}
      {role.plan_hours !== undefined && role.plan_hours > 0 && <span className="muted">{tf("card.planHours", { h: role.plan_hours })}</span>}
      <Sdgs sdgs={role.sdgs} />
      <span className="source">{tf("card.source", { id: role.citation.snapshot_id, date: role.citation.imported })}</span>
    </button>
  );
}
