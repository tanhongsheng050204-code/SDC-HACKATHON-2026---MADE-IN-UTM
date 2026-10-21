import { t } from "../lib/i18n";
import type { Pathway, RoleMatch } from "../lib/api";
import { percent } from "../lib/format";
import { COST, HRD, priceText } from "../lib/labels";

// The pathway as an ordered list: courses, hours, cost and HRD Corp status, for budgeting and print.
export function PathwayList({ plan, role, onToggle }: { plan: Pathway; role: RoleMatch; onToggle: (courseId: string, done: boolean) => void }) {
  const done = plan.steps.filter((s) => s.done);
  const uncovered = plan.uncovered_skills.map((id) => role.missing.find((m) => m.skill_id === id)?.name ?? id);
  return (
    <>
      <div className="readiness card">
        <div className="card-row"><h3>Readiness for {role.title}</h3><strong className="readiness-num">{percent(plan.readiness)}%</strong></div>
        <div className="fit" role="img" aria-label={`${t("card.readiness")} ${percent(plan.readiness)}%`}><div style={{ width: `${plan.readiness * 100}%` }} /></div>
        <p className="muted">Started at {percent(plan.fit)}% · {done.length} of {plan.steps.length} steps done · about {plan.hours_left} hours left</p>
        {done.length > 0 && (
          <div className="chips">{done.flatMap((s) => s.skills).map((k) => <span key={k.skill_id} className="badge gold">★ {k.name}</span>)}</div>
        )}
      </div>
      <h3>Your pathway: {plan.steps.length} steps, about {plan.total_hours} hours</h3>
      <p>{plan.summary}</p>
      {plan.grounding && (
        <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
          {plan.grounding.all_supported ? t("path.grounded") : `${t("coach.check")} ${plan.grounding.unsupported.join(", ")}: ${t("path.notIn")}`}
        </p>
      )}
      {uncovered.length > 0 && (
        <p className="muted">No course in our catalogue teaches {uncovered.join(", ")} yet. Ask a counsellor or your employer about on-the-job training.</p>
      )}
      <ol className="steps">
        {plan.steps.map((s) => {
          const c = s.course;
          return (
            <li key={s.step} className={s.done ? "card is-done" : "card"}>
              <div className="card-row"><strong>{s.skills.map((k) => k.name).join(", ")}</strong>
                <span className="step-badges">
                  <span className={`badge ${COST[c.cost]?.tone ?? ""}`}>{c.cost === "paid" ? priceText(c.price_rm, c.cost) : COST[c.cost]?.label ?? c.cost}</span>
                  {c.hrd_corp && HRD[c.hrd_corp] && <span className={`badge ${HRD[c.hrd_corp].tone}`} title={c.hrd_note}>{HRD[c.hrd_corp].label}</span>}
                </span></div>
              <span>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> : c.title} · {c.provider}</span>
              <span className="muted">About {c.hours} hours · {c.level} · {s.why}</span>
              <span className="source">From the Laluan course catalogue · {c.url ? (c.checked ? `link checked ${c.checked}` : "link not yet checked") : "no single course page: search the provider"}</span>
              {c.price_note && <span className="source">{c.price_note}{c.hrd_note ? ` ${c.hrd_note}` : ""}{c.price_checked ? ` Price checked ${c.price_checked}.` : ""}</span>}
              {c.cost === "paid" && <span className="source">{t("path.prices")}</span>}
              <label className="check"><input type="checkbox" checked={s.done} onChange={(e) => onToggle(c.id, e.target.checked)} /> {t("path.finished")}</label>
            </li>
          );
        })}
      </ol>
    </>
  );
}
