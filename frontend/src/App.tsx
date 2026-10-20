// Screens follow docs/03-APP_FLOW.md. Entry points: /?card=ID opens a read-only Future Card;
// /?demo=clerk|student|hr opens a demo; ?view=... restores a screen (see lib/route.ts).
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./components/Brand";
import { Coach } from "./components/Coach";
import { Icon } from "./components/Icon";
import { LangPicker, LiteToggle, ThemeButton, useLang, useLite, useTheme } from "./components/Preferences";
import { ScreenBoundary } from "./components/ScreenBoundary";
import { Sidebar } from "./components/Sidebar";
import { api, onServerWaking, CoachProposal, Profile, RoleMatch, Scenario } from "./lib/api";
import { t } from "./lib/i18n";
import { readRoute, Route, Screen, writeRoute } from "./lib/route";
import { KEYS, load, save } from "./lib/storage";
import { CardPage } from "./screens/CardPage";
import { Impact } from "./screens/Impact";
import { Intake } from "./screens/Intake";
import { Home } from "./screens/Home";
import { Landing } from "./screens/landing/Landing";
import { Radar } from "./screens/Radar";
import { Review } from "./screens/Review";
import { RoleDetail } from "./screens/RoleDetail";
import { Roles } from "./screens/Roles";
import { Sources } from "./screens/Sources";
import { Tasks } from "./screens/Tasks";
import { Workforce } from "./screens/Workforce";

const NEEDS_PROFILE: Screen[] = ["home", "radar", "tasks", "roles", "role", "impact"];

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const cardId = params.get("card");
  return cardId ? <CardPage cardId={cardId} /> : <MainApp demo={params.get("demo")} />;
}

let entryHandled = false;  // React dev mode runs effects twice; handle the entry URL once

