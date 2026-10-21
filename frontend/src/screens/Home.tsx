import { FormEvent, useEffect, useState } from "react";
import { TippingPoints } from "../components/AdoptionSlider";
import { DataBanner } from "../components/DataBanner";
import { InfoTip } from "../components/InfoTip";
import { api, Matches, Profile, RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t } from "../lib/i18n";
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
      .catch(() => setError("Couldn't load your results. Check your connection and try again."));
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
        <h1>{greeting()}{name ? `, ${name}` : ""}.</h1>
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
          <strong>{current.title}: <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]}</span> {signed(current.outlook[scenario].index)}%</strong>
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
            <button key={r.role_id} className="btn quiet sm" onClick={() => onOpenRole(r)}>{r.title} · {percent(r.fit)}%</button>
          ))}</div>
        </div>
      )}
      {data && top && audience === "switcher" && current && (
        <div className="card lead">
          <span className="kpi-label">{t("lead.switchTitle")}</span>
          <strong>{current.title}: {OUTLOOK_TEXT[current.outlook[scenario].label]} {signed(current.outlook[scenario].index)}%</strong>
          <p className="muted">{t("lead.switchBody")} <strong>{top.title}</strong>:</p>
          <div className="chips">{top.carry_over.length
            ? top.carry_over.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)
            : <span className="muted">{t("lead.noCarry")}</span>}</div>
          <button className="btn quiet sm" onClick={() => onOpenRole(top)}>{top.title} →</button>
        </div>
      )}
      {data && top && (
        <div className="home-kpis">
          <div className="kpi">
            <span className="kpi-label">{t("k.top")} <InfoTip term="gl.fit" label="skill fit" /></span><strong>{top.title}</strong>
            <span className="badge good">{percent(top.fit)}% {t("k.fit")}</span>
            <span className="kpi-foot">{OUTLOOK_TEXT[top.outlook[scenario].label]} · {signed(top.outlook[scenario].index)}% to {data.signal_source.horizon_year}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t("k.current")} <InfoTip term="gl.outlook" label="outlook" /></span>
            <strong>{current ? `${signed(current.outlook[scenario].index)}%` : t("k.notSet")}</strong>
            {current
              ? <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]}</span>
              : <span className="badge">{audience === "graduate" ? t("lead.openToGrads") : "Add it on My profile"}</span>}
            <span className="kpi-foot">{current ? current.title : audience === "graduate" ? t("lead.gradBody") : "Lets us compare your job with the alternatives"}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">{t("k.robust")} <InfoTip term="gl.robust" label="robust pick" /></span><strong>{robust.length}</strong>
            <span className="badge">{t("k.robustNote")}</span>
            <span className="kpi-foot">{robust.slice(0, 2).map((r) => r.title).join(", ") || "None yet"}</span>
          </div>
          <div className="kpi">
            <span className="kpi-label">Skills on your profile</span><strong>{profile.skills.length}</strong>
            <span className="badge">{profile.completed_courses.length} {profile.completed_courses.length === 1 ? "course" : "courses"} finished</span>
            <span className="kpi-foot">{top.missing.length} still needed for your top match</span>
          </div>
        </div>
      )}

      {data && (
        <div className="home-grid">
          <div className="card home-roles">
            <div className="card-row">
              <div><h2>Your best next roles</h2><p className="muted">{data.scenario.description}</p></div>
              <div className="segmented" role="radiogroup" aria-label="AI adoption scenario">
                {SCENARIOS.map((s) => (
                  <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(`sc.${s.id}`)}</button>
                ))}
              </div>
            </div>
            <ol className="home-list">
              {data.roles.slice(0, 5).map((r) => (
                <li key={r.role_id}>
                  <button className="home-role" onClick={() => onOpenRole(r)}>
                    <span className="rank">#{r.rank}</span>
                    <span className="home-role-title">{r.title}{r.robust_pick && <span className="badge gold">Robust</span>}</span>
                    <span className="fit" role="img" aria-label={`Fit ${percent(r.fit)} percent`}><span style={{ width: `${r.fit * 100}%` }} /></span>
                    <span className={`badge ${OUTLOOK_TONE[r.outlook[scenario].label]}`}>{OUTLOOK_TEXT[r.outlook[scenario].label]}</span>
                  </button>
                </li>
              ))}
            </ol>
            <button className="link" onClick={() => onGo("roles")}>See all {data.roles.length} roles →</button>
          </div>

          <aside className="home-next">
            <p className="eyebrow">{t("home.next")}</p>
            {top && (
              <div className="card next-card">
                <span className="next-tag">Pathway</span>
                <strong>Build a plan for {top.title}</strong>
                <div className="card-row"><span className="muted">{top.missing.length} skills to learn</span><button className="btn sm" onClick={() => onOpenRole(top)}>Open</button></div>
              </div>
            )}
            <div className="card next-card">
              <span className="next-tag">Signals</span>
              <strong>See which of your skills are rising</strong>
              <div className="card-row"><span className="muted">Research and job postings</span><button className="btn sm" onClick={() => onGo("radar")}>Open</button></div>
            </div>
            <div className="card next-card">
              <span className="next-tag">Your job</span>
              <strong>Tick the tasks you do today</strong>
              <div className="card-row"><span className="muted">Automate, assist or human</span><button className="btn sm" onClick={() => onGo("tasks")}>Open</button></div>
            </div>
          </aside>
        </div>
      )}
      {!data && !error && <div className="grid" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>}
      {data && <p className="source">Forecast: {data.signal_source.snapshot_id}, imported {data.signal_source.imported}. {t("shell.estimates")}</p>}
    </section>
  );
}
