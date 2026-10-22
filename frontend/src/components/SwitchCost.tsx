import { useEffect, useState } from "react";
import { api, Pathway, Profile, RoleMatch } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

const rm = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;

// What a move costs, from sourced figures only: the DOSM pay difference between occupation groups,
// learning hours at the person's own weekly hours, course fees in RM from the catalogue, and the
// certificates Malaysian job ads ask for. No "months out of work": there is no Malaysian source.
export function SwitchCost({ profile, role }: { profile: Profile; role: RoleMatch }) {
  const [plan, setPlan] = useState<Pathway | null>(null);
  useEffect(() => {
    let live = true;
    api.pathway(profile.id, role.role_id).then((p) => { if (live) setPlan(p); }).catch(() => {});
    return () => { live = false; };
  }, [profile.id, role.role_id]);
  if (!plan || role.is_current_role) return null;
  const paid = plan.steps.filter((s) => !s.done && s.course.cost === "paid");
  const fees = paid.reduce((sum, s) => sum + (s.course.price_rm ?? 0), 0);
  const unpriced = paid.filter((s) => s.course.price_rm == null).length;
  const weekly = profile.weekly_hours ?? null;
  const weeks = weekly ? Math.ceil(plan.hours_left / weekly) : null;
  const certs = plan.requirements?.certifications ?? role.requirements?.certifications ?? [];
  const change = role.pay_change_rm;
  return (
    <div className="card switch-cost">
      <h2>{t("sw.title")}</h2>
      <p className="muted">{t("sw.sub")}</p>
      <dl className="sw-grid">
        <div>
          <dt>{t("sw.pay")}</dt>
          <dd>{change === null ? t("sw.paySame")
            : <><strong>{change >= 0 ? "+" : "−"}{rm(Math.abs(Math.round(change / 100) * 100))}</strong> {t("pay.month")}</>}</dd>
          <small>{tf("sw.paySource", { group: role.pay.group, year: role.pay.year })}</small>
        </div>
        <div>
          <dt>{t("sw.time")}</dt>
          <dd><strong>{tf("sw.hours", { h: plan.hours_left })}</strong>{weeks !== null && <> · {tf("sw.weeks", { w: weeks, h: weekly! })}</>}</dd>
          <small>{weekly ? t("sw.timeSource") : t("sw.setHours")}</small>
        </div>
        <div>
          <dt>{t("sw.fees")}</dt>
          <dd><strong>{rm(fees)}</strong>{unpriced > 0 && <> · {tf("sw.unpriced", { n: unpriced })}</>}</dd>
          <small>{t("sw.feesSource")}</small>
        </div>
      </dl>
      {certs.length > 0 && (
        <p><strong>{t("sw.certs")}</strong> {certs.slice(0, 4).map((c) => `${tr(c.name)} (${tf("sw.ads", { n: c.ads })})`).join(" · ")}</p>
      )}
      <p className="source">{t("sw.notCounted")}</p>
    </div>
  );
}
