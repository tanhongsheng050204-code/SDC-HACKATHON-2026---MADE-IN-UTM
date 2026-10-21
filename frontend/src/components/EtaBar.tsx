import type { Pathway, RoleMatch } from "../lib/api";
import { percent } from "../lib/format";
import { t, tf } from "../lib/i18n";

// What is left on a route. Readiness after the plan is 100% only when every missing skill has a
// course; otherwise it is the share of the role's skill weight the plan reaches. The RM total adds
// known prices only and counts the paid courses whose price is still to confirm.
export function etaFacts(plan: Pathway, role: RoleMatch) {
  const left = plan.steps.filter((s) => !s.done);
  const paid = left.filter((s) => s.course.cost === "paid");
  const known = paid.reduce((sum, s) => sum + (s.course.price_rm ?? 0), 0);
  const unknown = paid.filter((s) => s.course.price_rm == null).length;
  const total = [...role.covered, ...role.missing].reduce((w, s) => w + s.weight, 0) || 1;
  const reachable = total - role.missing.filter((m) => plan.uncovered_skills.includes(m.skill_id)).reduce((w, s) => w + s.weight, 0);
  const after = plan.uncovered_skills.length === 0 ? 1 : reachable / total;
  const rm = unknown ? tf("route.rmPlus", { n: known.toLocaleString("en-MY"), k: unknown }) : tf("route.rm", { n: known.toLocaleString("en-MY") });
  return { left: left.length, hours: plan.hours_left, rm, now: plan.readiness, after, arrived: left.length === 0 && plan.steps.length > 0 };
}

// The sticky bar on Pathway (refreshed after every tick, hidden when printing), or a plain line
// inside a card when `inline`.
export function EtaBar({ plan, role, inline = false }: { plan: Pathway; role: RoleMatch; inline?: boolean }) {
  const e = etaFacts(plan, role);
  return (
    <div className={inline ? "eta-line" : "eta-bar"} role={inline ? undefined : "status"}>
      <span className="eta-title">{t("route.eta")}</span>
      <strong>{tf("route.hoursLeft", { h: e.hours })}</strong>
      <span>{e.rm}</span>
      <span>{tf("route.stops", { n: e.left })}</span>
      <span>{tf("route.readiness", { now: percent(e.now), after: percent(e.after) })}</span>
      {e.arrived && <span className="badge good">{t("route.arrived")}</span>}
    </div>
  );
}
