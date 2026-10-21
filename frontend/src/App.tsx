// Screens follow docs/03-APP_FLOW.md. Entry points: /?card=ID opens a read-only Future Card;
// /?demo=clerk|student|hr opens a demo; ?view=... restores a screen (see lib/route.ts).
import { useEffect, useRef, useState } from "react";
import { AccountButton } from "./components/AccountButton";
import { LogoMark } from "./components/Brand";
import { Coach } from "./components/Coach";
import { Icon } from "./components/Icon";
import { LangPicker, LiteToggle, ThemeButton, useLang, useLite, useTheme } from "./components/Preferences";
import { ScreenBoundary } from "./components/ScreenBoundary";
import { Sidebar } from "./components/Sidebar";
import { api, onAuthExpired, onServerWaking, Audience, CoachProposal, Profile, RoleMatch, Scenario } from "./lib/api";
import { authEnabled, getAccountName, getGoogleName, getUserId, onAuth, ready as authReady, setAccountName } from "./lib/auth";
import { setDataText, t } from "./lib/i18n";
import { readRoute, Route, Screen, writeRoute } from "./lib/route";
import { KEYS, load, save } from "./lib/storage";
import { CardPage } from "./screens/CardPage";
import { Impact } from "./screens/Impact";
import { Intake } from "./screens/Intake";
import { Home } from "./screens/Home";
import { Landing } from "./screens/landing/Landing";
import { Radar } from "./screens/Radar";
import { Review } from "./screens/Review";
import { ReviewKit } from "./screens/ReviewKit";
import { RoleDetail } from "./screens/RoleDetail";
import { SkillTree } from "./screens/SkillTree";
import { Survey } from "./screens/Survey";
import { Roles } from "./screens/Roles";
import { Sources } from "./screens/Sources";
import { Tasks } from "./screens/Tasks";
import { Workforce } from "./screens/Workforce";

