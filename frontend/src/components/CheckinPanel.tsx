import { useEffect, useId, useState } from "react";
import { api, type ActionKind, type CheckinAgenda } from "../lib/api";
import { meetingIcs } from "../lib/calendar";
import { percent, shortDate } from "../lib/format";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { AiBadge } from "./AiBadge";
import { actionText } from "./PlanGuard";
import { STATUS_KEY, STATUS_TONE } from "./ProgressPanel";

const KIND_KEY: Record<ActionKind, StringKey> = {
  target_date: "ci.k.target_date", weekly_hours: "ci.k.weekly_hours", next_course: "ci.k.next_course",
  prove_skill: "ci.k.prove_skill", practise: "ci.k.practise",
};

const CHECK_KEY: Record<string, StringKey> = {
  hours_short: "ci.c.hours_short", no_hours: "ci.c.no_hours", date_passed: "ci.c.date_passed", declining: "ci.c.declining",
  declining_fast: "ci.c.declining_fast", licence: "ci.c.licence", long_shot: "ci.c.long_shot",
};

const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// A counsellor's check-in with one student: an agenda from what the student shares, a calendar
// invite, and actions to propose afterwards. Nothing said in the check-in is stored, and nothing in
// the student's plan changes until they accept a proposal on their Today screen.
export function CheckinPanel({ classId, memberKey, onClose }: { classId: string; memberKey: string; onClose: () => void }) {
  const [agenda, setAgenda] = useState<CheckinAgenda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<ActionKind>("next_course");
  const [value, setValue] = useState("");
  const [when, setWhen] = useState(`${inDays(7)}T15:00`);
  const id = useId();

  useEffect(() => {
    setAgenda(null); setError(null);
    api.checkin(classId, memberKey).then(setAgenda).catch(() => setError(t("cls.loadFailed")));
  }, [classId, memberKey]);

  // A sensible first value for each kind, from the student's own pathway.
  useEffect(() => {
    if (!agenda) return;
    const first = { target_date: inDays(90), weekly_hours: "5", next_course: agenda.options.courses[0]?.id ?? "",
      prove_skill: agenda.options.skills[0]?.id ?? "", practise: "" }[kind];
    setValue(first);
  }, [kind, agenda]);

  if (error) return <div className="card checkin"><p className="error" role="alert">{error}</p></div>;
  if (!agenda) return <div className="card checkin"><p className="muted">{t("a.loading")}</p></div>;
  const s = agenda.student;
  const name = s.display_name ?? t("cls.unnamed");

  async function propose() {
    setError(null);
    try { setAgenda(await api.proposeAction(classId, memberKey, kind, kind === "practise" ? null : value)); }
    catch (e) { setError(e instanceof Error ? e.message : t("cls.loadFailed")); }
  }
  async function withdraw(actionId: string) {
    setError(null);
    try { setAgenda(await api.withdrawAction(classId, memberKey, actionId)); }
    catch (e) { setError(e instanceof Error ? e.message : t("cls.loadFailed")); }
  }
  function invite() {
    const start = new Date(when);
    if (Number.isNaN(start.getTime())) return;
    const lines = [tf("ci.icsDest", { role: s.destination ? tr(s.destination) : "—" }),
      s.readiness !== null ? tf("ci.icsReady", { n: percent(s.readiness) }) : "",
      agenda!.next_course ? tf("ci.icsNext", { course: tr(agenda!.next_course.title) }) : "", t("ci.icsNote")].filter(Boolean);
    const text = meetingIcs(tf("ci.icsTitle", { name }), start, 30, lines.join("\n"));
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "laluan-check-in.ics";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const canPropose = kind === "practise" ? !!s.destination : value !== "";
  return (
    <div className="card checkin">
      <div className="progress-head">
        <h3>{tf("ci.title", { name })}</h3>
        <button className="icon-btn" aria-label={t("ci.close")} onClick={onClose}>×</button>
      </div>
      <p className="muted">{t("ci.private")}</p>

      <h4>{t("ci.agenda")}</h4>
      <ol className="checkin-agenda">
        <li>
          <strong>{t("ci.a1")}</strong>{" "}
          {s.destination ? tf("ci.where", { role: tr(s.destination), n: s.readiness === null ? 0 : percent(s.readiness) }) : t("ci.noDest")}
          {s.status && <> <span className={`badge ${STATUS_TONE[s.status]}`}>{t(STATUS_KEY[s.status])}</span></>}
        </li>
        <li>
          <strong>{t("ci.a2")}</strong>{" "}
          {tf(agenda.since_last_checkin ? "ci.sinceLast" : "ci.since14", { date: shortDate(agenda.since), c: agenda.recent.courses_finished, k: agenda.recent.skills_proven })}
        </li>
        <li>
          <strong>{t("ci.a3")}</strong>{" "}
          {agenda.checks.length === 0 ? t("ci.noChecks") : (
            <ul>{agenda.checks.map((c) => <li key={c.kind}>{c.level === "warn" ? "⚠" : "ℹ"} {t(CHECK_KEY[c.kind])}{c.need ? ` (${tf("ci.need", { n: c.need })})` : ""}</li>)}</ul>
          )} <AiBadge mode="rules" />
        </li>
        <li>
          <strong>{t("ci.a4")}</strong>{" "}
          {agenda.next_course ? tf("ci.next", { course: tr(agenda.next_course.title), h: agenda.next_course.hours }) : t("ci.noNext")}
        </li>
        <li><strong>{t("ci.a5")}</strong> {t("ci.a5text")}</li>
      </ol>

      <div className="checkin-invite">
        <label htmlFor={`${id}-when`}>{t("ci.when")}</label>
        <input id={`${id}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <button className="btn sm" onClick={invite}>{t("ci.invite")}</button>
      </div>

      <h4>{t("ci.propose")}</h4>
      <p className="muted">{t("ci.proposeSub")}</p>
      <form className="checkin-form" onSubmit={(e) => { e.preventDefault(); if (canPropose) propose(); }}>
        <label htmlFor={`${id}-kind`}>{t("ci.kind")}
          <select id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as ActionKind)}>
            {(Object.keys(KIND_KEY) as ActionKind[]).map((k) => <option key={k} value={k}>{t(KIND_KEY[k])}</option>)}
          </select>
        </label>
        {kind === "target_date" && (
          <label htmlFor={`${id}-v`}>{t("ci.date")}<input id={`${id}-v`} type="date" min={inDays(1)} value={value} onChange={(e) => setValue(e.target.value)} /></label>
        )}
        {kind === "weekly_hours" && (
          <label htmlFor={`${id}-v`}>{t("ci.hours")}
            <select id={`${id}-v`} value={value} onChange={(e) => setValue(e.target.value)}>
              {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((h) => <option key={h} value={String(h)}>{tf("ci.hoursN", { n: h })}</option>)}
            </select>
          </label>
        )}
        {kind === "next_course" && (agenda.options.courses.length === 0 ? <p className="muted">{t("ci.noCourses")}</p> : (
          <label htmlFor={`${id}-v`}>{t("ci.course")}
            <select id={`${id}-v`} value={value} onChange={(e) => setValue(e.target.value)}>
              {agenda.options.courses.map((c) => <option key={c.id} value={c.id}>{tr(c.title)} · {c.hours} h</option>)}
            </select>
          </label>
        ))}
        {kind === "prove_skill" && (agenda.options.skills.length === 0 ? <p className="muted">{t("ci.noSkills")}</p> : (
          <label htmlFor={`${id}-v`}>{t("ci.skill")}
            <select id={`${id}-v`} value={value} onChange={(e) => setValue(e.target.value)}>
              {agenda.options.skills.map((k) => <option key={k.id} value={k.id}>{tr(k.name)}</option>)}
            </select>
          </label>
        ))}
        {kind === "practise" && <p className="muted">{s.destination ? tf("act.practise", { role: tr(s.destination) }) : t("ci.noDest")}</p>}
        <button className="btn ink" type="submit" disabled={!canPropose}>{t("ci.send")}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}

      {agenda.actions.length > 0 && (
        <>
          <h4>{t("ci.sent")}</h4>
          <ul className="checkin-actions">
            {agenda.actions.map((a) => (
              <li key={a.id}>
                <span>{actionText(a)}</span>
                <span className={`badge ${a.status === "declined" ? "risk" : a.status === "proposed" ? "" : "good"}`}>{t(`act.s.${a.status}` as StringKey)}</span>
                {a.status === "proposed" && <button className="link" onClick={() => withdraw(a.id)}>{t("ci.withdraw")}</button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
