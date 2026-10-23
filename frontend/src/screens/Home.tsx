import { useEffect, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { api, Journey, JourneyStep, Matches, Pathway, Profile, Progress, RoleHistory, RoleMatch, Scenario } from "../lib/api";
import { STATUS_KEY, STATUS_TONE } from "../components/ProgressPanel";
import { ReplanCard } from "../components/ReplanCard";
import { CounsellorActions, PlanChecks } from "../components/PlanGuard";
import { UpdateRow } from "../components/UpdateRow";
import { percent, shortDate, signed } from "../lib/format";
import { StringKey, t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, priceText } from "../lib/labels";
import { KEYS, load, save } from "../lib/storage";

export type TargetScreen = "role" | "tree";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? t("home.morning") : h < 18 ? t("home.afternoon") : t("home.evening");
}

const STEP_LABEL: Record<JourneyStep, StringKey> = {
  stand: "step.stand", explore: "step.explore", build: "step.build", apply: "step.apply",
};
const ARROW: Record<string, string> = { declining: "▼", stable: "▬", growing: "▲", emerging: "▲" };

// Today: one next step, the four-step journey, three tiles, updates only when something needs the
// person, and their best roles as short rows. Search and the coach live in the top bar.
export function Home({ profile, scenario, journey, onOpenRole, onGo, onTarget, onProfileChanged }: {
  profile: Profile; scenario: Scenario; journey: Journey | null; onProfileChanged?: () => void;
  onOpenRole: (r: RoleMatch) => void;
  onGo: (s: "intake" | "tasks" | "roles") => void; onTarget: (s: TargetScreen) => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [track, setTrack] = useState<Progress | null>(null);

  useEffect(() => {
    api.matches(profile.id, scenario).then((d) => { setData(d); setError(false); }).catch(() => setError(true));
  }, [profile.id, profile.completed_courses.length, scenario, attempt]);
  useEffect(() => {
    if (!profile.target_role_id) { setPlan(null); setTrack(null); return; }
    api.pathway(profile.id, profile.target_role_id).then(setPlan).catch(() => setPlan(null));
    api.progress(profile.id).then(setTrack).catch(() => setTrack(null));
  }, [profile.id, profile.target_role_id, profile.completed_courses.length, profile.target_date]);

  const name = profile.display_name?.replace(/\s*\(demo\)$/, "");
  const top = data?.roles[0];
  const target = data?.roles.find((r) => r.role_id === profile.target_role_id) ?? null;
  const current = data?.roles.find((r) => r.is_current_role) ?? data?.current_role ?? null;
  const entry = data?.roles.find((r) => r.why.entry_points > 0) ?? null;
  const today = new Date().toLocaleDateString(document.documentElement.lang || undefined, { weekday: "short", day: "numeric", month: "short" });

  function openStep(step: JourneyStep) {
    if (step === "stand") onGo("intake");
    else if (step === "explore") onGo("roles");
    else onTarget(step === "build" ? "tree" : "role");
  }

  return (
    <section className="home today">
      <div className="today-hello">
        <h1>{name ? tf("home.helloName", { g: greeting(), name }).replace(/[.。]$/, "") : greeting()}</h1>
        <span className="muted">{today}</span>
      </div>

      {journey && data && <NextStep journey={journey} top={top ?? null} target={target} plan={plan} onOpenRole={onOpenRole} onStep={openStep} />}
      {journey && (
        <ol className="journey" aria-label={t("step.title")}>
          {journey.steps.map((s, i) => {
            const now = journey.next === s.id;
            return (
              <li key={s.id} className={`journey-step ${s.done ? "is-done" : ""} ${now ? "is-now" : ""}`}>
                <button onClick={() => openStep(s.id)} aria-current={now ? "step" : undefined}>
                  <span className="journey-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                  <span>{t(STEP_LABEL[s.id])}<small>{s.done ? t("step.done") : now ? t("step.now") : t("step.later")}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {data && (
        <div className="today-tiles">
          {current ? (
            <button className="today-tile" onClick={() => onGo("tasks")}>
              <small>{t("home.yourJob")}</small>
              <strong>{tr(current.title)} <span className={`outlook ${current.outlook[scenario].label}`}>{ARROW[current.outlook[scenario].label]} {signed(current.outlook[scenario].index)}%</span></strong>
              <small>{t("home.tasksLink")}</small>
            </button>
          ) : entry && (
            <button className="today-tile" onClick={() => onOpenRole(entry)}>
              <small>{t("home.entryRole")}</small><strong>{percent(entry.fit)}%</strong><small>{tr(entry.title)}</small>
            </button>
          )}
          {target ? (
            <button className="today-tile" onClick={() => onTarget("tree")}>
              <small>{t("home.ready")}</small><strong>{percent(plan?.readiness ?? target.fit)}%</strong><small>{t("home.forDest")}</small>
            </button>
          ) : (
            <button className="today-tile" onClick={() => onGo("roles")}>
              <small>{t("home.ready")}</small><strong>—</strong><small>{t("home.pickDest")}</small>
            </button>
          )}
          {top && (
            <button className="today-tile" onClick={() => onOpenRole(top)}>
              <small>{t("home.bestMatch")}</small><strong>{percent(top.fit)}%</strong><small>{tr(top.title)}</small>
            </button>
          )}
        </div>
      )}

      <section className="today-updates" aria-labelledby="today-updates-h">
        <h2 id="today-updates-h">{t("home.updates")}</h2>
        <div className="update-list">
          <ForecastChanges profile={profile} />
          {data && <ReplanCard profile={profile} roles={data.roles} onOpenRole={onOpenRole} row />}
          <CounsellorActions profile={profile} onChanged={() => onProfileChanged?.()} row />
          {target && <PlanChecks profile={profile} roleTitle={target.title} row />}
          {target && track && track.readiness !== null && (track.status && track.target_date
            ? <UpdateRow icon="📅" tone={STATUS_TONE[track.status] === "risk" ? "warn" : "good"} onClick={() => onTarget("tree")} action={t("upd.view")}
                text={<><span className={`badge ${STATUS_TONE[track.status]}`}>{t(STATUS_KEY[track.status])}</span> {tf("home.progress", { n: percent(track.readiness), date: shortDate(track.target_date) })}</>} />
            : <UpdateRow icon="📅" onClick={() => onTarget("tree")} text={t("upd.setDate")} action={t("upd.setDateBtn")} />)}
        </div>
      </section>

      {error && (
        <p className="error" role="alert">{t("home.loadFailed")} <button className="link" onClick={() => setAttempt((n) => n + 1)}>{t("shell.retry")}</button></p>
      )}
      {data && <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />}

      {data && (
        <section className="today-roles" aria-labelledby="today-roles-h">
          <div className="today-sec-head">
            <h2 id="today-roles-h">{t("home.bestRoles")}</h2>
            <button className="link" onClick={() => onGo("roles")}>{tf("home.seeAll", { n: data.roles.length })} →</button>
          </div>
          <ol className="today-role-list">
            {data.roles.slice(0, 3).map((r) => (
              <li key={r.role_id}>
                <button className="today-role" onClick={() => onOpenRole(r)}>
                  <span className="today-rank">#{r.rank}</span>
                  <span className="today-role-name">{tr(r.title)}
                    {r.role_id === profile.target_role_id && <span className="today-dest">{t("home.yourDest")}</span>}
                    {r.robust_pick && <span className="today-robust">{t("k.robustPick")}</span>}</span>
                  <span className="today-fit"><span aria-hidden="true"><i style={{ width: `${percent(r.fit)}%` }} /></span>{percent(r.fit)}%</span>
                  <span className={`outlook ${r.outlook[scenario].label}`} title={OUTLOOK_TEXT[r.outlook[scenario].label]}>
                    {ARROW[r.outlook[scenario].label]} {signed(r.outlook[scenario].index)}%</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      {!data && !error && <div className="grid" aria-hidden="true">{[0, 1].map((i) => <div key={i} className="card skeleton" />)}</div>}
      {data && <p className="source">{tf("home.forecast", { id: data.signal_source.snapshot_id, date: data.signal_source.imported })} {t("shell.estimates")}</p>}
    </section>
  );
}

// "What changed since your last visit": when a newer forecast moved the Baseline outlook of the
// destination or the current job, one row in Updates; the detail (dates, source) opens in a side
// panel. Numbers come only from /roles/{id}/history. "Got it" hides it until a later forecast
// moves a number again.
function ForecastChanges({ profile }: { profile: Profile }) {
  const [histories, setHistories] = useState<{ kind: "dest" | "job"; title: string; h: RoleHistory }[]>([]);
  const [seen, setSeen] = useState(() => load(KEYS.forecastSeen + profile.id));
  const ids = [["dest", profile.target_role_id], ["job", profile.current_role_id]] as const;

  useEffect(() => {
    setSeen(load(KEYS.forecastSeen + profile.id));
    let live = true;
    const wanted = ids.filter((x): x is readonly ["dest" | "job", string] => !!x[1])
      .filter(([kind, id]) => kind === "dest" || id !== profile.target_role_id);  // destination = current job: say it once
    Promise.all(wanted.map(([kind, id]) => Promise.all([api.history(id, "baseline"), api.role(id).then((r) => r.title).catch(() => id)])
      .then(([h, title]) => ({ kind, title, h })).catch(() => null)))
      .then((all) => { if (live) setHistories(all.filter((x): x is NonNullable<typeof x> => x !== null)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, profile.target_role_id, profile.current_role_id]);

  // The most recent forecast that moved the number (a later forecast with the same number changes nothing).
  const changes = histories.flatMap(({ kind, title, h }) => {
    let i = h.points.length - 1;
    while (i > 0 && h.points[i].index === h.points[i - 1].index) i--;
    return i > 0 ? [{ kind, title, before: h.points[i - 1], latest: h.points[i] }] : [];
  });
  const latest = changes.map((c) => c.latest).sort((a, b) => a.imported.localeCompare(b.imported)).at(-1);
  if (!latest || seen === latest.snapshot_id) return null;
  const date = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short", year: "numeric" });

  function gotIt() {
    save(KEYS.forecastSeen + profile.id, latest!.snapshot_id);
    setSeen(latest!.snapshot_id);
  }
  return (
    <UpdateRow icon="📈" text={tf("upd.forecast", { role: tr(changes[0].title) })} action={t("upd.view")} title={t("changes.title")}>
      {(close) => (
        <div className="forecast-changes" role="status">
          <ul>
            {changes.map((c) => (
              <li key={c.kind}>
                <small className="muted">{t(c.kind === "dest" ? "changes.dest" : "changes.job")}</small>
                <p>{tf("changes.moved", { date: date(c.latest.imported), role: tr(c.title), from: signed(c.before.index), to: signed(c.latest.index) })}
                  {c.kind === "dest" && <> {t("changes.routeSame")}</>}</p>
                <small className="source">{tf("changes.source", { source: c.latest.source, id: c.latest.snapshot_id })}</small>
              </li>
            ))}
          </ul>
          <button className="btn quiet sm" onClick={() => { gotIt(); close(); }}>{t("changes.gotIt")}</button>
        </div>
      )}
    </UpdateRow>
  );
}

// The one thing to do next: the first journey step not done. With a destination it names the next
// unfinished course from the pathway and shows readiness, hours and cost to go.
function NextStep({ journey, top, target, plan, onOpenRole, onStep }: {
  journey: Journey; top: RoleMatch | null; target: RoleMatch | null; plan: Pathway | null;
  onOpenRole: (r: RoleMatch) => void; onStep: (s: JourneyStep) => void;
}) {
  const step = journey.next;
  const next = plan?.steps.find((s) => !s.done) ?? null;
  let title: string, body: string | null = null, action: string, go: () => void;
  if (step === "stand") {
    [title, body, action, go] = [t("next.standTitle"), t("next.standBody"), t("next.standAction"), () => onStep("stand")];
  } else if (step === "explore" && top) {
    [title, body, action, go] = [`${t("next.exploreTitle")} ${tr(top.title)}`, t("next.exploreBody"), t("next.exploreAction"), () => onOpenRole(top)];
  } else if ((step === "build" || step === "explore") && target && next) {
    [title, body, action, go] = [tf("v3.nextCourse", { course: tr(next.skills[0]?.name ?? next.course.title), h: next.course.hours, cost: priceText(next.course.price_rm, next.course.cost).toLowerCase() }),
      `${tr(next.course.title)} · ${next.course.provider}`, t("v3.startCourse"), () => window.open(next.course.url, "_blank", "noopener")];
  } else if (step === "build" && target) {
    [title, action, go] = [t("next.buildShort"), t("next.buildAction"), () => onStep("build")];
  } else if (step === "apply" && target) {
    [title, action, go] = [t("next.applyShort"), t("next.applyAction"), () => onStep("apply")];
  } else {
    [title, body, action, go] = [t("next.doneTitle"), t("next.doneBody"), t("next.doneAction"), () => onStep(target ? "build" : "explore")];
  }
  const rm = plan ? plan.steps.filter((s) => !s.done).reduce((n, s) => n + (s.course.price_rm ?? 0), 0) : 0;
  const ready = plan ? percent(plan.readiness) : null;
  return (
    <div className="card next-step">
      <span className="pill">{target ? tf("home.dest", { role: tr(target.title) }) : t("home.next")}</span>
      <h2>{title}</h2>
      {body && <p className="muted">{body}</p>}
      {plan && ready !== null && (
        <div className="next-progress">
          <div className="next-progress-row"><span>{tf("v3.ready", { n: ready })}</span><span className="muted">{tf("v3.toGo", { h: plan.hours_left, rm: `RM ${rm.toLocaleString("en-MY")}` })}</span></div>
          <div className="next-progress-bar" role="img" aria-label={tf("v3.ready", { n: ready })}><span style={{ width: `${ready}%` }} /></div>
        </div>
      )}
      <div className="actions">
        <button className="btn ink" onClick={go}>{action} →</button>
        {target && <button className="link" onClick={() => onStep("build")}>{t("v3.seeRoute")}</button>}
      </div>
    </div>
  );
}
