import { useEffect, useState } from "react";
import { AiAssisted as AiAssistedData, api, Pathway, Profile } from "../lib/api";
import { percent, signed } from "../lib/format";
import { getLang, t, tf, tr, type StringKey } from "../lib/i18n";
import { COST, OUTLOOK_TEXT, OUTLOOK_TONE, priceText } from "../lib/labels";
import { StudyCalendar } from "./StudyCalendar";

const CHANGE_ORDER = ["check", "faster", "yours"] as const;
const SHARE_KEY = { check: "automate", faster: "assist", yours: "human" } as const;

// Option A for someone with a job: the same role, AI-assisted. Never ranked and with no forecast of
// its own (none is published); it shows the current job's outlook, what changes in each task, the AI
// skills to add and a short plan that counts everything the person already knows.
export function AiAssisted({ profile, outlook }: { profile: Profile; outlook?: { index: number; label: string } }) {
  const [data, setData] = useState<AiAssistedData | null>(null);
  useEffect(() => { api.aiAssisted(profile.id).then(setData).catch(() => setData(null)); },
    [profile.id, profile.current_role_id, profile.skills.length, profile.completed_courses.length]);
  if (!data) return null;
  const title = tr(data.title);
  return (
    <section className="card ai-assisted" aria-labelledby="ai-assisted-title">
      <p className="eyebrow">{t("aa.option")}</p>
      <h2 id="ai-assisted-title">{tf("aa.title", { role: title })}</h2>
      <p className="muted">{tf("aa.sub", { role: title })}</p>

      <div className="aa-grid">
        <div>
          <span className="kpi-label">{t("path.readiness")}</span>
          <div className="card-row"><strong className="readiness-num">{percent(data.readiness)}%</strong>
            <span className="muted">{tf("aa.plan", { n: data.steps.length, h: data.total_hours })}</span></div>
          <div className="fit" role="img" aria-label={`${t("path.readiness")} ${percent(data.readiness)}%`}><div style={{ width: `${data.readiness * 100}%` }} /></div>
          {outlook && <p className="source">{tf("aa.outlook", { role: title, n: signed(outlook.index) })} <span className={`badge ${OUTLOOK_TONE[outlook.label]}`}>{OUTLOOK_TEXT[outlook.label]}</span> {t("aa.noForecast")}</p>}
        </div>
        <div>
          <span className="kpi-label">{t("aa.skills")}</span>
          <ul className="aa-skills">
            {data.ai_skills.map((s) => (
              <li key={s.skill_id}><span className={`chip ${s.have ? "covered" : "missing"}`}>{s.have ? "✓ " : "+ "}{tr(s.name)}</span>
                <small className="muted">{tr(s.why)}</small></li>
            ))}
          </ul>
        </div>
      </div>

      {data.tasks.length > 0 && (
        <details className="aa-tasks">
          <summary>{t("aa.tasks")}: {CHANGE_ORDER.map((c) => tf(`aa.share.${c}` as StringKey, { n: percent(data.task_shares[SHARE_KEY[c]]) })).join(" · ")}</summary>
          <ul>
            {data.tasks.map((task) => (
              <li key={task.id}><span className={`badge ${task.change === "check" ? "risk" : task.change === "faster" ? "gold" : "good"}`}>{t(`aa.change.${task.change}` as StringKey)}</span> {tr(task.text)}</li>
            ))}
          </ul>
        </details>
      )}

      {data.steps.length > 0 && (
        <>
          <span className="kpi-label">{t("aa.courses")}</span>
          <ol className="aa-steps">
            {data.steps.map((s) => (
              <li key={s.step} className={s.done ? "is-done" : ""}>
                <strong>{s.skills.map((k) => tr(k.name)).join(", ")}</strong>{" · "}
                {s.course.url ? <a href={s.course.url} target="_blank" rel="noreferrer">{s.course.title}</a> : s.course.title}
                {" · "}{tf("pl.hours", { h: s.course.hours })}
                {" · "}<span className={`badge ${COST[s.course.cost]?.tone ?? ""}`}>{s.course.cost === "paid" ? priceText(s.course.price_rm, s.course.cost) : COST[s.course.cost]?.label ?? s.course.cost}</span>
                {s.done && <span className="badge good"> ✓</span>}
              </li>
            ))}
          </ol>
          <StudyCalendar plan={{ role_id: `${data.role_id}-ai`, steps: data.steps } as unknown as Pathway} roleTitle={tf("aa.title", { role: data.title })} />
        </>
      )}

      {data.leads_to.length > 0 && (
        <p>{t("aa.leads")} {data.leads_to.map((l) => <span key={l.capability_id} className="badge gold">{l.title[getLang()] || l.title.en}</span>)}
          <span className="source"> · {t("em.badge")}</span></p>
      )}
      <p className="source">{t("aa.source")}{data.reviewed_by ? ` · ${tf("src.reviewedBy", { name: data.reviewed_by })}` : ""}</p>
    </section>
  );
}