const NEEDS_PROFILE: Screen[] = ["home", "radar", "tasks", "roles", "role", "impact", "tree", "survey"];

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
  const [audience, setAudience] = useState<Audience | null>(null);
  const [workforceTab, setWorkforceTab] = useState<"company" | "class">("company");
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [waking, setWaking] = useState(false);
  useEffect(() => onServerWaking(setWaking), []);
  // BM / 中文 for role titles, skill names and other data text; redraw once they arrive.
  const [, setDataLoaded] = useState(false);
  useEffect(() => { api.translations().then((m) => { setDataText(m); setDataLoaded(true); }).catch(() => undefined); }, []);
  const [userId, setUserId] = useState<string | null>(getUserId());
  useEffect(() => onAuth(setUserId), []);
  useEffect(() => onAuthExpired(() => setError(t("auth.expired"))), []);
  const [conflict, setConflict] = useState<{ local: string; saved: string } | null>(null);
  const [accountName, setAccountNameState] = useState<string | null>(getAccountName());
  const [nameSkipped, setNameSkipped] = useState(false);
  useEffect(() => {
    setAccountNameState(getAccountName());
    setNameSkipped(Boolean(userId) && load(KEYS.nameSkipped + userId, "session") === "1");
  }, [userId]);
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
  function setAdoption(a: number | undefined) {
    const r = { ...route, adoption: a };
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
      if ((r.screen === "role" || r.screen === "impact" || r.screen === "tree") && roleRef.current?.role_id !== r.role) r.screen = "roles";
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
    if (demo === "clerk" || demo === "student" || demo === "switcher") { openDemo(demo); return; }
    if (demo === "hr") { go("workforce"); return; }
    if (demo === "class") { setWorkforceTab("class"); go("workforce"); return; }
    // A reload on ?view=roles (or deeper) resumes the saved profile and the role in the URL.
    const wanted = readRoute();
    if (NEEDS_PROFILE.includes(wanted.screen) && storedId) authReady.then(() => resume(wanted));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After login: save this browser's anonymous profile to the account, or open the account's own.
  // If both exist and differ, ask (never merge, never drop silently). Demo profiles are never saved.
  useEffect(() => {
    if (!userId) {
      try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(KEYS.nameSkipped)) save(k, null, "session"); }
      catch { /* storage blocked: nothing was saved either */ }
      if (profileRef.current?.user_id) { setProfile(null); setRole(null); go("landing", { role: undefined }); }
      return;
    }
    (async () => {
      try {
        const me = await api.me();
        const localId = load(KEYS.profile);
        const local = localId ? await api.getProfile(localId).catch(() => null) : null;
        const claimable = local && !local.is_demo && !local.user_id;
        if (claimable && local && me.profile_id && me.profile_id !== local.id) {
          setConflict({ local: local.id, saved: me.profile_id });
          return;
        }
        if (claimable && local && !me.profile_id) {
          await api.claim(local.id);
          setProfile(await api.getProfile(local.id));
          return;
        }
        if (me.profile_id && (!local || local.is_demo || local.id !== me.profile_id)) {
          await openSaved(me.profile_id);
        } else if (local) {
          setProfile(local);
        }
        setError(null);  // any "log in to open your profile" notice is answered now
      } catch { setError(t("auth.expired")); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function openSaved(id: string) {
    const p = await api.getProfile(id);
    save(KEYS.profile, p.id); setProfile(p); setRole(null);
    if (route.screen === "landing") go("home", { role: undefined });
  }

  // A profile made while logged in belongs to the account straight away.
  async function profileSaved(p: Profile) {
    save(KEYS.profile, p.id); setProfile(p); go("survey");
    if (!userId) return;
    try {
      const claimed = await api.claim(p.id);
      if (claimed.conflict) setConflict({ local: p.id, saved: claimed.conflict });
      else setProfile(await api.getProfile(p.id));
    } catch { setError(t("auth.expired")); }
  }

  async function resolveConflict(replace: boolean) {
    if (!conflict) return;
    const { local, saved } = conflict;
    setConflict(null);
    try {
      if (replace) { await api.claim(local, true); await openSaved(local); }
      else await openSaved(saved);
    } catch { setError(t("auth.expired")); }
  }

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
      if (wanted?.role && (wanted.screen === "role" || wanted.screen === "impact" || wanted.screen === "tree")) {
        const m = await api.matches(p.id, wanted.scenario, wanted.year, wanted.adoption);
        const found = m.roles.find((r) => r.role_id === wanted.role);
        if (found) { setRole(found); setRoute(wanted); return; }
      }
      const r: Route = wanted && wanted.screen !== "role" && wanted.screen !== "impact" && wanted.screen !== "tree" ? wanted : { ...route, screen: "home" };
      setRoute(r); writeRoute(r, "replace");
    } catch {
      // A profile saved to an account only opens when logged in: keep its ID and ask to log in.
      if (authEnabled && !getUserId()) { setError(t("auth.needLogin")); go("landing"); return; }
      save(KEYS.profile, null);
      setError(t("shell.expired"));
      go("landing");
    }
  }

  // The account's name goes onto the account's profile: after a replace, on another device, or
  // once a profile is made. A name saved only on an older profile is moved up to the account.
  useEffect(() => {
    if (!userId || !profile || profile.user_id !== userId || profile.is_demo) return;
    if (accountName && profile.display_name !== accountName) {
      api.updateProfile({ ...profile, display_name: accountName }).then(setProfile).catch(() => undefined);
    } else if (!accountName && profile.display_name) {
      const name = profile.display_name;
      setAccountName(name).then(() => setAccountNameState(name)).catch(() => undefined);
    }
  }, [userId, profile, accountName]);

  async function deleteProfile() {
    if (!profile || !window.confirm(t("shell.deleteConfirm"))) return;
    await api.deleteProfile(profile.id).catch(() => undefined);
    save(KEYS.profile, null); setProfile(null); setRole(null);
    go("landing", { role: undefined });
  }

  async function applyProposal(p: CoachProposal) {
    if (!profile) return;
    const r = { ...route, scenario: p.value as Scenario, screen: "roles" as Screen };
    setRoute(r); writeRoute(r, "push");
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
      <nav className="site-nav" aria-label={t("nav.main")}>
        <button className="brand" onClick={() => go("landing")} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></button>
        <div className="site-links">
          <a href="#people">{t("landing.navPeople")}</a>
          <a href="#journey">{t("landing.navJourney")}</a>
          <a href="#trust">{t("landing.navTrust")}</a>
          <a href="#faq">{t("landing.navFaq")}</a>
        </div>
        <div className="site-nav-actions">
          {themeButton}
          <AccountButton userId={userId} />
          {storedId && <button className="btn quiet sm" onClick={() => resume()}>{t("landing.continue")}</button>}
          <button className="btn ink sm" onClick={() => go("intake")}>{t("landing.start")}</button>
        </div>
      </nav>
    );
    return (
      <Landing nav={nav} banners={banners} model={model} prefs={<><LangPicker lang={lang} onChange={changeLang} /><LiteToggle lite={lite} onChange={setLite} /></>}
        onStart={() => go("intake")} onDemo={(k) => (k === "class" ? (setWorkforceTab("class"), go("workforce")) : openDemo(k))} onHr={() => go("workforce")} onSources={() => go("sources")} onReviewKit={() => go("review-kit")} />
    );
  }

  const titles: Record<Screen, string> = {
    landing: "", home: t("nav.home"), intake: t("nav.profile"), review: t("nav.profile"), radar: t("nav.radar"), tasks: t("nav.tasks"),
    roles: t("nav.roles"), role: t("nav.pathway"), impact: t("nav.impact"), tree: t("nav.pathway"), survey: t("nav.survey"), sources: t("nav.sources"), workforce: t("nav.workforce"), "review-kit": "Review kit",
  };
  return (
    <div className="shell">
      <a className="skip-link" href="#main">{t("shell.skip")}</a>
      <Sidebar current={screen} profile={profile} hasRole={!!role} model={model} prefs={prefs} userId={userId}
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
            {screen === "intake" && <Intake audience={audience} onAudience={setAudience} onDone={(skills) => { setDraftSkills(skills); go("review"); }} />}
            {screen === "review" && (
              <Review initial={draftSkills} audience={audience} onBack={() => go("intake")}
                onSaved={profileSaved} />
            )}
            {screen === "radar" && profile && <Radar profile={profile} onNext={() => go("roles")} />}
            {screen === "tasks" && profile && <Tasks profile={profile} onNext={() => go("roles")} />}
            {screen === "roles" && profile && (
              <Roles profile={profile} scenario={scenario} year={route.year} adoption={route.adoption}
                onScenario={(s) => { setRoute({ ...route, scenario: s, adoption: undefined }); writeRoute({ ...route, scenario: s, adoption: undefined }, "replace"); }}
                onAdoption={setAdoption} onYear={setYear} onOpen={openRole} onSurvey={() => go("survey")} />
            )}
            {screen === "role" && profile && role && (
              <RoleDetail profile={profile} role={role} scenario={scenario} adoption={route.adoption} onProfile={setProfile}
                onImpact={() => go("impact")} onTree={() => go("tree")} onBack={() => go("roles")} />
            )}
            {screen === "impact" && role && <Impact role={role} onBack={() => go("role")} />}
            {screen === "survey" && profile && (
              <Survey profile={profile} userId={userId} onDone={(p) => { setProfile(p); go("roles"); }} onSkip={() => go("home")} />
            )}
            {screen === "tree" && profile && role && (
              <SkillTree profile={profile} role={role} userId={userId} onProfile={setProfile}
                onImpact={() => go("impact")} onBack={() => go("role")} />
            )}
            {screen === "sources" && <Sources onReviewKit={() => go("review-kit")} />}
            {screen === "review-kit" && <ReviewKit />}
            {screen === "workforce" && <Workforce initialTab={workforceTab} />}
          </ScreenBoundary>
        </main>
      </div>
      {coachOpen && profile && (
        <Coach profile={profile} scenario={scenario} roleId={role?.role_id} initialQuestion={coachQuestion}
          onApply={applyProposal} onClose={() => setCoachOpen(false)} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {conflict && <ConflictDialog onKeep={() => resolveConflict(false)} onReplace={() => resolveConflict(true)} />}
      {!conflict && userId && !accountName && !nameSkipped && !(profile?.user_id === userId && profile.display_name) && (
        <NameDialog suggestion={getGoogleName() ?? ""} onDone={(name) => {
          if (name) setAccountNameState(name);
          else { save(KEYS.nameSkipped + userId, "1", "session"); setNameSkipped(true); }
        }} />
      )}
    </div>
  );
}

// Right after login, while the account has no name: ask for the name to show, pre-filled with the
// Google account's name. It is kept on the account and copied to its profile; the email never is.
// "Skip" holds until the next login.
function NameDialog({ suggestion, onDone }: { suggestion: string; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(suggestion);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function saveName() {
    setBusy(true); setFailed(false);
    try { await setAccountName(name.trim()); onDone(name.trim()); }
    catch { setFailed(true); }
    finally { setBusy(false); }
  }
  return (
    <div className="dialog-backdrop">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="name-title" onSubmit={(e) => { e.preventDefault(); saveName(); }}>
        <h2 id="name-title">{t("name.title")}</h2>
        <p className="muted">{t("name.body")}</p>
        <label>{t("name.label")}
          <input type="text" autoFocus maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {failed && <p className="error" role="alert">{t("name.failed")}</p>}
        <div className="dialog-actions">
          <button type="submit" className="btn ink" disabled={busy || name.trim().length < 1}>{t("name.save")}</button>
          <button type="button" className="btn quiet" onClick={() => onDone(null)}>{t("name.skip")}</button>
        </div>
      </form>
    </div>
  );
}

function ConflictDialog({ onKeep, onReplace }: { onKeep: () => void; onReplace: () => void }) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
        <h2 id="conflict-title">{t("auth.conflictTitle")}</h2>
        <p>{t("auth.conflictBody")}</p>
        <div className="dialog-actions">
          <button className="btn ink" autoFocus onClick={onKeep}>{t("auth.keepSaved")}</button>
          <button className="btn quiet" onClick={onReplace}>{t("auth.replace")}</button>
        </div>
      </div>
    </div>
  );
}
