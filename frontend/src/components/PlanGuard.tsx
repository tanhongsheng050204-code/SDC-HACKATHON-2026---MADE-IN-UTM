import { useEffect, useState } from "react";
import { api, type CheckinAction, type Decision, type DecisionFacts, type DecisionReason, type PlanCheck, type Profile } from "../lib/api";
import { percent, shortDate, signed } from "../lib/format";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { OUTLOOK_TEXT } from "../lib/labels";
import { AiBadge } from "./AiBadge";
import { UpdateRow } from "./UpdateRow";

// Three small cards on Today, all worked out by rules from the person's own numbers:
// why they chose their destination (and what changed since), plan checks, and what a counsellor
// proposed after a check-in (nothing changes until they accept).

const REASON_KEY: Record<DecisionReason, StringKey> = {
  fits_skills: "dec.r.fits_skills", growing: "dec.r.growing", short_plan: "dec.r.short_plan",
  enjoy: "dec.r.enjoy", pay: "dec.r.pay", robust: "dec.r.robust",
};

function factsLine(f: DecisionFacts) {
  return tf("dec.facts", { fit: percent(f.fit), label: OUTLOOK_TEXT[f.outlook_label], pct: signed(f.outlook_index), h: f.plan_hours, rank: f.rank });
}

export function DecisionCard({ profile }: { profile: Profile }) {
  const [data, setData] = useState<Decision | null>(null);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<DecisionReason[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let live = true;
    api.decision(profile.id).then((d) => { if (live) { setData(d); setPicked(d?.reasons ?? []); } }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [profile.id, profile.target_role_id]);
  if (!data) return null;

  const forecastMoved = data.changed.some((k) => k !== "snapshot_id");
  const asking = editing || data.reasons.length === 0;
  async function save() {
    setSaving(true);
    try { const d = await api.setDecisionReasons(profile.id, picked); setData(d); setEditing(false); } catch { /* keep the picks to try again */ }
    setSaving(false);
  }
  const toggle = (r: DecisionReason) => setPicked(picked.includes(r) ? picked.filter((x) => x !== r) : [...picked, r]);

  return (
    <div className={`card decision-card ${forecastMoved ? "is-moved" : ""}`}>
      <div className="row-between">
        <span className="eyebrow">{tf("dec.title", { role: tr(data.title) })}</span>
        <AiBadge mode="rules" />
      </div>
      <p className="muted">{tf("dec.chosen", { date: shortDate(data.chosen_at.slice(0, 10)) })} {factsLine(data.then)}</p>
      {forecastMoved
        ? <p><strong>{t("dec.nowMoved")}</strong> {factsLine(data.now)}</p>
        : <p className="muted">{t("dec.same")}</p>}
      {asking ? (
        <fieldset className="decision-reasons">
          <legend>{t("dec.ask")}</legend>
          <div className="chips">
            {data.options.map((r) => (
              <button key={r} type="button" className={`chip ${picked.includes(r) ? "on" : ""}`} aria-pressed={picked.includes(r)} onClick={() => toggle(r)}>
                {picked.includes(r) ? "✓ " : ""}{t(REASON_KEY[r])}
              </button>
            ))}
          </div>
          <button className="btn sm" onClick={save} disabled={saving || picked.length === 0}>{t("dec.save")}</button>
        </fieldset>
      ) : (
        <div className="decision-reasons">
          <span className="muted">{t("dec.because")}</span>
          <div className="chips">{data.reasons.map((r) => <span key={r} className="chip covered">✓ {t(REASON_KEY[r])}</span>)}</div>
          <button className="link" onClick={() => setEditing(true)}>{t("dec.change")}</button>
        </div>
      )}
      {forecastMoved && data.reasons.length > 0 && <p className="muted">{t("dec.stillTrue")}</p>}
    </div>
  );
}

function checkText(c: PlanCheck, role: string): string {
  switch (c.kind) {
    case "hours_short": return tf("check.hours_short", { date: shortDate(c.target_date!), need: c.need!, left: c.hours_left!, weekly: c.weekly_hours! });
    case "no_hours": return tf("check.no_hours", { date: shortDate(c.target_date!), need: c.need!, left: c.hours_left! });
    case "date_passed": return tf("check.date_passed", { date: shortDate(c.target_date!) });
    case "declining": return tf("check.declining", { role, pct: signed(c.index!) });
    case "declining_fast": return tf("check.declining_fast", { role, pct: signed(c.index!) });
    case "licence": return c.months ? tf("check.licence", { role, licence: c.licence!, months: c.months }) : tf("check.licenceNoMonths", { role, licence: c.licence! });
    case "long_shot": return tf("check.long_shot", { role, fit: percent(c.fit!) }) + (c.stepping_stone ? ` ${tf("check.stone", { role: tr(c.stepping_stone) })}` : "");
  }
}

export function PlanChecks({ profile, roleTitle, row = false }: { profile: Profile; roleTitle: string | null; row?: boolean }) {
  const [checks, setChecks] = useState<PlanCheck[]>([]);
  useEffect(() => {
    let live = true;
    api.planCheck(profile.id).then((c) => { if (live) setChecks(c); }).catch(() => { if (live) setChecks([]); });
    return () => { live = false; };
  }, [profile.id, profile.target_role_id, profile.target_date, profile.weekly_hours, profile.completed_courses.length]);
  if (checks.length === 0 || !roleTitle) return null;
  const role = tr(roleTitle);
  const card = (
    <div className="card plan-checks" role="note">
      <div className="row-between"><span className="eyebrow">{t("check.title")}</span><AiBadge mode="rules" /></div>
      <ul>
        {checks.map((c) => (
          <li key={c.kind} className={c.level}><span aria-hidden="true">{c.level === "warn" ? "⚠" : "ℹ"}</span> {checkText(c, role)}</li>
        ))}
      </ul>
      <small className="muted">{t("check.note")}</small>
    </div>
  );
  if (!row) return card;
  const warn = checks.some((c) => c.level === "warn");
  return <UpdateRow icon={warn ? "⚠" : "ℹ"} tone={warn ? "warn" : ""} text={tf("upd.checks", { n: checks.length })} action={t("upd.view")} title={t("check.title")}>{() => card}</UpdateRow>;
}

export function actionText(a: Pick<CheckinAction, "kind" | "value" | "label">): string {
  switch (a.kind) {
    case "target_date": return tf("act.target_date", { date: shortDate(a.value!) });
    case "weekly_hours": return tf("act.weekly_hours", { n: a.value! });
    case "next_course": return tf("act.next_course", { course: tr(a.label ?? a.value ?? "") });
    case "prove_skill": return tf("act.prove_skill", { skill: tr(a.label ?? a.value ?? "") });
    case "practise": return tf("act.practise", { role: tr(a.label ?? "") });
  }
}

const STATUS_TEXT: Record<CheckinAction["status"], StringKey> = {
  proposed: "act.s.proposed", accepted: "act.s.accepted", declined: "act.s.declined", done: "act.s.done",
};

export function CounsellorActions({ profile, onChanged, row = false }: { profile: Profile; onChanged: () => void; row?: boolean }) {
  const [actions, setActions] = useState<CheckinAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.myActions(profile.id).then((a) => { if (live) setActions(a); }).catch(() => { if (live) setActions([]); });
    return () => { live = false; };
  }, [profile.id]);
  const open = actions.filter((a) => a.status === "proposed" || a.status === "accepted");
  const past = actions.filter((a) => a.status === "declined" || a.status === "done");
  if (actions.length === 0 || (row && open.length === 0)) return null;

  async function answer(a: CheckinAction, how: "accept" | "decline" | "done") {
    setError(null);
    try {
      setActions(await api.answerAction(profile.id, a.id, how));
      if (how === "accept" && (a.kind === "target_date" || a.kind === "weekly_hours")) onChanged();
    } catch (e) { setError(e instanceof Error ? e.message : t("act.failed")); }
  }

  const card = (
    <div className="card counsellor-actions">
      <span className="eyebrow">{t("act.title")}</span>
      {open.length === 0 ? <p className="muted">{t("act.allAnswered")}</p> : (
        <ul>
          {open.map((a) => (
            <li key={a.id}>
              <div>
                <strong>{actionText(a)}</strong>
                <small className="muted">{tf("act.from", { who: a.counsellor ?? "", cls: a.class_name ?? "", date: shortDate(a.created_at.slice(0, 10)) })}</small>
              </div>
              <div className="actions">
                {a.status === "proposed" ? (
                  <>
                    <button className="btn ink sm" onClick={() => answer(a, "accept")}>{t("act.accept")}</button>
                    <button className="btn quiet sm" onClick={() => answer(a, "decline")}>{t("act.decline")}</button>
                  </>
                ) : <button className="btn sm" onClick={() => answer(a, "done")}>✓ {t("act.markDone")}</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {past.length > 0 && (
        <details><summary className="muted">{tf("act.history", { n: past.length })}</summary>
          <ul className="plain-list">{past.map((a) => <li key={a.id}>{actionText(a)} · {t(STATUS_TEXT[a.status])}</li>)}</ul>
        </details>
      )}
      <small className="muted">{t("act.note")}</small>
    </div>
  );
  if (!row) return card;
  return <UpdateRow icon="👤" tone="good" text={tf("upd.counsellor", { n: open.length })} action={t("upd.view")} title={t("act.title")}>{() => card}</UpdateRow>;
}
