import { FormEvent, KeyboardEvent, useEffect, useId, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { EtaBar } from "../components/EtaBar";
import { Icon } from "../components/Icon";
import { RouteMap } from "../components/RouteMap";
import { api, Journey, JourneyStep, Matches, Pathway, Profile, RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { StringKey, t, tf, tr } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

export type TargetScreen = "role" | "tree";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? t("home.morning") : h < 18 ? t("home.afternoon") : t("home.evening");
}

const STEP_LABEL: Record<JourneyStep, StringKey> = {
  stand: "step.stand", explore: "step.explore", build: "step.build", apply: "step.apply",
};

// Today: one next step, the four-step journey, the coach, and your best roles. Scenario tools,
// KPIs and tipping points live on Future roles, so nothing here repeats that screen.
export function Home({ profile, scenario, journey, onAsk, onOpenRole, onGo, onTarget }: {
  profile: Profile; scenario: Scenario; journey: Journey | null;
  onAsk: (q: string) => void; onOpenRole: (r: RoleMatch) => void;
  onGo: (s: "intake" | "tasks" | "roles") => void; onTarget: (s: TargetScreen) => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.matches(profile.id, scenario).then((d) => { setData(d); setError(false); }).catch(() => setError(true));
  }, [profile.id, profile.completed_courses.length, scenario, attempt]);

  const name = profile.display_name?.replace(/\s*\(demo\)$/, "");
  const top = data?.roles[0];
  const target = data?.roles.find((r) => r.role_id === profile.target_role_id) ?? null;
  const current = data?.roles.find((r) => r.is_current_role) ?? data?.current_role ?? null;
  const audience = profile.audience ?? "worker";
  const entryRoles = data?.roles.filter((r) => r.why.entry_points > 0).slice(0, 3) ?? [];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  function openStep(step: JourneyStep) {
    if (step === "stand") onGo("intake");
    else if (step === "explore") onGo("roles");
    else onTarget(step === "build" ? "tree" : "role");
  }

  return (
    <section className="home">
      <div className="page-head">
        <h1>{name ? tf("home.helloName", { g: greeting(), name }) : tf("home.hello", { g: greeting() })}</h1>
        <p className="muted">{t("home.sub")} {today}.</p>
      </div>

      {!target && <WhereTo roles={data?.roles ?? []} onOpenRole={onOpenRole} onAsk={onAsk} />}

      {journey && data && <NextStep journey={journey} top={top ?? null} target={target} profile={profile}
        from={current ? tr(current.title) : t("route.yourSkills")} onOpenRole={onOpenRole} onStep={openStep} />}
      {journey && (
        <ol className="journey route-legs" aria-label={t("step.title")}>
          {journey.steps.map((s, i) => {
            const now = journey.next === s.id;
            return (
              <li key={s.id} className={`journey-step ${s.done ? "is-done" : ""} ${now ? "is-now" : ""}`}>
                <button onClick={() => openStep(s.id)} aria-current={now ? "step" : undefined}>
                  <span className="journey-num" aria-hidden="true">{s.done ? "✓" : i + 1}</span>
                  <span>{t(STEP_LABEL[s.id])}<small>{s.done ? t("step.done") : now ? t("step.now") : t("step.later")} · {t(`step.${s.id}Hint` as StringKey)}</small></span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {target && <WhereTo roles={data?.roles ?? []} onOpenRole={onOpenRole} onAsk={onAsk} />}
      {data && target && <StoryBanner profile={profile} target={target} year={data.signal_source.horizon_year} />}

      {error && (
        <p className="error" role="alert">{t("home.loadFailed")} <button className="link" onClick={() => setAttempt((n) => n + 1)}>{t("shell.retry")}</button></p>
      )}
      {data && <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />}

      {data && top && audience === "worker" && current && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.workerTitle")}</span>
          <strong>{tr(current.title)}: <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]}</span> {signed(current.outlook[scenario].index)}%</strong>
          <p className="muted">{t("lead.workerBody")}</p>
          <button className="btn quiet sm" onClick={() => onGo("tasks")}>{t("nav.tasks")} →</button>
        </div>
      )}
      {data && audience === "graduate" && entryRoles.length > 0 && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.gradTitle")}</span>
          <p className="muted">{t("lead.gradBody")}</p>
          <div className="actions">{entryRoles.map((r) => (
            <button key={r.role_id} className="btn quiet sm" onClick={() => onOpenRole(r)}>{tr(r.title)} · {percent(r.fit)}%</button>
          ))}</div>
        </div>
      )}
      {data && top && audience === "switcher" && current && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.switchTitle")}</span>
          <strong>{tr(current.title)}: {OUTLOOK_TEXT[current.outlook[scenario].label]} {signed(current.outlook[scenario].index)}%</strong>
          <p className="muted">{t("lead.switchBody")} <strong>{tr(top.title)}</strong>:</p>
          <div className="chips">{top.carry_over.length
            ? top.carry_over.map((s) => <span key={s.skill_id} className="chip covered">✓ {tr(s.name)}</span>)
            : <span className="muted">{t("lead.noCarry")}</span>}</div>
        </div>
      )}

      {data && (
        <div className="card home-roles">
          <h2>{t("home.topDest")}</h2>
          <ol className="home-list">
            {data.roles.slice(0, 3).map((r) => (
              <li key={r.role_id}>
                <button className="home-role" onClick={() => onOpenRole(r)}>
                  <span className="rank">#{r.rank}</span>
                  <span className="home-role-title">{tr(r.title)}
                    {r.role_id === profile.target_role_id && <span className="badge good"><Icon name="flag" />{t("target.yours")}</span>}
                    {r.robust_pick && <span className="badge gold">{t("k.robustPick")}</span>}
                  </span>
                  <span className="fit" role="img" aria-label={tf("card.fitAria", { n: percent(r.fit) })}><span style={{ width: `${r.fit * 100}%` }} /></span>
                  <span className={`badge ${OUTLOOK_TONE[r.outlook[scenario].label]}`}>{OUTLOOK_TEXT[r.outlook[scenario].label]}</span>
                </button>
              </li>
            ))}
          </ol>
          <button className="link" onClick={() => onGo("roles")}>{tf("home.seeAll", { n: data.roles.length })} →</button>
        </div>
      )}
      {!data && !error && <div className="grid" aria-hidden="true">{[0, 1].map((i) => <div key={i} className="card skeleton" />)}</div>}
      {data && <p className="source">{tf("home.forecast", { id: data.signal_source.snapshot_id, date: data.signal_source.imported })} {t("shell.estimates")}</p>}
    </section>
  );
}

// The one thing to do next: the first journey step not done, in plain words.
function NextStep({ journey, top, target, profile, from, onOpenRole, onStep }: {
  journey: Journey; top: RoleMatch | null; target: RoleMatch | null; profile: Profile; from: string;
  onOpenRole: (r: RoleMatch) => void; onStep: (s: JourneyStep) => void;
}) {
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [planFailed, setPlanFailed] = useState(false);
  const targetId = target?.role_id;
  useEffect(() => {
    if (!targetId) { setPlan(null); return; }
    let live = true;
    setPlanFailed(false);
    api.pathway(profile.id, targetId).then((p) => live && setPlan(p)).catch(() => live && setPlanFailed(true));
    return () => { live = false; };
  }, [profile.id, targetId, profile.completed_courses.length]);
  const step = journey.next;
  let title: string, body: string, action: string, go: () => void;
  if (step === "stand") {
    [title, body, action, go] = [t("next.standTitle"), t("next.standBody"), t("next.standAction"), () => onStep("stand")];
  } else if (step === "explore" && top) {
    [title, body, action, go] = [`${t("next.exploreTitle")} ${tr(top.title)}`, t("next.exploreBody"), t("next.exploreAction"), () => onOpenRole(top)];
  } else if (step === "build" && target) {
    [title, body, action, go] = [`${t("next.buildTitle")} ${tr(target.title)}`,
      `${target.missing.length} ${t("next.buildBody")}`, t("next.buildAction"), () => onStep("build")];
  } else if (step === "apply" && target) {
    [title, body, action, go] = [`${t("next.applyTitle")} ${tr(target.title)}`, t("next.applyBody"), t("next.applyAction"), () => onStep("apply")];
  } else {
    [title, body, action, go] = [t("next.doneTitle"), t("next.doneBody"), t("next.doneAction"), () => onStep(target ? "build" : "explore")];
  }
  if (target) {
    return (
      <div className="card next-step resume-route">
        <span className="eyebrow">{t("home.resume")}</span>
        <h2>{tf("route.from", { from, to: tr(target.title) })}</h2>
        {plan && plan.steps.length > 0 && <RouteMap plan={plan} from={from} to={target.title} compact />}
        {plan && <EtaBar plan={plan} role={target} inline />}
        {!plan && !planFailed && <p className="muted">{t("home.routeLoading")}</p>}
        <p><strong>{title}</strong> <span className="muted">{body}</span></p>
        <button className="btn ink" onClick={go}>{action} →</button>
      </div>
    );
  }
  return (
    <div className="card next-step">
      <span className="eyebrow">{t("home.next")}</span>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <button className="btn ink" onClick={go}>{action} →</button>
    </div>
  );
}

// "Your 2030 route is ready": makes a Future Card for the destination (once per progress state)
// and opens it as a story.
function StoryBanner({ profile, target, year }: { profile: Profile; target: RoleMatch; year: number }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = `${KEYS.storyCard}${profile.id}.${target.role_id}.${profile.completed_courses.length}.${profile.skills.length}`;
  async function open() {
    setBusy(true); setFailed(false);
    try {
      let id = load(key);
      if (!id) { id = (await api.createCard(profile.id, target.role_id)).card_id; save(key, id); }
      window.location.href = `${window.location.pathname}?card=${encodeURIComponent(id)}`;
    } catch { setFailed(true); setBusy(false); }
  }
  return (
    <div className="story-banner">
      <div>
        <strong>{tf("story.banner", { year })}</strong>
        <span>{tf("story.bannerSub", { role: tr(target.title) })}</span>
      </div>
      <button className="btn" onClick={open} disabled={busy}>{busy ? t("story.making") : t("story.open")} →</button>
      {failed && <p className="error" role="alert">{t("share.failed")}</p>}
    </div>
  );
}

// "Where to?": typing filters the roles to jump to (arrow keys move, Enter opens); Enter with no
// matching role sends the text to the coach, as the old ask box did.
function WhereTo({ roles, onOpenRole, onAsk }: { roles: RoleMatch[]; onOpenRole: (r: RoleMatch) => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const needle = q.trim().toLowerCase();
  const matches = needle.length < 2 ? [] : roles.filter((r) =>
    tr(r.title).toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle)).slice(0, 5);

  function ask() {
    if (!q.trim()) return;
    onAsk(q.trim());
    setQ("");
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    if (matches.length) onOpenRole(matches[Math.min(active, matches.length - 1)]);
    else ask();
  }
  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (!matches.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + matches.length) % matches.length); }
    else if (e.key === "Escape") setQ("");
  }
  return (
    <form className="where-to" onSubmit={submit} role="search">
      <label htmlFor={`${id}-q`}><span className="where-to-title">{t("home.whereTo")}</span><small className="muted">{t("home.whereToHint")}</small></label>
      <div className="where-to-row">
        <input id={`${id}-q`} type="text" maxLength={500} value={q} autoComplete="off"
          role="combobox" aria-expanded={matches.length > 0} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={matches.length ? `${id}-o${Math.min(active, matches.length - 1)}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys} placeholder={t("home.whereToPlaceholder")} />
        <button className="btn ask-inline" type="button" onClick={ask} disabled={!q.trim()}><span className="as-orb sm" aria-hidden="true" />{t("home.askCoach")}</button>
      </div>
      {matches.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="where-to-list" aria-label={t("home.whereTo")}>
          {matches.map((r, i) => (
            <li key={r.role_id} id={`${id}-o${i}`} role="option" aria-selected={i === Math.min(active, matches.length - 1)}
              onMouseDown={(e) => e.preventDefault()} onClick={() => onOpenRole(r)}>
              <Icon name="route" /><span>{tr(r.title)}</span><small className="muted">#{r.rank} · {percent(r.fit)}%</small>
            </li>
          ))}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">{needle.length >= 2 ? (matches.length ? tf("home.matchCount", { n: matches.length }) : t("home.noMatch")) : ""}</p>
      {needle.length >= 2 && !matches.length && <small className="muted">{t("home.noMatch")}</small>}
    </form>
  );
}
