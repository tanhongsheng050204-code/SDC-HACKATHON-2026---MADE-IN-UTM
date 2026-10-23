import type { Pathway, RoleMatch } from "../lib/api";
import { AiBadge } from "./AiBadge";
import { COST, HRD, priceText } from "../lib/labels";
import { getLang, t, tf, tr, tv, type StringKey } from "../lib/i18n";

// The detail behind one pathway step (course, price, HRD Corp, certificate, free alternatives) and
// the plan's own summary and sources. The step list itself lives on the Pathway screen.
const LANG_NAME: Record<string, string> = { ms: "Bahasa Malaysia", en: "English", zh: "中文", ta: "தமிழ்" };
const duration = (h: number) => (h < 1 ? `${Math.round(h * 60)} min` : tf("pl.hours", { h }));
type Step = Pathway["steps"][number];

// A provider's own certificate, when the dated price note says the course offers one (never guessed).
export function hasCertificate(note?: string | null) {
  return !!note && /certificate/i.test(note) && !/no certificate/i.test(note);
}

export function StepCourse({ step, role }: { step: Step; role: RoleMatch }) {
  const c = step.course;
  return (
    <div className="step-course">
      <p><strong>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{tr(c.title)} ↗</a> : tr(c.title)}</strong><br />
        <span className="muted">{c.provider} · {tf("pl.hours", { h: c.hours })} · {t(`lvl.${c.level}` as StringKey)}</span></p>
      <p className="step-badges">
        <span className={`badge ${COST[c.cost]?.tone ?? ""}`}>{c.cost === "paid" ? priceText(c.price_rm, c.cost) : COST[c.cost]?.label ?? c.cost}</span>
        {c.hrd_corp && HRD[c.hrd_corp] && <span className={`badge ${HRD[c.hrd_corp]!.tone}`} title={c.hrd_note}>{HRD[c.hrd_corp]!.label}</span>}
      </p>
      {hasCertificate(c.price_note) && <p className="cert-line">🎓 {tf("cert.fromCourse", { provider: c.provider })}</p>}
      <p className="muted">{tv(`why.${step.why_key}`, { role: role.title }, step.why)}</p>
      {step.alternatives && step.alternatives.length > 0 && (
        <div className="alt-courses">
          <strong>{t("alt.title")}</strong>
          <ul>{step.alternatives.map((a) => (
            <li key={a.id}><a href={a.url} target="_blank" rel="noreferrer">{a.title} ↗</a> · {a.provider} · {duration(a.hours)} · {t("alt.free")}
              {a.languages && <span className="muted"> · {a.languages.map((l) => LANG_NAME[l] ?? l).join(", ")}</span>}</li>
          ))}</ul>
          <span className="source">{t("alt.note")}</span>
        </div>
      )}
      <details className="step-sources">
        <summary>{t("pw.priceSources")}</summary>
        <p className="source">{t("pl.catalogue")} · {c.url ? (c.checked ? tf("pl.checked", { date: c.checked }) : t("pl.notChecked")) : t("pl.noPage")}</p>
        {c.price_note && <p className="source">{c.price_note}{c.hrd_note ? ` ${c.hrd_note}` : ""}{c.price_checked ? ` ${tf("pl.priceChecked", { date: c.price_checked })}` : ""}</p>}
        {c.cost === "paid" && <p className="source">{t("pl.priceWarn")}</p>}
      </details>
    </div>
  );
}

/** "About this plan": the written summary (with its AI and grounding notes), uncovered skills and dates. */
export function PlanAbout({ plan, role, freeOnly }: { plan: Pathway; role: RoleMatch; freeOnly?: boolean }) {
  const uncovered = plan.uncovered_skills.map((id) => [...role.covered, ...role.missing].find((m) => m.skill_id === id)?.name ?? id);
  const checked = Array.from(new Set(plan.steps.map((s) => s.course.checked).filter(Boolean)));
  return (
    <div className="plan-about">
      <p>{plan.summary_template && getLang() !== "en" ? tv(`ps.${plan.summary_template.key}`, plan.summary_template.vars, plan.summary) : plan.summary}</p>
      <AiBadge mode={plan.summary_mode} grounded={plan.grounding?.all_supported ?? true} />
      {plan.grounding && (
        <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
          {plan.grounding.all_supported ? t("pl.grounded") : tf("pl.ungrounded", { list: plan.grounding.unsupported.join(", ") })}
        </p>
      )}
      {uncovered.length > 0 && (
        <p className="muted">{freeOnly
          ? uncovered.map((n, i) => <span key={i}>{i > 0 && ", "}{tr(n)} <span className="badge">{t("path.noFreeRoute")}</span></span>)
          : tf("pl.uncovered", { list: uncovered.map((n) => tr(n)).join(", ") })}</p>
      )}
      <p className="source">{t("path.etaSource")} {checked.map((date) => tf("pl.checked", { date: date! })).join(" · ")}</p>
    </div>
  );
}
