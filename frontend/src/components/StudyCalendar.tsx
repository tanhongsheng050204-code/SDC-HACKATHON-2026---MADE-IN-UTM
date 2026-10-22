import { useState } from "react";
import type { Pathway } from "../lib/api";
import { icsFile, sessions } from "../lib/calendar";
import { getLang, t, tf, tr, type StringKey } from "../lib/i18n";

const DAY_KEYS = ["cal.sun", "cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat"] as const;

// "Plan it in my calendar": weekly study sessions for the courses not finished yet, downloaded as
// an .ics file. Nothing is sent to the server.
export function StudyCalendar({ plan, roleTitle, onUseAsTarget }: {
  plan: Pathway; roleTitle: string; onUseAsTarget?: (hoursPerWeek: number) => void;
}) {
  const [days, setDays] = useState<number[]>([6]);  // Saturday
  const [sessionHours, setSessionHours] = useState(2);
  const [startTime, setStartTime] = useState("10:00");
  const courses = plan.steps.filter((s) => !s.done).map((s) => s.course);
  if (courses.length === 0) return null;

  const input = { courses, days, sessionHours, startTime, from: new Date(), roleTitle: tr(roleTitle) };
  const planned = sessions(input);
  const last = planned.at(-1);
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  function download() {
    const text = icsFile(input, { count: (i, n) => tf("cal.count", { i, n }), goal: t("cal.goal") });
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `laluan-study-plan-${plan.role_id}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card study-calendar">
      <h3>{t("cal.title")}</h3>
      <p className="muted">{t("cal.sub")}</p>
      <fieldset className="cal-days">
        <legend>{t("cal.days")}</legend>
        {DAY_KEYS.map((key, d) => (
          <label key={key} className="check">
            <input type="checkbox" checked={days.includes(d)} onChange={() => toggle(d)} /> {t(key as StringKey)}
          </label>
        ))}
      </fieldset>
      <div className="two-col">
        <label>{t("cal.length")}
          <select value={sessionHours} onChange={(e) => setSessionHours(Number(e.target.value))}>
            {[1, 2, 3].map((h) => <option key={h} value={h}>{tf("cal.hours", { n: h })}</option>)}
          </select>
        </label>
        <label>{t("cal.time")}
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value || "10:00")} />
        </label>
      </div>
      {last ? (
        <p>{tf("cal.summary", { n: planned.length, courses: courses.length,
          date: last.end.toLocaleDateString(getLang() === "zh" ? "zh-CN" : getLang() === "ms" ? "ms-MY" : "en-MY", { day: "numeric", month: "long", year: "numeric" }) })}</p>
      ) : <p className="muted" role="note">{t("cal.pickDay")}</p>}
      <div className="actions">
        <button className="primary" disabled={!last} onClick={download}>{t("cal.download")}</button>
        {onUseAsTarget && days.length > 0 && (
          // The weekly hours of these sessions become the progress target (saved with "Save plan").
          <button className="btn quiet" onClick={() => onUseAsTarget(days.length * sessionHours)}>
            {tf("cal.useTarget", { n: days.length * sessionHours })}
          </button>
        )}
      </div>
      <p className="source">{t("cal.note")}</p>
    </div>
  );
}