function MainApp({ demo }: { demo: string | null }) {
  const [route, setRoute] = useState<Route>(() => {
    const r = readRoute();
    return NEEDS_PROFILE.includes(r.screen) || r.screen === "review" ? { ...r, screen: "landing" } : r;
  });
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<RoleMatch | null>(null);
  const [draftSkills, setDraftSkills] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [waking, setWaking] = useState(false);
  useEffect(() => onServerWaking(setWaking), []);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachQuestion, setCoachQuestion] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const { lite, setLite } = useLite();
  const { lang, change: changeLang } = useLang();
  const storedId = load(KEYS.profile);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const roleRef = useRef(role);
  roleRef.current = role;

  const screen = route.screen;
  const scenario = route.scenario;

  function go(next: Screen, extra: Partial<Route> = {}) {
    const r = { ...route, ...extra, screen: next };
    setRoute(r);
    writeRoute(r, "push");
    window.scrollTo(0, 0);
  }
  function setScenario(s: Scenario) {
    const r = { ...route, scenario: s };
    setRoute(r); writeRoute(r, "replace");
  }
  function setYear(y: number) {
    const r = { ...route, year: y };
    setRoute(r); writeRoute(r, "replace");
  }
  function openRole(r: RoleMatch) {
    setRole(r);
    go("role", { role: r.role_id });
  }
  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 4000);
  }

  // Browser back and forward: follow the URL, but never into a screen we have no data for.
  useEffect(() => {
    const onPop = () => {
      const r = readRoute();
      if (NEEDS_PROFILE.includes(r.screen) && !profileRef.current) r.screen = "landing";
      if (r.screen === "review") r.screen = "intake";
      if ((r.screen === "role" || r.screen === "impact") && roleRef.current?.role_id !== r.role) r.screen = "roles";
      setRoute(r);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function checkServer() {
    api.health().then((h) => { setModel(h.llm_model); setOffline(false); }).catch(() => setOffline(true));
  }
  useEffect(checkServer, []);

  useEffect(() => {
    if (entryHandled) return;
    entryHandled = true;
    if (demo === "clerk" || demo === "student") { openDemo(demo); return; }
    if (demo === "hr") { go("workforce"); return; }
    // A reload on ?view=roles (or deeper) resumes the saved profile and the role in the URL.
    const wanted = readRoute();
    if (NEEDS_PROFILE.includes(wanted.screen) && storedId) resume(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openDemo(key: string) {
    setError(null);
    try {
      const p = await api.demoProfile(key);
      save(KEYS.profile, p.id); setProfile(p);
      go("home", { role: undefined });
    } catch { setError(t("shell.demoFailed")); }
  }

  async function resume(wanted?: Route) {
    if (!storedId) return;
    try {
      const p = await api.getProfile(storedId);
      setProfile(p);
      if (wanted?.role && (wanted.screen === "role" || wanted.screen === "impact")) {
        const m = await api.matches(p.id, wanted.scenario, wanted.year);
        const found = m.roles.find((r) => r.role_id === wanted.role);
        if (found) { setRole(found); setRoute(wanted); return; }
      }
      const r: Route = wanted && wanted.screen !== "role" && wanted.screen !== "impact" ? wanted : { ...route, screen: "home" };
      setRoute(r); writeRoute(r, "replace");
    } catch {
      save(KEYS.profile, null);
      setError("That saved profile has expired. Start again.");
      go("landing");
    }
  }

  async function deleteProfile() {
    if (!profile || !window.confirm(t("shell.deleteConfirm"))) return;
    await api.deleteProfile(profile.id).catch(() => undefined);
    save(KEYS.profile, null); setProfile(null); setRole(null);
    go("landing", { role: undefined });
  }

  async function applyProposal(p: CoachProposal) {
    if (!profile) return;
    if (p.kind === "scenario") {
      const r = { ...route, scenario: p.value as Scenario, screen: "roles" as Screen };
      setRoute(r); writeRoute(r, "push");
    } else {
      const interests = Array.from(new Set([...profile.interests, Number(p.value)]));
      setProfile(await api.updateProfile({ ...profile, interests }));
      go("roles");
    }
    flash(`Applied: ${p.label}`);
  }

  const prefs = <><LangPicker lang={lang} onChange={changeLang} /><LiteToggle lite={lite} onChange={setLite} /></>;
  const themeButton = <ThemeButton theme={theme} onToggle={toggleTheme} />;
  const banners = (
    <>
      {waking && <div className="banner info" role="status">{t("shell.waking")}</div>}
      {offline && !waking && <div className="banner error" role="alert">{t("shell.offline")} <button className="link" onClick={checkServer}>{t("shell.retry")}</button></div>}
      {error && <div className="banner error" role="alert">{error} <button className="link" onClick={() => setError(null)}>{t("a.dismiss")}</button></div>}
    </>
  );

  if (screen === "landing") {
    const nav = (
      <nav className="site-nav" aria-label="Main">
        <button className="brand" onClick={() => go("landing")} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
        <div className="site-links">
          <a href="#people">{t("landing.navPeople")}</a>
          <a href="#journey">{t("landing.navJourney")}</a>
          <a href="#trust">{t("landing.navTrust")}</a>
          <a href="#faq">{t("landing.navFaq")}</a>
        </div>
        <div className="site-nav-actions">
          {themeButton}
          {storedId && <button className="btn quiet sm" onClick={() => resume()}>{t("landing.continue")}</button>}
          <button className="btn ink sm" onClick={() => go("intake")}>{t("landing.start")}</button>
        </div>
      </nav>
    );
    return (
      <Landing nav={nav} banners={banners} model={model} prefs={<><LangPicker lang={lang} onChange={changeLang} /><LiteToggle lite={lite} onChange={setLite} /></>}
        onStart={() => go("intake")} onDemo={openDemo} onHr={() => go("workforce")} onSources={() => go("sources")} />
    );
  }

  const titles: Record<Screen, string> = {
    landing: "", home: t("nav.home"), intake: t("nav.profile"), review: t("nav.profile"), radar: t("nav.radar"), tasks: t("nav.tasks"),
    roles: t("nav.roles"), role: t("nav.pathway"), impact: t("nav.impact"), sources: t("nav.sources"), workforce: t("nav.workforce"),
  };
  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t("shell.skip")}</a>
      <Sidebar current={screen} profile={profile} hasRole={!!role} model={model} prefs={prefs}
        onGo={(s) => go(s)} onHome={() => go("landing")} onDelete={deleteProfile} />
      <div className="workspace">
        <header className="workbar">
          <span className="workbar-title">{titles[screen]}</span>
          <div className="workbar-actions">
            {profile?.story && <span className="badge">{profile.display_name}</span>}
            {profile && <button className="btn sm" onClick={() => { setCoachQuestion(undefined); setCoachOpen(true); }} aria-expanded={coachOpen}><Icon name="chat" />{t("shell.coach")}</button>}
            {themeButton}
          </div>
        </header>
        {banners}
        <main id="main" tabIndex={-1}>
          <ScreenBoundary key={screen}>
            {screen === "home" && profile && (
              <Home profile={profile} scenario={scenario} onScenario={setScenario} onOpenRole={openRole} onGo={(s) => go(s)}
                onAsk={(q) => { setCoachQuestion(q); setCoachOpen(true); }} />
            )}
            {screen === "intake" && <Intake onDone={(skills) => { setDraftSkills(skills); go("review"); }} />}
            {screen === "review" && (
              <Review initial={draftSkills} onBack={() => go("intake")}
                onSaved={(p) => { save(KEYS.profile, p.id); setProfile(p); go("radar"); }} />
            )}
            {screen === "radar" && profile && <Radar profile={profile} onNext={() => go("roles")} />}
            {screen === "tasks" && profile && <Tasks profile={profile} onNext={() => go("roles")} />}
            {screen === "roles" && profile && (
              <Roles profile={profile} scenario={scenario} year={route.year}
                onScenario={setScenario} onYear={setYear} onOpen={openRole} />
            )}
            {screen === "role" && profile && role && (
              <RoleDetail profile={profile} role={role} scenario={scenario} onProfile={setProfile}
                onImpact={() => go("impact")} onBack={() => go("roles")} />
            )}
            {screen === "impact" && role && <Impact role={role} onBack={() => go("role")} />}
            {screen === "sources" && <Sources />}
            {screen === "workforce" && <Workforce />}
          </ScreenBoundary>
        </main>
      </div>
      {coachOpen && profile && (
        <Coach profile={profile} scenario={scenario} roleId={role?.role_id} initialQuestion={coachQuestion}
          onApply={applyProposal} onClose={() => setCoachOpen(false)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
