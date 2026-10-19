// Screens follow docs/03-APP_FLOW.md: S0 Landing, S1 Intake, S2 Review, S3 Roles, S4/S5 Gap + Pathway, S6 Impact.
// Navigation is component state for now; task 3.5 moves it to real routes.
import { Component, ReactNode, useEffect, useMemo, useState } from "react";
import { LogoMark, Rosette } from "./brand";
import { getLang, Lang, LANGS, setLang, t } from "./i18n";
import QRCode from "qrcode";
import { api, ChatTurn, CoachProposal, CoachReply, FutureCard, Matches, Pathway, Workforce, Profile, Radar as RadarData, RefreshStatus, RoleMatch, RoleOption, RoleTasks, Scenario, Sdg, Skill, TaskLabel } from "./api";

type Screen = "landing" | "intake" | "review" | "radar" | "tasks" | "roles" | "role" | "impact" | "workforce";
const PROFILE_KEY = "laluan.profileId";
const LITE_KEY = "laluan.lite";
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

// Entry points (docs/03-APP_FLOW.md): /?card=ID opens a read-only Future Card; /?demo=clerk|student
// opens a demo profile directly; anything else starts on the landing page.
export default function App() {
  const params = new URLSearchParams(window.location.search);
  const cardId = params.get("card");
  return cardId ? <CardPage cardId={cardId} /> : <MainApp demo={params.get("demo")} />;
}

let demoLinkUsed = false;

