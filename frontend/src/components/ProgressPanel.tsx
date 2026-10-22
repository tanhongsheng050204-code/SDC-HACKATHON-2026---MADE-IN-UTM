import { useEffect, useId, useState } from "react";
import { api, Profile, Progress, ProgressStatus } from "../lib/api";
import { percent, shortDate } from "../lib/format";
import { t, tf, tr, type StringKey } from "../lib/i18n";

export const STATUS_KEY: Record<ProgressStatus, StringKey> = {
  on_track: "track.onTrack", ahead: "track.ahead", behind: "track.behind", done: "track.done",
};
export const STATUS_TONE: Record<ProgressStatus, string> = { on_track: "good", ahead: "good", behind: "sun", done: "good" };

const HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrow(today: string) {
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return isoDay(d);
}

// Progress toward the destination: a target date and weekly hours, On track / Ahead / Behind,
// readiness over time and course hours finished this week. Every number comes from /progress.
export function ProgressPanel({ profile, roleTitle, onProfile, suggestedHours }: {
  profile: Profile; roleTitle: string; onProfile: (p: Profile) => void; suggestedHours?: number | null;
}) {
  const [data, setData] = useState<Progress | null>(null);
  const [date, setDate] = useState(profile.target_date ?? "");
  const [hours, setHours] = useState<number | null>(profile.weekly_hours ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const id = useId();
  const completions = profile.completed_courses.join(",");
  const levels = JSON.stringify(profile.skill_levels ?? {});

  useEffect(() => {
    let live = true;
    api.progress(profile.id).then((p) => { if (live) setData(p); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [profile.id, profile.target_role_id, profile.target_date, profile.weekly_hours, completions, levels]);

  useEffect(() => { if (suggestedHours) setHours(suggestedHours); }, [suggestedHours]);

  async function save() {
    setSaving(true); setMessage(null);
    try {
      onProfile(await api.setPlan(profile.id, date || null, hours));
      setMessage({ error: false, text: t("track.saved") });
    } catch { setMessage({ error: true, text: t("track.saveFailed") }); }
    finally { setSaving(false); }
  }

  if (!data || data.readiness === null) return null;
  return (
    <section className="card progress-panel" aria-labelledby={`${id}-h`}>
      <div className="progress-head">
        <h2 id={`${id}-h`}>{t("track.title")}</h2>
        {data.status && <span className={`badge ${STATUS_TONE[data.status]} progress-status`}>{t(STATUS_KEY[data.status])}</span>}
      </div>
      <p className="muted">{tf("track.sub", { role: tr(roleTitle) })}</p>
      <p className="progress-big">{tf("track.ready", { n: percent(data.readiness) })}</p>
      {data.expected !== null && data.start && data.target_date && (
        <p>{tf("track.expected", { start: percent(data.start.readiness), from: shortDate(data.start.date),
          date: shortDate(data.target_date), n: percent(data.expected) })}</p>
      )}
      {!data.target_date && <p className="muted">{t("track.setDate")}</p>}
      {data.finish_estimate && data.weekly_hours && (
        <p>{tf("track.finish", { h: data.weekly_hours, left: data.hours_left ?? 0, date: shortDate(data.finish_estimate) })}
          {data.target_date && data.finish_estimate > data.target_date && <> <strong>{t("track.late")}</strong></>}</p>
      )}

      <ReadinessChart data={data} />
      <WeekBar week={data.week} />

      <div className="progress-form">
        <label htmlFor={`${id}-date`}>{t("track.date")}
          <input id={`${id}-date`} type="date" min={tomorrow(data.today)} value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label htmlFor={`${id}-hours`}>{t("track.hours")}
          <select id={`${id}-hours`} value={hours ?? ""} onChange={(e) => setHours(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t("track.noHours")}</option>
            {HOURS.map((h) => <option key={h} value={h}>{tf("track.hoursN", { n: h })}</option>)}
          </select>
        </label>
        <button className="btn ink" onClick={save} disabled={saving} aria-busy={saving}>{t("track.save")}</button>
      </div>
      {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
      <p className="source">{t("track.how")}</p>
    </section>
  );
}

// Readiness over time as a line, with the dashed on-track line from the start to 100% on the
// target date. The same numbers are listed for screen readers.
function ReadinessChart({ data }: { data: Progress }) {
  const points = [...data.points.map((p) => ({ date: p.date, readiness: p.readiness })),
    { date: data.today, readiness: data.readiness ?? 0 }];
  if (points.length < 2 && !data.target_date) return null;
  const day = (iso: string) => new Date(`${iso}T00:00:00`).getTime();
  const first = Math.min(...points.map((p) => day(p.date)), data.start ? day(data.start.date) : Infinity);
  const last = Math.max(day(data.today), data.target_date ? day(data.target_date) : 0, ...points.map((p) => day(p.date)));
  const span = Math.max(last - first, 86_400_000);
  const W = 320, H = 140, L = 34, R = 10, T = 10, B = 24;
  const x = (iso: string) => L + ((day(iso) - first) / span) * (W - L - R);
  const y = (r: number) => T + (1 - r) * (H - T - B);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.readiness).toFixed(1)}`).join(" ");
  const summary = points.map((p) => `${shortDate(p.date)}: ${percent(p.readiness)}%`).join("; ");
  return (
    <figure className="progress-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tf("track.chartLabel", { list: summary })}>
        {[0, 0.5, 1].map((r) => (
          <g key={r}>
            <line x1={L} x2={W - R} y1={y(r)} y2={y(r)} className="grid" />
            <text x={L - 6} y={y(r) + 4} textAnchor="end">{percent(r)}%</text>
          </g>
        ))}
        {data.start && data.target_date && (
          <line x1={x(data.start.date)} y1={y(data.start.readiness)} x2={x(data.target_date)} y2={y(1)} className="expected" />
        )}
        <path d={path} className="actual" />
        {points.map((p, i) => <circle key={i} cx={x(p.date)} cy={y(p.readiness)} r={3.5} className="dot" />)}
        <line x1={x(data.today)} x2={x(data.today)} y1={T} y2={H - B} className="today" />
        <text x={L} y={H - 6}>{shortDate(isoDay(new Date(first)))}</text>
        <text x={W - R} y={H - 6} textAnchor="end">{shortDate(isoDay(new Date(last)))}</text>
      </svg>
      <figcaption className="muted">
        <span className="key actual" /> {t("track.chartReadiness")}
        {data.target_date && <><span className="key expected" /> {t("track.chartExpected")}</>}
      </figcaption>
    </figure>
  );
}

function WeekBar({ week }: { week: Progress["week"] }) {
  const share = week.target ? Math.min(1, week.hours_done / week.target) : 0;
  return (
    <div className="week-bar">
      <div className="next-progress-row">
        <span>{week.target ? tf("track.week", { done: week.hours_done, target: week.target }) : tf("track.weekNoTarget", { done: week.hours_done })}</span>
      </div>
      {week.target ? (
        <div className="next-progress-bar" role="img" aria-label={tf("track.week", { done: week.hours_done, target: week.target })}>
          <span style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
      ) : null}
      <small className="muted">{t("track.weekNote")}</small>
    </div>
  );
}
