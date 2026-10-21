import { FormEvent, useEffect, useState } from "react";
import { TippingPoints } from "../components/AdoptionSlider";
import { DataBanner } from "../components/DataBanner";
import { InfoTip } from "../components/InfoTip";
import { api, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE, SCENARIOS } from "../lib/labels";

function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? t("home.morning") : h < 18 ? t("home.afternoon") : t("home.evening");
}

// The first screen after opening a profile: where you stand, your best roles, what to do next.
export function Home({ profile, scenario, onScenario, onAsk, onOpenRole, onGo }: {
  profile: Profile; scenario: Scenario; onScenario: (s: Scenario) => void;
  onAsk: (q: string) => void; onOpenRole: (r: RoleMatch) => void; onGo: (s: "radar" | "tasks" | "roles") => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

  useEffect(() => {
    api.matches(profile.id, scenario).then((d) => { setData(d); setError(null); })
      .catch(() => setError(t("home.loadFailed")));
  }, [profile.id, profile.completed_courses.length, scenario]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    onAsk(question.trim());
    setQuestion("");
  }

  const name = profile.display_name?.replace(/\s*\(demo\)$/, "");
  const top = data?.roles[0];
  const current = data?.roles.find((r) => r.is_current_role) ?? data?.current_role ?? null;
  const audience = profile.audience ?? "worker";
  const entryRoles = data?.roles.filter((r) => r.why.entry_points > 0).slice(0, 3) ?? [];
  const robust = data?.roles.filter((r) => r.robust_pick) ?? [];
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short", year: "numeric" });

  return (
    <section className="home">
      <div className="page-head">
        <h1>{name ? tf("home.helloName", { g: greeting(), name }) : tf("home.hello", { g: greeting() })}</h1>
        <p className="muted">{t("home.sub")} {today}.</p>
      </div>
      <form className="home-ask" onSubmit={submit}>
        <label className="sr-only" htmlFor="home-q">{t("shell.coach")}</label>
        <input id="home-q" type="text" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("home.askPlaceholder")} />
        <button className="primary" type="submit" disabled={!question.trim()}>{t("a.ask")}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {data && <DataBanner illustrative={data.signal_source.illustrative} imported={data.signal_source.imported} />}

      {data && top && audience === "worker" && current && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.workerTitle")}</span>
          <strong>{tr(current.title)}: <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]}</span> {signed(current.outlook[scenario].index)}%</strong>
          <p className="muted">{t("lead.workerBody")}</p>
          <button className="btn quiet sm" onClick={() => onGo("tasks")}>{t("nav.tasks")} →</button>
        </div>
      )}
      {data && audience !== "graduate" && current && <TippingPoints profileId={profile.id} />}
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
          <button className="btn quiet sm" onClick={() => onOpenRole(top)}>{tr(top.title)} →</button>
        </div>
      )}
      {data && top && (
        <div className="home-kpis">
          <div className="kpi">
            <span className="kpi-label">{t("k.top")} <InfoTip term="gl.fit" label={t("gl.fitShort")} /></span><strong>{tr(top.title)}</strong>
            <span className="badge good">{percent(top.fit)}% {t("k.fit")}</span>
            <span className="kpi-foot">{OUTLOOK_TEXT[top.outlook[scenario].label]} · {tf("home.toYear", { n: signed(top.outlook[scenario].index), year: data.signal_source.horizon_year })}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t("k.current")} <InfoTip term="gl.outlook" label={t("gl.outlookShort")} /></span>
            <strong>{current ? `${signed(current.outlook[scenario].index)}%` : t("k.notSet")}</strong>
            {current
              ? <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]}</span>
              : <span className="badge">{audience === "graduate" ? t("lead.openToGrads") : t("home.addJob")}</span>}
            <span className="kpi-foot">{current ? tr(current.title) : audience === "graduate" ? t("lead.gradBody") : t("home.addJobWhy")}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t("k.robust")} <InfoTip term="gl.robust" label={t("card.robust")} /></span><strong>{robust.length}</strong>
            <span className="badge">{t("k.robustNote")}</span>
            <span className="kpi-foot">{robust.slice(0, 2).map((r) => tr(r.title)).join(", ") || t("home.noneYet")}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t("home.skillsOn")}</span><strong>{profile.skills.length}</strong>
            <span className="badge">{tf("home.coursesDone", { n: profile.completed_courses.length })}</span>
            <span className="kpi-foot">{tf("home.stillNeeded", { n: top.missing.length })}</span>
          </div>
        </div>
      )}

      {data && (
        <div className="home-grid">
          <div className="card home-roles">
            <div className="home-roles-head">
              <h2>{t("home.bestRoles")}</h2>
              <div className="segmented" role="radiogroup" aria-label={t("home.scenarioAria")}>
                {SCENARIOS.map((s) => (
                  <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
                ))}
              </div>
              <p className="muted scenario-note">{tr(data.scenario.description)}</p>
            </div>
            <ol className="home-list">
              {data.roles.slice(0, 5).map((r) => (
                <li key={r.role_id}>
                  <button className="home-role" onClick={() => onOpenRole(r)}>
                    <span className="rank">#{r.rank}</span>
                    <span className="home-role-title">{tr(r.title)}{r.robust_pick && <span className="badge gold">{t("home.robust")}</span>}</span>
                    <span className="fit" role="img" aria-label={tf("card.fitAria", { n: percent(r.fit) })}><span style={{ width: `${r.fit * 100}%` }} /></span>
                    <span className={`badge ${OUTLOOK_TONE[r.outlook[scenario].label]}`}>{OUTLOOK_TEXT[r.outlook[scenario].label]}</span>
                  </button>
                </li>
              ))}
            </ol>
            <button className="link" onClick={() => onGo("roles")}>{tf("home.seeAll", { n: data.roles.length })} →</button>
          </div>

          <aside className="home-next">
            <p className="eyebrow">{t("home.next")}</p>
            {top && (
              <div className="card next-card">
                <span className="next-tag">{t("home.tagPathway")}</span>
                <strong>{tf("home.buildFor", { role: tr(top.title) })}</strong>
                <div className="card-row"><span className="muted">{tf("home.toLearn", { n: top.missing.length })}</span><button className="btn sm" onClick={() => onOpenRole(top)}>{t("home.open")}</button></div>
              </div>
            )}
            <div className="card next-card">
              <span className="next-tag">{t("home.tagSignals")}</span>
              <strong>{t("home.rising")}</strong>
              <div className="card-row"><span className="muted">{t("home.risingSub")}</span><button className="btn sm" onClick={() => onGo("radar")}>{t("home.open")}</button></div>
            </div>
            <div className="card next-card">
              <span className="next-tag">{t("home.tagJob")}</span>
              <strong>{t("home.tick")}</strong>
              <div className="card-row"><span className="muted">{t("home.tickSub")}</span><button className="btn sm" onClick={() => onGo("tasks")}>{t("home.open")}</button></div>
            </div>
          </aside>
        </div>
      )}
      {!data && !error && <div className="grid" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>}
      {data && <p className="source">{tf("home.forecast", { id: data.signal_source.snapshot_id, date: data.signal_source.imported })} {t("shell.estimates")}</p>}
    </section>
  );
}
