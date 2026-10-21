import type { Pathway, RoleMatch } from "../lib/api";
import { confetti } from "../lib/confetti";
import { Icon, IconName } from "./Icon";
import { percent } from "../lib/format";
import { COST, HRD, priceText } from "../lib/labels";
import { getLang, t, tf, tr, tv, type StringKey } from "../lib/i18n";

// The pathway as an ordered list: courses, hours, cost and HRD Corp status, for budgeting and print.
// Readiness itself is the bar at the top of the pathway screen; this adds where you started and what is done.
export function PathwayList({ plan, role, onToggle }: { plan: Pathway; role: RoleMatch; onToggle: (courseId: string, done: boolean) => void }) {
  const done = plan.steps.filter((s) => s.done);
  const uncovered = plan.uncovered_skills.map((id) => role.missing.find((m) => m.skill_id === id)?.name ?? id);
  return (
    <>
      <p className="muted">{tf("pl.started", { n: percent(plan.fit), done: done.length, total: plan.steps.length })}</p>
      {done.length > 0 && (
        <div className="chips">{done.flatMap((s) => s.skills).map((k) => <span key={k.skill_id} className="badge gold">★ {tr(k.name)}</span>)}</div>
      )}
      <h3>{tf("pl.title", { n: plan.steps.length, h: plan.total_hours })}</h3>
      <p>{plan.summary_template && getLang() !== "en" ? tv(`ps.${plan.summary_template.key}`, plan.summary_template.vars, plan.summary) : plan.summary}</p>
      {plan.grounding && (
        <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
          {plan.grounding.all_supported ? t("pl.grounded") : tf("pl.ungrounded", { list: plan.grounding.unsupported.join(", ") })}
        </p>
      )}
      {uncovered.length > 0 && (plan.free_only
        ? <p className="banner warning">{tf("route.noFree", { list: uncovered.map((n) => tr(n)).join(", ") })}</p>
        : <p className="muted">{tf("pl.uncovered", { list: uncovered.map((n) => tr(n)).join(", ") })}</p>)}
      <ol className="steps turn-by-turn">
        {plan.steps.map((s, i) => {
          const c = s.course;
          const move: IconName = i === 0 ? "go-straight" : i === plan.steps.length - 1 ? "flag" : i % 2 ? "turn-right" : "turn-left";
          return (
            <li key={s.step} className={s.done ? "card is-done" : "card"}>
              <span className="manoeuvre" aria-hidden="true"><Icon name={s.done ? "check" : move} /><b>{s.step}</b></span>
              <div className="card-row"><strong>{s.skills.map((k) => tr(k.name)).join(", ")}</strong>
                <span className="step-badges">
                  <span className={`badge ${COST[c.cost]?.tone ?? ""}`}>{c.cost === "paid" ? priceText(c.price_rm, c.cost) : COST[c.cost]?.label ?? c.cost}</span>
                  {c.hrd_corp && HRD[c.hrd_corp] && <span className={`badge ${HRD[c.hrd_corp]!.tone}`} title={c.hrd_note}>{HRD[c.hrd_corp]!.label}</span>}
                </span></div>
              <span>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{tr(c.title)}</a> : c.title} · {c.provider}</span>
              <span className="muted">{tf("pl.hours", { h: c.hours })} · {t(`lvl.${c.level}` as StringKey)} · {tv(`why.${s.why_key}`, { role: role.title }, s.why)}</span>
              <span className="source">{t("pl.catalogue")} · {c.url ? (c.checked ? tf("pl.checked", { date: c.checked }) : t("pl.notChecked")) : t("pl.noPage")}</span>
              {c.price_note && <span className="source">{c.price_note}{c.hrd_note ? ` ${c.hrd_note}` : ""}{c.price_checked ? ` ${tf("pl.priceChecked", { date: c.price_checked })}` : ""}</span>}
              {c.cost === "paid" && <span className="source">{t("pl.priceWarn")}</span>}
              <label className="check"><input type="checkbox" checked={s.done} onChange={(e) => { if (e.target.checked) confetti(e.currentTarget); onToggle(c.id, e.target.checked); }} /> {t("pl.finished")}</label>
            </li>
          );
        })}
      </ol>
    </>
  );
}
