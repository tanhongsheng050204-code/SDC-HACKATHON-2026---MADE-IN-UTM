import { FormEvent, KeyboardEvent, useEffect, useId, useState } from "react";
import { DataBanner } from "../components/DataBanner";
import { Icon } from "../components/Icon";
import { api, Journey, JourneyStep, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { StringKey, t, tf, tr } from "../lib/i18n";
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
  const [question, setQuestion] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.matches(profile.id, scenario).then((d) => { setData(d); setError(false); }).catch(() => setError(true));
  }, [profile.id, profile.completed_courses.length, scenario, attempt]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    onAsk(question.trim());
    setQuestion("");
  }

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

      <WhereTo roles={data?.roles ?? []} onOpenRole={onOpenRole} onAsk={onAsk} />

      {target !== null && data !== null && (
        <StoryBanner profile={profile} target={target} />
      )}

      {journey && data && <NextStep journey={journey} top={top ?? null} target={target} onOpenRole={onOpenRole} onStep={openStep} />}
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

      <form className="home-ask" onSubmit={submit}>
        <label className="sr-only" htmlFor="home-q">{t("shell.coach")}</label>
        <input id="home-q" type="text" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("home.askPlaceholder")} />
        <button className="primary" type="submit" disabled={!question.trim()}>{t("a.ask")}</button>
      </form>

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
          <h2>{t("home.bestRoles")}</h2>
          <ol className="home-list">
            {data.roles.slice(0, 3).map((r) => (
              <li key={r.role_id}>
                <button className="home-role" onClick={() => onOpenRole(r)}>
                  <span className="rank">#{r.rank}</span>
                  <span className="home-role-title">{tr(r.title)}
                    {r.role_id === profile.target_role_id && <span className="badge good"><Icon name="target" />{t("target.yours")}</span>}
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

// "Where to?": typing filters roles; Enter with no match sends text to the coach.
function WhereTo({ roles, onOpenRole, onAsk }: { roles: RoleMatch[]; onOpenRole: (r: RoleMatch) => void; onAsk: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const needle = q.trim().toLowerCase();
  const matches = needle.length < 2 ? [] : roles.filter((r) =>
    tr(r.title).toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle)).slice(0, 5);

  function ask() { if (!q.trim()) return; onAsk(q.trim()); setQ(""); }
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
        <button className="primary" type="button" onClick={ask} disabled={!q.trim()}>{t("home.askCoach")}</button>
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
      {needle.length >= 2 && !matches.length && <small className="muted">{t("home.noMatch")}</small>}
    </form>
  );
}

// Story banner: shown when user has a target role and matches have loaded.
function StoryBanner({ profile, target }: { profile: Profile; target: RoleMatch }) {
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function openRoute() {
    setCreating(true);
    setErr(null);
    try {
      const { card_id } = await api.createCard(profile.id, target.role_id);
      window.location.href = window.location.pathname + "?card=" + card_id;
    } catch {
      setErr(t("fc.offline"));
      setCreating(false);
    }
  }

  return (
    <div className="card story-banner" onClick={creating ? undefined : openRoute} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") openRoute(); }}>
      <span className="eyebrow">{t("fc.storyReady")}</span>
      <h3>{tf("fc.storyReadySub", { role: tr(target.title) })}</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <button
          className="btn ink"
          style={{ fontSize: ".9rem", padding: "7px 14px" }}
          onClick={(e) => { e.stopPropagation(); openRoute(); }}
          disabled={creating}
          aria-busy={creating}
        >
          {creating ? t("fc.storyCreating") : `${t("fc.storyOpen")} →`}
        </button>
        {err && <span className="error" role="alert">{err}</span>}
      </div>
    </div>
  );
}

// The one thing to do next: the first journey step not done, in plain words.
function NextStep({ journey, top, target, onOpenRole, onStep }: {
  journey: Journey; top: RoleMatch | null; target: RoleMatch | null;
  onOpenRole: (r: RoleMatch) => void; onStep: (s: JourneyStep) => void;
}) {
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
  return (
    <div className="card next-step">
      <span className="eyebrow">{t("home.next")}</span>
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <button className="btn ink" onClick={go}>{action} →</button>
    </div>
  );
}