function MainApp({ demo }: { demo: string | null }) {
  const [screen, setScreen] = useState<Screen>("landing");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [role, setRole] = useState<RoleMatch | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const storedId = readStoredProfileId();
  const [model, setModel] = useState<string | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  async function applyProposal(p: CoachProposal) {
    if (!profile) return;
    if (p.kind === "scenario") { setScenario(p.value as Scenario); setScreen("roles"); }
    else {
      const interests = Array.from(new Set([...profile.interests, Number(p.value)]));
      setProfile(await api.updateProfile({ ...profile, interests }));
      setScreen("roles");
    }
    setToast(`Applied: ${p.label}`);
    window.setTimeout(() => setToast(null), 4000);
  }
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
  const [lang, setLangState] = useState<Lang>(getLang);
  const [lite, setLite] = useState(() => { try { return localStorage.getItem(LITE_KEY) === "1"; } catch { return false; } });
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (lite) document.documentElement.dataset.lite = "1"; else delete document.documentElement.dataset.lite;
    try { localStorage.setItem(LITE_KEY, lite ? "1" : "0"); } catch { /* private mode */ }
  }, [lite]);
  function checkServer() {
    api.health().then((h) => { setModel(h.llm_model); setOffline(false); }).catch(() => setOffline(true));
  }
  useEffect(checkServer, []);
  const langPicker = (
    <label className="lang-picker"><span className="sr-only">{t("shell.language")}</span>
      <select value={lang} onChange={(e) => { setLang(e.target.value as Lang); setLangState(e.target.value as Lang); }}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
  const liteToggle = (
    <label className="check lite-toggle" title={t("shell.liteHelp")}>
      <input type="checkbox" checked={lite} onChange={(e) => setLite(e.target.checked)} /> {t("shell.lite")}
    </label>
  );
  const offlineBanner = offline && (
    <div className="banner error" role="alert">{t("shell.offline")} <button className="link" onClick={checkServer}>{t("shell.retry")}</button></div>
  );
  useEffect(() => {
    if ((demo !== "clerk" && demo !== "student") || demoLinkUsed) return;
    demoLinkUsed = true;  // React dev mode runs effects twice; open one demo profile only
    window.history.replaceState(null, "", window.location.pathname);
    openDemo(demo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="announce">{t("landing.judge")} <button onClick={() => openDemo("clerk")}>{t("landing.judgeCta")}</button></div>
        <nav className="site-nav" aria-label="Main">
          <button className="brand" onClick={() => setScreen("landing")} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
          <div className="site-nav-actions">
            {langPicker}
            {themeButton}
            {storedId && <button className="btn quiet sm" onClick={resume}>{t("landing.continue")}</button>}
            <button className="btn ink sm" onClick={() => setScreen("intake")}>{t("landing.start")}</button>
          </div>
        </nav>
        {offlineBanner}
        {error && <div className="banner error" role="alert">{error}</div>}
        <Landing onStart={() => setScreen("intake")} onDemo={openDemo} />
        <footer className="site-footer">
          <span>{t("landing.footer")}</span>
          {model && <span>{t("shell.model")}: {model}</span>}
          {liteToggle}
        </footer>
      </div>
    );
  }

  const groups: { label: string | null; items: { id: Screen; label: string; icon: IconName; enabled: boolean }[] }[] = [
    { label: null, items: [{ id: "intake", label: t("nav.profile"), icon: "user", enabled: true }] },
    { label: t("nav.signals"), items: [
      { id: "radar", label: t("nav.radar"), icon: "radar", enabled: !!profile },
      { id: "tasks", label: t("nav.tasks"), icon: "list", enabled: !!profile },
    ] },
    { label: t("nav.future"), items: [
      { id: "roles", label: t("nav.roles"), icon: "briefcase", enabled: !!profile },
      { id: "role", label: t("nav.pathway"), icon: "route", enabled: !!role },
      { id: "impact", label: t("nav.impact"), icon: "globe", enabled: !!role },
    ] },
    { label: t("nav.org"), items: [{ id: "workforce", label: t("nav.workforce"), icon: "users", enabled: true }] },
  ];
  const current = screen === "review" ? "intake" : screen;
  const title = { intake: t("nav.profile"), review: t("nav.profile"), radar: t("nav.radar"), tasks: t("nav.tasks"), roles: t("nav.roles"), role: t("nav.pathway"), impact: t("nav.impact"), workforce: t("nav.workforce"), landing: "" }[screen];
  return (
    <div className="shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setScreen("landing")} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
        {profile && (
          <div className="who">
            <span className="avatar" aria-hidden="true">{(profile.display_name ?? "You").slice(0, 1)}</span>
            <span><strong>{profile.display_name ?? t("shell.yourProfile")}</strong><small>{profile.skills.length} {t("shell.skills")}</small></span>
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
          {model && <p className="side-note">{t("shell.model")}: {model}</p>}
          <p className="side-note">{t("shell.estimates")}</p>
          <div className="side-prefs">{langPicker}{liteToggle}</div>
          {profile && <button className="side-link danger" onClick={deleteProfile}><Icon name="trash" />{t("shell.delete")}</button>}
        </div>
      </aside>
      <div className="workspace">
        <header className="workbar">
          <span className="workbar-title">{title}</span>
          <div className="workbar-actions">
            {profile?.story && <span className="badge">{profile.display_name}</span>}
            {profile && <button className="btn sm" onClick={() => setCoachOpen(true)} aria-expanded={coachOpen}><Icon name="chat" />{t("shell.coach")}</button>}
            {themeButton}
          </div>
        </header>
        {offlineBanner}
        {error && <div className="banner error" role="alert">{error}</div>}
        <main>
          <ScreenBoundary key={screen}>
          {screen === "intake" && <Intake onDone={(skills) => { setDraftSkills(skills); setScreen("review"); }} />}
          {screen === "review" && (
            <Review initial={draftSkills} onSaved={(p) => { storeProfileId(p.id); setProfile(p); setScreen("radar"); }} />
          )}
          {screen === "radar" && profile && <Radar profile={profile} onNext={() => setScreen("roles")} />}
          {screen === "tasks" && profile && <TaskView profile={profile} onNext={() => setScreen("roles")} />}
          {screen === "roles" && profile && (
            <Roles profile={profile} scenario={scenario} setScenario={setScenario}
              onOpen={(r) => { setRole(r); setScreen("role"); }} />
          )}
          {screen === "role" && profile && role && (
            <RoleDetail profile={profile} role={role} scenario={scenario} onImpact={() => setScreen("impact")}
              onProfile={setProfile} />
          )}
          {screen === "impact" && role && <Impact role={role} />}
          {screen === "workforce" && <WorkforceView />}
          </ScreenBoundary>
        </main>
      </div>
      {coachOpen && profile && (
        <Coach profile={profile} scenario={scenario} roleId={role?.role_id}
          onApply={applyProposal} onClose={() => setCoachOpen(false)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

// One screen failing to render must not blank the whole app: the sidebar stays usable and the
// person gets a way out. Keyed by screen, so moving to another screen resets it.
class ScreenBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section>
        <div className="banner error" role="alert">
          <strong>Something went wrong on this screen.</strong> Your profile is safe. Reload the page or pick another section on the left.
        </div>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
      </section>
    );
  }
}

function Landing({ onStart, onDemo }: { onStart: () => void; onDemo: (k: string) => void }) {
  return (
    <main className="landing">
      <header className="lv-hero">
        <Rosette className="hero-rosette" />
        <p className="pill-tag">{t("landing.tag")}</p>
        <h1>{t("landing.title")}</h1>
        <p className="lede">{t("landing.lede")}</p>
        <div className="ctas">
          <button className="btn ink" onClick={() => onDemo("clerk")}>{t("landing.demo")}</button>
          <button className="btn quiet" onClick={onStart}>{t("landing.mine")}</button>
        </div>
        <button className="link" onClick={() => onDemo("student")}>{t("landing.student")}</button>
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
  const [tab, setTab] = useState<"upload" | "cv" | "chat" | "pick">("upload");
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
      <div className="page-head"><h1>{t("h.skills")}</h1></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "upload"} onClick={() => setTab("upload")}>Upload CV</button>
        <button role="tab" aria-selected={tab === "cv"} onClick={() => setTab("cv")}>Paste CV</button>
        <button role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>Questionnaire</button>
        <button role="tab" aria-selected={tab === "pick"} onClick={() => setTab("pick")}>Pick skills</button>
      </div>
      <p className="source">{t("note.cv")}</p>
      {tab === "upload" ? <UploadCv onDone={onDone} /> : tab === "chat" ? <Questionnaire onDone={onDone} /> : tab === "cv" ? (
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
      <div className="page-head"><h1>{t("h.check")}</h1></div>
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
      <button className="primary" disabled={skills.length === 0} onClick={save}>{t("a.seeRoles")}</button>
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
  const [year, setYear] = useState<number | undefined>(undefined);
  useEffect(() => {
    api.matches(profile.id, scenario, year).then(setData).catch(() => setError("Couldn't update scenario."));
  }, [profile.id, profile.interests.join(","), scenario, year]);
  async function afterRefresh() {
    const before = data;
    const after = await api.matches(profile.id, scenario, year);
    setData(after);
    if (before) setChanges(compare(before, after, scenario));
  }
  return (
    <section>
      <div className="page-head">
        <h1>{t("h.roles")}</h1>
        {profile.story && <p className="muted">{profile.display_name}: {profile.story}</p>}
      </div>
      {data && <Kpis data={data} scenario={scenario} />}
      <div className="segmented" role="radiogroup" aria-label="AI adoption scenario">
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => setScenario(s.id)}>{t(`sc.${s.id}`)}</button>
        ))}
      </div>
      {data && (
        <div className="year-slider">
          <label htmlFor="year">{t("k.lookAhead")} <strong>{data.year}</strong> <span className="badge">{t("k.estimate")}</span></label>
          <input id="year" type="range" min={data.year_range[0]} max={data.year_range[1]} step={1}
            value={data.year} onChange={(e) => setYear(Number(e.target.value))}
            aria-valuetext={`${data.year}`} />
          <div className="year-ticks" aria-hidden="true">
            {Array.from({ length: data.year_range[1] - data.year_range[0] + 1 }, (_, i) => <span key={i}>{data.year_range[0] + i}</span>)}
          </div>
          <p className="source">The sources forecast to {data.year_range[1]}; we do not extend them further.</p>
        </div>
      )}
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
      <p className="muted">Estimate to {role.estimate_range.year}: {signed(role.estimate_range.low)}% to {signed(role.estimate_range.high)}% jobs across scenarios</p>
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

function RoleDetail({ profile, role, scenario, onImpact, onProfile }: {
  profile: Profile; role: RoleMatch; scenario: Scenario; onImpact: () => void; onProfile: (p: Profile) => void;
}) {
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
  async function toggle(courseId: string, done: boolean) {
    onProfile(await api.complete(profile.id, courseId, done));
    setPlan(await api.pathway(profile.id, role.role_id));
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
      <div className="job-links"><span className="muted">See open jobs:</span>
        {jobLinks(role.title).map((l) => <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>
      <div className="two-col">
        <div><h3>You have</h3><div className="chips">{role.covered.map((s) => <span key={s.skill_id} className="chip covered">✓ {s.name}</span>)}</div></div>
        <div><h3>You need</h3><div className="chips">{role.missing.map((s) => <span key={s.skill_id} className="chip missing">{s.name}{s.weight === 3 ? " (core)" : ""}</span>)}</div></div>
      </div>
      <p className="source">Skills for this role: the Laluan team's list{role.skills_source.onet_code
        ? <>, checked against O*NET occupation <a href={`https://www.onetonline.org/link/summary/${role.skills_source.onet_code}`} target="_blank" rel="noreferrer">{role.skills_source.onet_code}</a>{role.skills_source.onet_note && ` (${role.skills_source.onet_note.replace(/\.$/, "")})`}</>
        : " (a new role with no O*NET occupation yet)"}.</p>
      {role.missing.length === 0 ? <p>You already have every core skill for this role.</p> : !plan && (
        <button className="primary" disabled={busy} onClick={build}>{busy ? "…" : t("a.build")}</button>
      )}
      {plan && (
        <>
          <div className="readiness card">
            <div className="card-row"><h3>Readiness for {role.title}</h3><strong className="readiness-num">{Math.round(plan.readiness * 100)}%</strong></div>
            <div className="fit" aria-label={`Readiness ${Math.round(plan.readiness * 100)} percent`}><div style={{ width: `${plan.readiness * 100}%` }} /></div>
            <p className="muted">Started at {Math.round(plan.fit * 100)}% · {plan.steps.filter((s) => s.done).length} of {plan.steps.length} steps done · about {plan.hours_left} hours left</p>
            {plan.steps.some((s) => s.done) && (
              <div className="chips">{plan.steps.filter((s) => s.done).flatMap((s) => s.skills).map((k) => <span key={k.skill_id} className="badge gold">★ {k.name}</span>)}</div>
            )}
          </div>
          <h3>Your pathway: {plan.steps.length} steps, about {plan.total_hours} hours</h3>
          <p>{plan.summary}</p>
          {plan.grounding && (
            <p className={plan.grounding.all_supported ? "badge" : "banner warning"}>
              {plan.grounding.all_supported ? "Every sentence is backed by the course catalogue" : `Check sentences ${plan.grounding.unsupported.join(", ")}: not found in the catalogue`}
            </p>
          )}
          <ol className="steps">
            {plan.steps.map((s) => (
              <li key={s.step} className={s.done ? "card is-done" : "card"}>
                <div className="card-row"><strong>{s.skills.map((k) => k.name).join(", ")}</strong>
                  <span className={`badge ${COST[s.course.cost]?.tone ?? ""}`}>{COST[s.course.cost]?.label ?? s.course.cost}</span></div>
                <span>{s.course.url ? <a href={s.course.url} target="_blank" rel="noreferrer">{s.course.title}</a> : s.course.title} · {s.course.provider}</span>
                <span className="muted">About {s.course.hours} hours · {s.course.level} · {s.why}</span>
                <span className="source">From the Laluan course catalogue · {s.course.url ? (s.course.checked ? `link checked ${s.course.checked}` : "link not yet checked") : "no single course page: search the provider"}</span>
                {s.course.cost === "paid" && <span className="source">Price and HRD Corp claimability: check with the provider or your employer before enrolling.</span>}
                <label className="check"><input type="checkbox" checked={s.done} onChange={(e) => toggle(s.course.id, e.target.checked)} /> I finished this</label>
              </li>
            ))}
          </ol>
          <button className="primary" onClick={onImpact}>{t("a.impact")}</button>
          <button onClick={() => window.print()}>{t("a.print")}</button>
          <ShareCard profile={profile} roleId={role.role_id} />
        </>
      )}
    </section>
  );
}

function ShareCard({ profile, roleId }: { profile: Profile; roleId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create() {
    setError(null);
    try {
      const { card_id } = await api.createCard(profile.id, roleId);
      const url = `${window.location.origin}${window.location.pathname}?card=${card_id}`;
      setLink(url);
      setQr(await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: "M" }));
    } catch { setError("Couldn't create the card. Try again."); }
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); }
  }
  return (
    <div className="card share-card">
      <h3>Future Card</h3>
      <p className="muted">A read-only summary of this plan you can show a counsellor, employer or family. It shows {profile.display_name ? `your name, ${profile.display_name},` : "no name"} the role, your readiness and the plan in brief, never your full skill list. It stops working when you delete your profile.</p>
      {!link ? <button className="primary" onClick={create}>{t("a.card")}</button> : (
        <div className="share-row">
          {qr && <img src={qr} width={160} height={160} alt="QR code that opens your Future Card" />}
          <div className="share-actions">
            <a href={link} target="_blank" rel="noreferrer">Open the card ↗</a>
            <button onClick={copy}>{copied ? "Link copied" : "Copy link"}</button>
            <code className="share-link">{link}</code>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function CardPage({ cardId }: { cardId: string }) {
  const [card, setCard] = useState<FutureCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.card(cardId).then(setCard).catch((e) => setError(e instanceof Error && e.message.startsWith("404")
      ? "This Future Card no longer exists. Its owner may have deleted their profile."
      : "Can't reach Laluan right now. Try again in a moment."));
  }, [cardId]);
  return (
    <div className="site">
      <nav className="site-nav" aria-label="Main">
        <a className="brand" href={window.location.pathname} aria-label="Laluan home"><LogoMark /><span>Laluan</span></a>
      </nav>
      <main className="card-page">
        {error && <div className="banner error" role="alert">{error}</div>}
        {!card && !error && <p className="muted">Loading the card…</p>}
        {card && (
          <article className="future-card card">
            <p className="eyebrow">Future Card{card.display_name ? ` · ${card.display_name}` : ""}</p>
            <h1>Moving toward {card.role.title}</h1>
            <p className="muted">{card.role.summary}</p>
            <div className="kpis">
              <div className="kpi"><span className="kpi-label">Readiness</span><strong>{Math.round(card.readiness * 100)}%</strong>
                <span className="badge">skills already covered</span></div>
              <div className="kpi"><span className="kpi-label">Outlook to {card.estimate_range.horizon_year}</span><strong>{signed(card.outlook.index)}%</strong>
                <span className={`badge ${OUTLOOK_TONE[card.outlook.label]}`}>{OUTLOOK_TEXT[card.outlook.label]}</span></div>
              <div className="kpi"><span className="kpi-label">Plan</span><strong>{card.steps} steps</strong>
                <span className="badge">about {card.hours} hours left</span></div>
            </div>
            {card.robust_pick && <p><span className="badge gold">Robust pick</span> Stays in the top five under every AI-adoption scenario.</p>}
            <p className="muted">Range across scenarios: {signed(card.estimate_range.low)}% to {signed(card.estimate_range.high)}% jobs. An estimate, not a prediction.</p>
            {card.next_skills.length > 0 && <p><strong>Next skills:</strong> {card.next_skills.join(", ")}</p>}
            {card.first_step && <p><strong>First step:</strong> {card.first_step}</p>}
            <Sdgs sdgs={card.sdgs} />
            <p className="source">Outlook source: {card.source.snapshot_id}, imported {card.source.imported}. Card created {card.created_at.slice(0, 10)}; figures update when the data does.</p>
            <a className="btn ink" href={window.location.pathname}>Make your own plan</a>
          </article>
        )}
      </main>
    </div>
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
      <div className="page-head"><h1>{t("h.radar")}</h1>
      <p className="muted">{t("note.estimate")}</p></div>
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
                    {s.sources.length > 0 && <small className="source radar-src">{s.sources.join(" · ")}</small>}
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
      <button className="primary" onClick={onNext}>{t("a.seeRoles")}</button>
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

const TASK_LABEL: Record<TaskLabel, { text: string; tone: string; help: string }> = {
  automate: { text: "AI likely to automate", tone: "risk", help: "Software can already do most of this." },
  assist: { text: "AI assists you", tone: "gold", help: "AI speeds it up; you stay in charge." },
  human: { text: "Stays human", tone: "good", help: "Needs judgement, presence or trust." },
};
const TASKS_KEY = "laluan.tasksDone";

function TaskView({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [roleId, setRoleId] = useState(profile.current_role_id ?? "");
  const [done, setDone] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(TASKS_KEY) ?? "[]"); } catch { return []; }
  });
  const [data, setData] = useState<RoleTasks | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.roles().then(setRoles).catch(() => setError("Couldn't load the role list.")); }, []);
  useEffect(() => {
    if (!roleId) return;
    api.tasks(roleId, done).then((d) => { setData(d); setError(null); }).catch(() => setError("Couldn't load the tasks for this job."));
    try { sessionStorage.setItem(TASKS_KEY, JSON.stringify(done)); } catch { /* private mode */ }
  }, [roleId, done]);
  const ids = new Set(data?.tasks.map((t) => t.id));
  const ticked = done.filter((d) => ids.has(d));
  return (
    <section>
      <div className="page-head"><h1>{t("h.tasks")}</h1>
        <p className="muted">AI rarely replaces a whole job at once: it changes tasks. Tick the tasks you actually do to see how much of your work AI is likely to automate, assist with, or leave to you.</p></div>
      <label className="narrow">Job
        <select value={roleId} onChange={(e) => { setRoleId(e.target.value); setDone([]); }}>
          <option value="">Choose a job</option>
          {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      {!roleId && <p className="muted">Pick your current or most recent job to start.</p>}
      {data && data.tasks.length === 0 && (
        <div className="banner">{data.onet_note ?? "No task data for this job yet."}</div>
      )}
      {data && data.tasks.length > 0 && (
        <>
          <div className="task-split card" aria-label="Share of your tasks">
            <div className="split-bar" aria-hidden="true">
              {(["automate", "assist", "human"] as const).map((l) => (
                <span key={l} className={`split ${l}`} style={{ width: `${data.shares[l] * 100}%` }} />
              ))}
            </div>
            <ul className="split-legend">
              {(["automate", "assist", "human"] as const).map((l) => (
                <li key={l}><span className={`swatch ${l}`} aria-hidden="true" /><strong>{Math.round(data.shares[l] * 100)}%</strong> {TASK_LABEL[l].text}</li>
              ))}
            </ul>
            <p className="muted">{ticked.length ? `Based on the ${data.counted} ${data.counted === 1 ? "task" : "tasks"} you ticked.` : `Based on all ${data.counted} tasks. Tick yours to make it personal.`}</p>
          </div>
          <ul className="task-list">
            {data.tasks.map((t) => (
              <li key={t.id} className="card">
                <label className="check">
                  <input type="checkbox" checked={done.includes(t.id)}
                    onChange={(e) => setDone(e.target.checked ? [...done, t.id] : done.filter((d) => d !== t.id))} />
                  <span>{t.text}</span>
                </label>
                <div className="card-row">
                  <span className={`badge ${TASK_LABEL[t.label].tone}`} title={TASK_LABEL[t.label].help}>{TASK_LABEL[t.label].text}</span>
                  <span className="muted">{t.reason}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="source">Tasks: {data.source}{data.onet_code && <>, occupation <a href={`https://www.onetonline.org/link/summary/${data.onet_code}`} target="_blank" rel="noreferrer">{data.onet_code}</a></>}
            {data.onet_note && ` · ${data.onet_note}`} · Labels are judgements drafted with AI assistance, not predictions; checked by our team so far: {data.reviewed} of {data.tasks.length}.</p>
          <button className="primary" onClick={onNext}>{t("a.moveInto")}</button>
        </>
      )}
    </section>
  );
}

interface CoachTurn { question: string; reply: CoachReply | null; error?: string; dismissed?: boolean; applied?: boolean }

function Coach({ profile, scenario, roleId, onApply, onClose }: {
  profile: Profile; scenario: Scenario; roleId?: string; onApply: (p: CoachProposal) => Promise<void>; onClose: () => void;
}) {
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(""); setBusy(true);
    const index = turns.length;
    setTurns((t) => [...t, { question: text, reply: null }]);
    try {
      const reply = await api.coach(profile.id, text, scenario, roleId);
      setTurns((t) => t.map((x, i) => (i === index ? { ...x, reply } : x)));
    } catch {
      setTurns((t) => t.map((x, i) => (i === index ? { ...x, error: "The coach is offline right now. Try one of the suggested questions later." } : x)));
    } finally { setBusy(false); }
  }
  function mark(i: number, patch: Partial<CoachTurn>) { setTurns((t) => t.map((x, j) => (j === i ? { ...x, ...patch } : x))); }
  const suggestions = turns.at(-1)?.reply?.suggestions ?? ["Why is this my top role?", "How long will the plan take?", "Is my current job at risk?", "What if AI adoption is faster?"];
  return (
    <aside className="coach" role="dialog" aria-modal="false" aria-labelledby="coach-title">
      <header className="coach-head">
        <h2 id="coach-title">{t("coach.title")}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close the coach">×</button>
      </header>
      <p className="muted coach-note">{t("note.coach")}</p>
      <ol className="coach-log" aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i}>
            <p className="coach-q">{turn.question}</p>
            {!turn.reply && !turn.error && <p className="muted">Thinking…</p>}
            {turn.error && <p className="error" role="alert">{turn.error}</p>}
            {turn.reply && (
              <div className="coach-a">
                <p>{turn.reply.answer}</p>
                {turn.reply.grounding && (
                  <span className={`badge ${turn.reply.grounding.all_supported ? "good" : "risk"}`}>
                    {turn.reply.grounding.all_supported ? "Every sentence backed by a source" : `Check sentence ${turn.reply.grounding.unsupported.join(", ")}: not in the sources`}
                  </span>
                )}
                <details><summary className="muted">Sources ({turn.reply.sources.length})</summary>
                  <ul className="coach-sources">{turn.reply.sources.map((s) => <li key={s.id}><strong>{s.id}</strong> {s.text}</li>)}</ul>
                </details>
                {turn.reply.proposal && !turn.dismissed && (
                  <div className="proposal card">
                    <p className="eyebrow">Suggested change</p>
                    <p><strong>{turn.reply.proposal.label}</strong></p>
                    {turn.applied ? <span className="badge good">Applied</span> : (
                      <div className="actions">
                        <button className="primary" onClick={async () => { await onApply(turn.reply!.proposal!); mark(i, { applied: true }); }}>{t("a.apply")}</button>
                        <button onClick={() => mark(i, { dismissed: true })}>{t("a.dismiss")}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="chips coach-suggest">
        {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="coach-q">Ask about your results</label>
        <input id="coach-q" type="text" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your results" autoFocus />
        <button className="primary" type="submit" disabled={busy || !question.trim()}>{t("a.ask")}</button>
      </form>
    </aside>
  );
}

type IconName = "user" | "users" | "radar" | "briefcase" | "route" | "globe" | "trash" | "sun" | "moon" | "upload" | "list" | "chat";
const ICONS: Record<IconName, string> = {
  chat: "M4 5h16v11H9l-5 4z",
  list: "M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0",
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 20a6 6 0 0 0-3-5.2",
  upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
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
      <div className="kpi"><span className="kpi-label">{t("k.top")}</span><strong>{top?.title ?? "–"}</strong>
        {top && <span className="badge good">{Math.round(top.fit * 100)}% {t("k.fit")}</span>}</div>
      <div className="kpi"><span className="kpi-label">{t("k.robust")}</span><strong>{robust}</strong>
        <span className="badge">{t("k.robustNote")}</span></div>
      <div className="kpi"><span className="kpi-label">{t("k.current")}</span><strong>{current ? `${signed(current.outlook[scenario].index)}%` : "–"}</strong>
        {current ? <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]} to {data.signal_source.horizon_year}</span>
          : <span className="badge">{t("k.notSet")}</span>}</div>
      <div className="kpi"><span className="kpi-label">{t("k.data")}</span><strong>{data.signal_source.imported.slice(0, 10)}</strong>
        <span className={`badge ${data.signal_source.illustrative ? "risk" : "good"}`}>{data.signal_source.illustrative ? t("k.illustrative") : t("k.cited")}</span></div>
    </div>
  );
}

const COST: Record<string, { label: string; tone: string }> = {
  free: { label: "Free", tone: "good" },
  free_audit: { label: "Free to audit", tone: "good" },
  paid: { label: "Paid", tone: "gold" },
};

function jobLinks(title: string) {
  const q = encodeURIComponent(title);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [
    { label: "MYFutureJobs", url: "https://myfuturejobs.gov.my/" },
    { label: "JobStreet", url: `https://my.jobstreet.com/${slug}-jobs` },
    { label: "LinkedIn", url: `https://www.linkedin.com/jobs/search/?keywords=${q}&location=Malaysia` },
  ];
}

function UploadCv({ onDone }: { onDone: (skills: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try { onDone((await api.upload(file)).skills); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="dropzone">
      <Icon name="upload" />
      <p><strong>Upload your CV</strong></p>
      <p className="muted">PDF, Word (.docx) or text, up to 5 MB. Read in memory and never stored.</p>
      <label className="btn ink file-btn">{busy ? "Reading…" : "Choose a file"}
        <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function Questionnaire({ onDone }: { onDone: (skills: string[]) => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.turn([], getLang()).then((t) => { setTurn(t); setMessages([{ role: "assistant", content: t.next_question }]); })
      .catch(() => setError("The questionnaire is unavailable. Try another tab."));
  }, []);
  async function send() {
    if (!answer.trim()) return;
    const next = [...messages, { role: "user" as const, content: answer.trim() }];
    setAnswer("");
    try {
      const t = await api.turn(next, getLang());
      setTurn(t);
      setMessages([...next, { role: "assistant", content: t.next_question }]);
    } catch { setError("Couldn't send that. Try again."); }
  }
  return (
    <div className="chat card">
      <ol className="chat-log" aria-live="polite">
        {messages.map((m, i) => <li key={i} className={m.role}>{m.content}</li>)}
      </ol>
      {turn && turn.skills_found.length > 0 && <p className="muted">Skills found so far: {turn.skills_found.length}</p>}
      {turn?.is_complete ? (
        <button className="primary" disabled={turn.skills_found.length === 0} onClick={() => onDone(turn.skills_found)}>
          {turn.skills_found.length ? `Continue with ${turn.skills_found.length} skills` : "No skills found. Try another tab"}
        </button>
      ) : (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="answer">Your answer</label>
          <input id="answer" type="text" maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer" />
          <button className="primary" type="submit" disabled={!answer.trim()}>Send</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

const HEAT: Record<string, string> = { emerging: "hm-good", growing: "hm-good", stable: "hm-stable", declining: "hm-risk" };

function WorkforceView() {
  const [csv, setCsv] = useState("");
  const [scenario, setScenario] = useState<Scenario>("baseline");
  const [result, setResult] = useState<Workforce | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function analyse(text = csv, s = scenario) {
    setBusy(true); setError(null);
    try { setResult(await api.workforce(text, s)); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that file"); setResult(null); }
    finally { setBusy(false); }
  }
  async function sample() {
    const text = await api.workforceSample();
    setCsv(text);
    analyse(text);
  }
  async function readFile(file: File | undefined) {
    if (file) { const text = await file.text(); setCsv(text); analyse(text); }
  }
  return (
    <section>
      <div className="page-head">
        <h1>{t("h.workforce")}</h1>
        <p className="muted">For HR and learning teams: see which roles in your company AI puts at risk and the cheapest reskilling moves. Results are totals by role, never a ranking of individual people, and must not be used for hiring or firing decisions.</p>
      </div>
      <div className="card">
        <h2>Your team</h2>
        <p className="muted">A CSV with a <code>role</code> column and a <code>skills</code> column (separate skills with ;). Leave out names, emails, IC numbers and staff IDs: files that contain them are refused.</p>
        <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"role,skills\nData entry clerk,Excel; data entry\nCustomer service representative,customer service; communication"} />
        <div className="actions">
          <button className="primary" disabled={busy || csv.trim().length < 10} onClick={() => analyse()}>{busy ? "Analysing…" : "Analyse"}</button>
          <label className="btn quiet file-btn">Upload CSV<input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></label>
          <button onClick={sample} disabled={busy}>Use the sample company (synthetic, 160 people)</button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
      {result && (
        <>
          <div className="segmented" role="radiogroup" aria-label="AI adoption scenario">
            {SCENARIOS.map((s) => (
              <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => { setScenario(s.id); analyse(csv, s.id); }}>{s.label}</button>
            ))}
          </div>
          <div className="kpis">
            <div className="kpi"><span className="kpi-label">People analysed</span><strong>{result.employees}</strong><span className="badge">{result.roles.length} roles</span></div>
            <div className="kpi"><span className="kpi-label">In declining roles</span><strong>{result.at_risk}</strong>
              <span className={`badge ${result.at_risk ? "risk" : "good"}`}>{Math.round((result.at_risk / result.employees) * 100)}% of the team</span></div>
            <div className="kpi"><span className="kpi-label">Learning hours to move them</span><strong>{result.total_hours.toLocaleString()}</strong><span className="badge">From the course catalogue</span></div>
            <div className="kpi"><span className="kpi-label">Forecast data</span><strong>{result.signal_source.imported.slice(0, 10)}</strong>
              <span className={`badge ${result.signal_source.illustrative ? "risk" : "good"}`}>{result.signal_source.illustrative ? "Illustrative baseline" : "Cited sources"}</span></div>
          </div>
          <div className="card">
            <h2>Risk heatmap by role</h2>
            <div className="table-wrap">
              <table className="heatmap">
                <thead><tr><th>Role</th><th>People</th><th>Slow</th><th>Baseline</th><th>Accelerated</th><th>Skill fit today</th></tr></thead>
                <tbody>
                  {result.roles.map((r) => (
                    <tr key={r.role_id}>
                      <th scope="row">{r.title}</th><td>{r.headcount}</td>
                      {SCENARIOS.map((s) => (
                        <td key={s.id} className={HEAT[r.outlook[s.id].label]}>{signed(r.outlook[s.id].index)}%</td>
                      ))}
                      <td>{Math.round(r.avg_fit * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="source">Expected change in jobs to the horizon year under each scenario (estimates). Snapshot {result.signal_source.snapshot_id}.</p>
          </div>
          <div className="card">
            <h2>Cheapest reskilling moves</h2>
            {result.moves.length === 0 ? <p className="muted">No one is in a declining role under this scenario.</p> : (
              <div className="table-wrap">
                <table className="heatmap">
                  <thead><tr><th>From</th><th>To</th><th>People</th><th>Hours each</th><th>Fit today</th><th>SDGs</th></tr></thead>
                  <tbody>
                    {result.moves.map((m) => (
                      <tr key={m.from_role + m.to_role}>
                        <td>{m.from_role}</td><th scope="row">{m.to_role}</th><td>{m.people}</td><td>{m.avg_hours}</td>
                        <td>{Math.round(m.avg_fit_now * 100)}%</td><td><Sdgs sdgs={m.sdgs} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {result.sdg_contribution.length > 0 && (
            <div className="card">
              <h2>What these moves contribute to the SDGs</h2>
              <div className="sdg-totals">
                {result.sdg_contribution.map((g) => (
                  <div key={g.number} className="sdg-total"><span className="sdg" style={{ background: g.colour }}>{g.number}</span>
                    <span><strong>{g.people} people</strong><small>{g.name}</small></span></div>
                ))}
              </div>
            </div>
          )}
          {result.problems.length > 0 && <div className="banner">Rows skipped: {result.problems.join(" · ")}</div>}
        </>
      )}
    </section>
  );
}
