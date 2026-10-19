// Screens follow docs/03-APP_FLOW.md: S0 Landing, S1 Intake, S2 Review, S3 Roles, S4/S5 Gap + Pathway, S6 Impact.
// Navigation is component state for now; task 3.5 moves it to real routes.
import { useEffect, useMemo, useState } from "react";
import { LogoMark, Rosette } from "./brand";
import { api, Matches, Pathway, Profile, Radar as RadarData, RefreshStatus, RoleMatch, RoleOption, Scenario, Sdg, Skill } from "./api";

type Screen = "landing" | "intake" | "review" | "radar" | "roles" | "role" | "impact";
const PROFILE_KEY = "laluan.profileId";
const THEME_KEY = "laluan.theme";
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "slow", label: "Slow" },
  { id: "baseline", label: "Baseline" },
  { id: "accelerated", label: "Accelerated" },
];
const OUTLOOK_TONE: Record<string, string> = { emerging: "good", growing: "good", stable: "", declining: "risk" };
const OUTLOOK_TEXT: Record<string, string> = {
  emerging: "▲ Emerging", growing: "▲ Growing", stable: "▬ Stable", declining: "▼ Declining",
};

type Theme = "light" | "dark";

// A theme is remembered only once the person picks one; until then the system setting wins.
function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* private mode */ }
  return null;
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredProfileId(): string | null {
  try { return localStorage.getItem(PROFILE_KEY); } catch { return null; }
}
function storeProfileId(id: string | null) {
  try { id ? localStorage.setItem(PROFILE_KEY, id) : localStorage.removeItem(PROFILE_KEY); } catch { /* private mode */ }
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [role, setRole] = useState<RoleMatch | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const storedId = readStoredProfileId();
  const [model, setModel] = useState<string | null>(null);
  const [chosenTheme, setChosenTheme] = useState<Theme | null>(savedTheme);
  const theme = chosenTheme ?? systemTheme();
  useEffect(() => {
    if (chosenTheme) document.documentElement.dataset.theme = chosenTheme;
    else delete document.documentElement.dataset.theme;
  }, [chosenTheme]);
  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChosenTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* private mode */ }
  }
  useEffect(() => { api.health().then((h) => setModel(h.llm_model)).catch(() => undefined); }, []);

  async function openDemo(key: string) {
    setError(null);
    try {
      const p = await api.demoProfile(key);
      storeProfileId(p.id); setProfile(p); setScreen("roles");
    } catch { setError("Can't reach the server. Is the backend running on port 8000?"); }
  }
  async function resume() {
    if (!storedId) return;
    try { setProfile(await api.getProfile(storedId)); setScreen("roles"); }
    catch { storeProfileId(null); setError("That saved profile has expired. Start again."); }
  }

  const deleteProfile = async () => {
    if (!profile) return;
    await api.deleteProfile(profile.id).catch(() => undefined);
    storeProfileId(null); setProfile(null); setRole(null); setScreen("landing");
  };
  const themeButton = (
    <button className="icon-btn" onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );

  if (screen === "landing") {
    return (
      <div className="site">
        <div className="announce">Judging Laluan? <button onClick={() => openDemo("clerk")}>Open the demo profile in one click →</button></div>
        <nav className="site-nav" aria-label="Main">
          <button className="brand" onClick={() => setScreen("landing")} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
          <div className="site-nav-actions">
            {themeButton}
            {storedId && <button className="btn quiet sm" onClick={resume}>Continue</button>}
            <button className="btn ink sm" onClick={() => setScreen("intake")}>Get started</button>
          </div>
        </nav>
        {error && <div className="banner error" role="alert">{error}</div>}
        <Landing onStart={() => setScreen("intake")} onDemo={openDemo} />
        <footer className="site-footer">
          <span>Forecasts are estimates under different scenarios, not predictions. Laluan supports your career decision; it never makes it.</span>
          {model && <span>AI model: {model}</span>}
        </footer>
      </div>
    );
  }

  const groups: { label: string | null; items: { id: Screen; label: string; icon: IconName; enabled: boolean }[] }[] = [
    { label: null, items: [{ id: "intake", label: "My profile", icon: "user", enabled: true }] },
    { label: "Signals", items: [{ id: "radar", label: "Future Skills Radar", icon: "radar", enabled: !!profile }] },
    { label: "My future", items: [
      { id: "roles", label: "Future roles", icon: "briefcase", enabled: !!profile },
      { id: "role", label: "Pathway", icon: "route", enabled: !!role },
      { id: "impact", label: "SDG impact", icon: "globe", enabled: !!role },
    ] },
  ];
  const current = screen === "review" ? "intake" : screen;
  const title = { intake: "My profile", review: "My profile", radar: "Future Skills Radar", roles: "Future roles", role: "Pathway", impact: "SDG impact", landing: "" }[screen];
  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setScreen("landing")} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
        {profile && (
          <div className="who">
            <span className="avatar" aria-hidden="true">{(profile.display_name ?? "You").slice(0, 1)}</span>
            <span><strong>{profile.display_name ?? "Your profile"}</strong><small>{profile.skills.length} skills</small></span>
          </div>
        )}
        <nav className="side-nav" aria-label="Sections">
          {groups.map((g) => (
            <div key={g.label ?? "top"} className="side-group">
              {g.label && <div className="side-label">{g.label}</div>}
              {g.items.map((item) => (
                <button key={item.id} className={current === item.id ? "side-link is-current" : "side-link"}
                  aria-current={current === item.id ? "page" : undefined} disabled={!item.enabled}
                  onClick={() => setScreen(item.id)}>
                  <Icon name={item.icon} />{item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          {model && <p className="side-note">AI model: {model}</p>}
          <p className="side-note">Estimates, not predictions. You decide.</p>
          {profile && <button className="side-link danger" onClick={deleteProfile}><Icon name="trash" />Delete my profile</button>}
        </div>
      </aside>
      <div className="workspace">
        <header className="workbar">
          <span className="workbar-title">{title}</span>
          <div className="workbar-actions">
            {profile?.story && <span className="badge">{profile.display_name}</span>}
            {themeButton}
          </div>
        </header>
        {error && <div className="banner error" role="alert">{error}</div>}
        <main>
          {screen === "intake" && <Intake onDone={(skills) => { setDraftSkills(skills); setScreen("review"); }} />}
          {screen === "review" && (
            <Review initial={draftSkills} onSaved={(p) => { storeProfileId(p.id); setProfile(p); setScreen("radar"); }} />
          )}
          {screen === "radar" && profile && <Radar profile={profile} onNext={() => setScreen("roles")} />}
          {screen === "roles" && profile && (
            <Roles profile={profile} scenario={scenario} setScenario={setScenario}
              onOpen={(r) => { setRole(r); setScreen("role"); }} />
          )}
          {screen === "role" && profile && role && (
            <RoleDetail profile={profile} role={role} scenario={scenario} onImpact={() => setScreen("impact")} />
          )}
          {screen === "impact" && role && <Impact role={role} />}
        </main>
      </div>
    </div>
  );
}

function Landing({ onStart, onDemo }: { onStart: () => void; onDemo: (k: string) => void }) {
  return (
    <main className="landing">
      <header className="lv-hero">
        <Rosette className="hero-rosette" />
        <p className="pill-tag">Career guidance for Malaysia's AI era</p>
        <h1>See where your career goes before AI changes it.</h1>
        <p className="lede">Laluan reads your skills, tracks dated AI-research and job-market signals, ranks the roles you can grow into under three futures, and plans free or low-cost courses to get there. You make the call.</p>
        <div className="ctas">
          <button className="btn ink" onClick={() => onDemo("clerk")}>Open the demo profile</button>
          <button className="btn quiet" onClick={onStart}>Start with my skills</button>
        </div>
        <button className="link" onClick={() => onDemo("student")}>Or try the student demo</button>
      </header>
      <div className="lv-preview" aria-hidden="true">
        <div className="preview-card">
          <div className="preview-head"><span className="preview-title">Future roles for Aisyah, data-entry clerk</span><span className="badge">Example view</span></div>
          <div className="seg-track"><span>Slow</span><span className="on">Baseline</span><span>Accelerated</span></div>
          <ol className="preview-list">
            <li><span>AI operations specialist</span><span className="badge good">Emerging</span></li>
            <li><span>Sustainability and ESG analyst</span><span className="badge good">Growing</span></li>
            <li><span>Data analyst</span><span className="badge good">Growing</span></li>
            <li className="dim"><span>Data entry clerk</span><span className="badge risk">Declining</span></li>
          </ol>
          <div className="preview-note"><span className="dot" /><div><strong>Robust pick</strong><span>Stays in her top five in every scenario.</span></div></div>
        </div>
      </div>
      <section className="lv-section">
        <h2>Made for the people AI is changing first. <span>Clerks, service staff, graduates and the HR teams planning their next move.</span></h2>
        <div className="pillars">
          <div className="pillar"><span className="pillar-icon"><Icon name="radar" /></span><h3>Future Skills Radar</h3><p>Which skills are rising or declining, built from research papers and real job postings, each with its source and date.</p></div>
          <div className="pillar"><span className="pillar-icon"><Icon name="briefcase" /></span><h3>Matches you can check</h3><p>Every rank shows how much comes from your skills, the outlook and the goals you care about.</p></div>
          <div className="pillar"><span className="pillar-icon"><Icon name="route" /></span><h3>A plan you can start this week</h3><p>Ordered free or low-cost courses with hours, each linked to the UN Sustainable Development Goals.</p></div>
        </div>
      </section>
    </main>
  );
}

function Intake({ onDone }: { onDone: (skills: string[]) => void }) {
  const [tab, setTab] = useState<"cv" | "pick">("cv");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => { api.skills().then(setAllSkills).catch(() => setError("Can't load the skill list.")); }, []);

  async function read() {
    setBusy(true); setError(null);
    try { onDone((await api.extract(text)).skills); }
    catch { setError("We couldn't read that. Try picking skills from the list instead."); }
    finally { setBusy(false); }
  }
  return (
    <section>
      <div className="page-head"><h1>Your skills</h1></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "cv"} onClick={() => setTab("cv")}>Paste CV</button>
        <button role="tab" aria-selected={tab === "pick"} onClick={() => setTab("pick")}>Pick skills</button>
        {/* Task 3.7: guided chat tab using POST /api/intake/turn */}
      </div>
      {tab === "cv" ? (
        <>
          <label htmlFor="cv">Paste your CV or describe your work (at least 50 characters)</label>
          <textarea id="cv" rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="primary" disabled={busy || text.trim().length < 50} onClick={read}>
            {busy ? "Reading…" : "Read my skills"}
          </button>
        </>
      ) : (
        <>
          <div className="chips">
            {allSkills.map((s) => (
              <button key={s.id} className={picked.includes(s.id) ? "chip covered" : "chip"} aria-pressed={picked.includes(s.id)}
                onClick={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])}>
                {s.name}
              </button>
            ))}
          </div>
          <button className="primary" disabled={picked.length < 3} onClick={() => onDone(picked)}>
            {picked.length < 3 ? "Pick at least 3 skills" : `Continue with ${picked.length} skills`}
          </button>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Review({ initial, onSaved }: { initial: string[]; onSaved: (p: Profile) => void }) {
  const [skills, setSkills] = useState(initial);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [sdgs, setSdgs] = useState<Sdg[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [interests, setInterests] = useState<number[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [years, setYears] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.skills().then(setAllSkills).catch(() => undefined);
    api.sdgs().then(setSdgs).catch(() => undefined);
    api.roles().then(setRoles).catch(() => undefined);
  }, []);
  const name = (id: string) => allSkills.find((s) => s.id === id)?.name ?? id;
  async function save() {
    try {
      onSaved(await api.createProfile({
        display_name: null, current_role_id: currentRole || null, skills, interests,
        experience_years: years === "" ? null : Number(years),
      }));
    }
    catch { setError("Couldn't save your profile. Try again."); }
  }
  return (
    <section>
      <div className="page-head"><h1>Check your skills</h1></div>
      {skills.length === 0 && <p>We didn't find any skills. Go back and pick them from the list.</p>}
      <div className="chips">
        {skills.map((id) => (
          <span key={id} className="chip covered">{name(id)}
            <button aria-label={`Remove ${name(id)}`} onClick={() => setSkills(skills.filter((s) => s !== id))}>×</button>
          </span>
        ))}
      </div>
      <div className="two-col">
        <label>Current or most recent job
          <select value={currentRole} onChange={(e) => setCurrentRole(e.target.value)}>
            <option value="">Not working yet / not listed</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
        <label>Years of work experience
          <input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Which goals matter to you? Roles that serve them move up your list.</legend>
        <div className="chips">
          {sdgs.map((g) => (
            <button key={g.number} className={interests.includes(g.number) ? "chip covered" : "chip"} aria-pressed={interests.includes(g.number)}
              onClick={() => setInterests(interests.includes(g.number) ? interests.filter((n) => n !== g.number) : [...interests, g.number])}>
              <span className="sdg small" style={{ background: g.colour }}>{g.number}</span>{g.name}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="primary" disabled={skills.length === 0} onClick={save}>See my future roles</button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function Roles({ profile, scenario, setScenario, onOpen }: {
  profile: Profile; scenario: Scenario; setScenario: (s: Scenario) => void; onOpen: (r: RoleMatch) => void;
}) {
  const [data, setData] = useState<Matches | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[] | null>(null);
  useEffect(() => {
    api.matches(profile.id, scenario).then(setData).catch(() => setError("Couldn't update scenario."));
  }, [profile.id, scenario]);
  async function afterRefresh() {
    const before = data;
    const after = await api.matches(profile.id, scenario);
    setData(after);
    if (before) setChanges(compare(before, after, scenario));
  }
  return (
    <section>
      <div className="page-head">
        <h1>Your future roles</h1>
        {profile.story && <p className="muted">{profile.display_name}: {profile.story}</p>}
      </div>
      {data && <Kpis data={data} scenario={scenario} />}
      <div className="segmented" role="radiogroup" aria-label="AI adoption scenario">
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => setScenario(s.id)}>{s.label}</button>
        ))}
      </div>
      {data && <p className="muted">{data.scenario.description}</p>}
      {data?.signal_source.illustrative && (
        <div className="banner warning">Illustrative seed data. Replace it with real figures before the demo.</div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <RefreshPanel onDone={afterRefresh} />
      {changes && <WhatChanged changes={changes} snapshot={data?.signal_source.snapshot_id ?? ""} onClose={() => setChanges(null)} />}
      <div className="grid">
        {data?.roles.map((r) => <RoleCard key={r.role_id} role={r} scenario={scenario} onOpen={() => onOpen(r)} />)}
      </div>
      {data && (
        <p className="source">Source: {data.signal_source.source} · published {data.signal_source.published} ·
          imported {data.signal_source.imported} · horizon {data.signal_source.horizon_year}</p>
      )}
    </section>
  );
}

function RoleCard({ role, scenario, onOpen }: { role: RoleMatch; scenario: Scenario; onOpen: () => void }) {
  const o = role.outlook[scenario];
  const move = role.rank_change_vs_baseline;
  return (
    <button className={role.at_risk ? "card at-risk" : "card"} onClick={onOpen}>
      <div className="card-head">
        <span className="rank">#{role.rank}{move > 0 ? ` ▲${move}` : move < 0 ? ` ▼${-move}` : ""}</span>
        {role.robust_pick && <span className="badge gold">Robust pick</span>}
        {role.is_current_role && <span className="badge">Your current role</span>}
      </div>
      <h3>{role.title}</h3>
      <div className="fit" aria-label={`Fit ${Math.round(role.fit * 100)} percent`}>
        <div style={{ width: `${role.fit * 100}%` }} />
      </div>
      <div className="card-row"><span className="fit-num">{Math.round(role.fit * 100)}% fit</span><span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span></div>
      <p className="muted">Estimate to {role.estimate_range.horizon_year}: {signed(role.estimate_range.low)}% to {signed(role.estimate_range.high)}% jobs across scenarios</p>
      {role.why.sdg_points > 0 && <span className="badge good">Serves your goals: SDG {role.why.matched_sdgs.join(", ")}</span>}
      <Sdgs sdgs={role.sdgs} />
      <span className="source">Source: {role.citation.snapshot_id} (imported {role.citation.imported})</span>
    </button>
  );
}

function Sdgs({ sdgs }: { sdgs: RoleMatch["sdgs"] }) {
  return (
    <div className="sdgs">
      {sdgs.map((g) => (
        <span key={g.number} className="sdg" style={{ background: g.colour }} title={`SDG ${g.number} ${g.name}`}
          aria-label={`SDG ${g.number} ${g.name}`}>{g.number}</span>
      ))}
    </div>
  );
}

function RoleDetail({ profile, role, scenario, onImpact }: { profile: Profile; role: RoleMatch; scenario: Scenario; onImpact: () => void }) {
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [busy, setBusy] = useState(false);
  const outlookRows = useMemo(
    () => SCENARIOS.map((s) => ({ id: s.id, name: s.label, outlook: role.outlook[s.id].label, index: role.outlook[s.id].index })),
    [role],
  );
  async function build() {
    setBusy(true);
    try { setPlan(await api.pathway(profile.id, role.role_id)); } finally { setBusy(false); }
  }
  return (
    <section>
      <div className="page-head"><h1>{role.title}</h1><p className="muted">{role.summary}</p></div>
      <details className="card why" open>
        <summary>Why this rank? Score {role.why.score.toFixed(2)}</summary>
        <ul>
          <li>Skill fit {Math.round(role.why.fit * 100)}% × 0.6 = <strong>{role.why.fit_points.toFixed(2)}</strong></li>
          <li>Outlook in this scenario, scaled 0–1, × 0.4 = <strong>{role.why.outlook_points.toFixed(2)}</strong></li>
          <li>Serves a goal you chose: <strong>+{role.why.sdg_points.toFixed(2)}</strong>{role.why.matched_sdgs.length > 0 && ` (SDG ${role.why.matched_sdgs.join(", ")})`}</li>
        </ul>
        <p className="source">Outlook source: {role.citation.snapshot_id}, imported {role.citation.imported}{role.citation.note && ` · ${role.citation.note}`}</p>
      </details>
      <table className="outlooks">
        <caption>Outlook in each scenario (current: {scenario})</caption>
        <tbody>{outlookRows.map((r) => (
          <tr key={r.id}><th scope="row">{r.name}</th><td className={`outlook ${r.outlook}`}>{OUTLOOK_TEXT[r.outlook]}</td><td>{r.index > 0 ? "+" : ""}{r.index}%</td></tr>
        ))}</tbody>
      </table>
      <div className="two-col">
        <div><h3>You have</h3><div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)}</div></div>
        <div><h3>You need</h3><div className="chips">{role.missing.map((s) => <span key={s.skill_id} className="chip missing">{s.name}{s.weight === 3 ? " (core)" : ""}</span>)}</div></div>
      </div>
      {role.missing.length === 0 ? <p>You already have every core skill for this role.</p> : !plan && (
        <button className="primary" disabled={busy} onClick={build}>{busy ? "Building your plan…" : "Build my pathway"}</button>
      )}
      {plan && (
        <>
          <h3>Your pathway: {plan.steps.length} steps, about {plan.total_hours} hours</h3>
          <p>{plan.summary}</p>
          {plan.grounding && (
            <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
              {plan.grounding.all_supported ? "Every sentence is backed by the course catalogue" : `Check sentences ${plan.grounding.unsupported.join(", ")}: not found in the catalogue`}
            </p>
          )}
          <ol className="steps">
            {plan.steps.map((s) => (
              <li key={s.step} className="card">
                <strong>{s.skills.map((k) => k.name).join(", ")}</strong>
                <span>{s.course.url ? <a href={s.course.url} target="_blank" rel="noreferrer">{s.course.title}</a> : s.course.title} · {s.course.provider}</span>
                <span className="muted">{s.course.hours} h · {s.course.level} · {s.course.cost.replace("_", " ")} · {s.why}</span>
              </li>
            ))}
          </ol>
          <button className="primary" onClick={onImpact}>See my impact</button>
          <button onClick={() => window.print()}>Print summary</button>
        </>
      )}
    </section>
  );
}

function Impact({ role }: { role: RoleMatch }) {
  return (
    <section>
      <div className="page-head"><h1>Your impact as a {role.title}</h1></div>
      <div className="grid">
        {role.sdgs.map((g) => (
          <div key={g.number} className="card sdg-card" style={{ borderTopColor: g.colour }}>
            <span className="sdg" style={{ background: g.colour }}>{g.number}</span>
            <h3>SDG {g.number}: {g.name}</h3>
            {g.target && <span className="muted">Target {g.target}</span>}
            <p>{g.reason}</p>
          </div>
        ))}
      </div>
      {/* Task 3.6: skill-level SDG tags from GET /api/roles/{id} (skill_sdgs) */}
    </section>
  );
}

function signed(n: number) {
  return `${n > 0 ? "+" : ""}${n}`;
}

const TREND_TEXT: Record<string, string> = { rising: "▲ Rising", steady: "▬ Steady", declining: "▼ Declining", no_data: "No data" };

function Radar({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const [data, setData] = useState<RadarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.radar(profile.id).then(setData).catch(() => setError("Couldn't load the radar.")); }, [profile.id]);
  if (error) return <section><p className="error" role="alert">{error}</p></section>;
  if (!data) return <section><p className="muted">Loading the radar…</p></section>;
  const groups = (["rising", "steady", "declining"] as const).map((label) => ({
    label, skills: data.skills.filter((s) => s.label === label),
  }));
  const noData = data.skills.filter((s) => s.label === "no_data");
  return (
    <section>
      <div className="page-head"><h1>Which skills are rising and declining</h1>
      <p className="muted">Estimates from research and job-posting trends, not predictions. Your skills are marked.</p></div>
      {data.illustrative && <div className="banner warning">The baseline forecast is illustrative seed data until the team replaces it with WEF figures.</div>}
      {data.skills.length === 0 ? (
        <div className="banner warning">This forecast has no skill trends yet. An admin can run <strong>Refresh trend data</strong> on the Roles screen to pull the latest research and job-posting data.</div>
      ) : (
        <div className="radar">
          {groups.map((g) => (
            <div key={g.label} className={`radar-col ${g.label}`}>
              <h3 className={`outlook ${g.label === "rising" ? "growing" : g.label}`}>{TREND_TEXT[g.label]} ({g.skills.length})</h3>
              <ul>
                {g.skills.map((s) => (
                  <li key={s.skill_id} className={s.mine ? "mine" : ""} title={s.sources.join("\n")}>
                    <span>{s.name}{s.mine && <span className="badge">Yours</span>}</span>
                    <span className="muted">{s.trend !== null ? `${s.trend > 0 ? "+" : ""}${Math.round(s.trend * 100)}%` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {noData.length > 0 && (
        <details><summary className="muted">{noData.length} skills have no data in these sources</summary>
          <p className="muted">{noData.map((s) => s.name).join(", ")}. The job-posting source is tech-heavy, so we show "no data" instead of guessing.</p>
        </details>
      )}
      {data.capability_momentum.some((c) => c.momentum !== null) && (
        <div className="card">
          <h3>AI capabilities: research momentum</h3>
          <p className="muted">Paper growth compared with AI research overall. Above zero means accelerating faster than average.</p>
          <ul className="momentum">
            {data.capability_momentum.map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <span className="bar"><span style={{ width: `${Math.abs(c.momentum ?? 0) * 50}%`, marginLeft: (c.momentum ?? 0) < 0 ? `${50 - Math.abs(c.momentum ?? 0) * 50}%` : "50%" }} className={(c.momentum ?? 0) < 0 ? "neg" : "pos"} /></span>
                <span className="muted">{c.momentum !== null ? signed(Math.round(c.momentum * 100) / 100) : "–"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="source">Snapshot {data.snapshot_id} · imported {data.imported}
        {data.inputs.map((i) => <span key={i.source}> · {i.source} (retrieved {i.retrieved})</span>)}</p>
      <button className="primary" onClick={onNext}>See my future roles</button>
    </section>
  );
}

const TOKEN_KEY = "laluan.adminToken";

function RefreshPanel({ onDone }: { onDone: () => Promise<void> }) {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } });
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function start(force: boolean) {
    setError(null);
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
    try { setStatus(await api.refreshStart(token, force)); }
    catch (e) { setError(String(e).includes("401") ? "Admin token required." : "Couldn't start the refresh."); return; }
    for (;;) {
      await new Promise((r) => setTimeout(r, 1000));
      const s = await api.refreshStatus(token);
      setStatus(s);
      if (s.state !== "running") {
        if (s.state === "done") await onDone();
        return;
      }
    }
  }
  const running = status?.state === "running";
  return (
    <details className="card admin">
      <summary>Admin: refresh trend data</summary>
      <p className="muted">Pulls the latest AI research counts (arXiv, or OpenAlex if arXiv is busy) and job-posting counts, then saves a new dated forecast. Older forecasts are kept.</p>
      <label>Admin token <input type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <div className="actions">
        <button className="primary" disabled={running || !token} onClick={() => start(false)}>{running ? "Refreshing…" : "Refresh trend data"}</button>
        <button disabled={running || !token} onClick={() => start(true)}>Collect again (slower)</button>
      </div>
      {status && status.steps.length > 0 && <ol className="muted steps-log">{status.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      {status?.state === "failed" && <p className="error" role="alert">Refresh failed: {status.error}. The previous forecast is still in use.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </details>
  );
}

interface Change { role_id: string; title: string; before: number; after: number; outlookBefore: number; outlookAfter: number }

function compare(before: Matches, after: Matches, scenario: Scenario): Change[] {
  const old = new Map(before.roles.map((r) => [r.role_id, r]));
  return after.roles
    .map((r) => {
      const o = old.get(r.role_id)!;
      return { role_id: r.role_id, title: r.title, before: o.rank, after: r.rank,
        outlookBefore: o.outlook[scenario].index, outlookAfter: r.outlook[scenario].index };
    })
    .filter((c) => c.before !== c.after || Math.abs(c.outlookAfter - c.outlookBefore) >= 0.5)
    .sort((a, b) => Math.abs(b.outlookAfter - b.outlookBefore) - Math.abs(a.outlookAfter - a.outlookBefore));
}

function WhatChanged({ changes, snapshot, onClose }: { changes: Change[]; snapshot: string; onClose: () => void }) {
  return (
    <div className="card changed" role="status">
      <p className="eyebrow">New trend data · {snapshot}</p>
      <h3>{changes.length === 0 ? "Nothing changed for you" : "Your plan changed because the trend data changed"}</h3>
      <ul>
        {changes.slice(0, 6).map((c) => (
          <li key={c.role_id}>
            <strong>{c.title}</strong>: rank #{c.before} → #{c.after}, outlook {signed(c.outlookBefore)}% → {signed(c.outlookAfter)}%
          </li>
        ))}
      </ul>
      <button className="link" onClick={onClose}>Dismiss</button>
    </div>
  );
}

type IconName = "user" | "radar" | "briefcase" | "route" | "globe" | "trash" | "sun" | "moon";
const ICONS: Record<IconName, string> = {
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
};

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

function Kpis({ data, scenario }: { data: Matches; scenario: Scenario }) {
  const top = data.roles[0];
  const robust = data.roles.filter((r) => r.robust_pick).length;
  const current = data.roles.find((r) => r.is_current_role);
  return (
    <div className="kpis">
      <div className="kpi"><span className="kpi-label">Top match</span><strong>{top?.title ?? "–"}</strong>
        {top && <span className="badge good">{Math.round(top.fit * 100)}% skill fit</span>}</div>
      <div className="kpi"><span className="kpi-label">Robust picks</span><strong>{robust}</strong>
        <span className="badge">Top five in every scenario</span></div>
      <div className="kpi"><span className="kpi-label">Your current role</span><strong>{current ? `${signed(current.outlook[scenario].index)}%` : "–"}</strong>
        {current ? <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]} to {data.signal_source.horizon_year}</span>
          : <span className="badge">Not set</span>}</div>
      <div className="kpi"><span className="kpi-label">Forecast data</span><strong>{data.signal_source.imported.slice(0, 10)}</strong>
        <span className={`badge ${data.signal_source.illustrative ? "risk" : "good"}`}>{data.signal_source.illustrative ? "Illustrative baseline" : "Cited sources"}</span></div>
    </div>
  );
}
