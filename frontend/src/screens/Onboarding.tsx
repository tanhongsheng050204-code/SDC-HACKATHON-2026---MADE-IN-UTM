import { ReactNode, useEffect, useState } from "react";
import { Icon, IconName } from "../components/Icon";
import { SdgTile } from "../components/Sdgs";
import { api, Audience, Profile, RoleMatch, RoleOption, Sdg, Skill } from "../lib/api";
import { confetti } from "../lib/confetti";
import { percent } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { KEYS, save } from "../lib/storage";
import { DegreeStart, PasteCv, PickSkills, Questionnaire, UploadCv } from "./Intake";

type Step = "who" | "method" | "input" | "found" | "job" | "goals" | "ready";
type Method = "upload" | "cv" | "chat" | "pick" | "degree";
const STEPS: Step[] = ["who", "method", "input", "found", "job", "goals", "ready"];

const AUDIENCES: { id: Audience; label: "aud.worker" | "aud.graduate" | "aud.switcher"; hint: "aud.workerHint" | "aud.graduateHint" | "aud.switcherHint"; icon: IconName }[] = [
  { id: "worker", label: "aud.worker", hint: "aud.workerHint", icon: "briefcase" },
  { id: "graduate", label: "aud.graduate", hint: "aud.graduateHint", icon: "book" },
  { id: "switcher", label: "aud.switcher", hint: "aud.switcherHint", icon: "route" },
];

// A new profile, one question per screen: who you are -> how to start -> that input -> the skills
// found -> current job and years -> goals -> "Your route is ready". The steps are this screen's own
// state; the profile is only created on the last step. Editing an existing profile stays the
// one-page form in Review.tsx.
export function Onboarding({ audience, onAudience, onSaved }: {
  audience: Audience | null; onAudience: (a: Audience) => void; onSaved: (p: Profile) => void;
}) {
  const [step, setStep] = useState<Step>(audience ? "method" : "who");
  const [method, setMethod] = useState<Method | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [job, setJob] = useState("");
  const [years, setYears] = useState("");
  const [goals, setGoals] = useState<number[]>([]);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [sdgs, setSdgs] = useState<Sdg[]>([]);
  useEffect(() => {
    api.skills().then(setAllSkills).catch(() => setAllSkills([]));
    api.roles().then(setRoles).catch(() => setRoles([]));
    api.sdgs().then(setSdgs).catch(() => setSdgs([]));
  }, []);

  const at = STEPS.indexOf(step);
  const back = () => setStep(STEPS[Math.max(audience ? 1 : 0, at - 1)]);
  const needsJob = audience === "worker" || audience === "switcher";
  const found = (list: string[]) => { setSkills((s) => [...new Set([...s, ...list])]); setStep("found"); };

  let body: ReactNode, next: { label: string; go: () => void; disabled?: boolean } | null = null;
  if (step === "who") {
    body = (
      <Question title={t("aud.title")} sub={t("aud.sub")}>
        <div className="ob-options" role="radiogroup" aria-label={t("aud.title")}>
          {AUDIENCES.map((a) => (
            <button key={a.id} role="radio" aria-checked={audience === a.id} className="ob-option"
              onClick={() => { onAudience(a.id); setStep("method"); }}>
              <Icon name={a.icon} /><strong>{t(a.label)}</strong><span className="muted">{t(a.hint)}</span>
            </button>
          ))}
        </div>
      </Question>
    );
  } else if (step === "method") {
    const options: { id: Method; label: string; hint: string; icon: IconName }[] = [
      ...(audience === "graduate" ? [{ id: "degree" as const, label: t("ob.degree"), hint: t("ob.degreeHint"), icon: "book" as const }] : []),
      { id: "upload", label: t("in.upload"), hint: t("ob.uploadHint"), icon: "upload" },
      { id: "cv", label: t("in.paste"), hint: t("ob.pasteHint"), icon: "list" },
      { id: "chat", label: t("in.chat"), hint: t("ob.chatHint"), icon: "chat" },
      { id: "pick", label: t("in.pick"), hint: t("ob.pickHint"), icon: "target" },
    ];
    body = (
      <Question title={t("ob.methodTitle")} sub={t("ob.methodSub")}>
        <div className="ob-options">
          {options.map((o) => (
            <button key={o.id} className="ob-option" onClick={() => { setMethod(o.id); setStep("input"); }}>
              <Icon name={o.icon} /><strong>{o.label}</strong><span className="muted">{o.hint}</span>
            </button>
          ))}
        </div>
        <p className="source">{t("note.cv")}</p>
      </Question>
    );
  } else if (step === "input") {
    body = (
      <Question title={method === "degree" ? t("deg.title") : method === "upload" ? t("in.upload") : method === "cv" ? t("in.paste") : method === "chat" ? t("in.chat") : t("in.pick")}>
        {method === "degree" && <DegreeStart standalone onUse={found} />}
        {method === "upload" && <UploadCv onDone={found} />}
        {method === "cv" && <PasteCv onDone={found} />}
        {method === "chat" && <Questionnaire onDone={found} />}
        {method === "pick" && <PickSkills onDone={found} />}
        {method !== "degree" && <p className="source">{t("note.cv")}</p>}
      </Question>
    );
  } else if (step === "found") {
    const name = (id: string) => tr(allSkills.find((s) => s.id === id)?.name ?? id);
    body = (
      <Question title={t("ob.foundTitle")} sub={skills.length ? tf("ob.foundSub", { n: skills.length }) : t("rv.none")}>
        <div className="chips ob-chips">
          {skills.map((id) => (
            <span key={id} className="chip covered">{name(id)}
              <button aria-label={tf("rv.remove", { name: name(id) })} onClick={() => setSkills(skills.filter((s) => s !== id))}>×</button>
            </span>
          ))}
        </div>
        <label>{t("rv.add")}
          <select value="" onChange={(e) => e.target.value && setSkills([...skills, e.target.value])}>
            <option value="">{t("rv.choose")}</option>
            {allSkills.filter((s) => !skills.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}
          </select>
        </label>
        <button className="link" onClick={() => setStep("method")}>{t("ob.addAnother")}</button>
      </Question>
    );
    next = { label: t("ob.continue"), go: () => setStep("job"), disabled: skills.length === 0 };
  } else if (step === "job") {
    body = (
      <Question title={t("ob.jobTitle")} sub={needsJob ? t("aud.needRole") : t("ob.jobSubOptional")}>
        <label>{t("rv.job")}
          <select value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">{t("rv.noJob")}</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{tr(r.title)}</option>)}
          </select>
        </label>
        <label className="narrow">{t("rv.years")}
          <input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
      </Question>
    );
    next = { label: t("ob.continue"), go: () => setStep("goals"), disabled: needsJob && !job };
  } else if (step === "goals") {
    const toggle = (n: number) => setGoals((g) => (g.includes(n) ? g.filter((x) => x !== n) : [...g, n]));
    body = (
      <Question title={t("ob.goalsTitle")} sub={t("ob.goalsSub")}>
        <div className="ob-goals">
          {sdgs.map((g) => (
            <button key={g.number} className="ob-goal" aria-pressed={goals.includes(g.number)} onClick={() => toggle(g.number)}>
              <SdgTile sdg={g} small /><span>{tr(g.name)}</span>{goals.includes(g.number) && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
        <p className="source">{t("ob.goalsNote")}</p>
      </Question>
    );
    next = { label: goals.length ? t("ob.continue") : t("ob.skip"), go: () => setStep("ready") };
  } else {
    body = <Ready audience={audience} skills={skills} job={job} years={years} goals={goals} onBack={() => setStep("goals")} onSaved={onSaved} />;
  }

  return (
    <section className="onboarding">
      <div className="ob-top">
        {at > (audience ? 1 : 0) && step !== "ready" && <button className="btn quiet sm" onClick={back}>← {t("ob.back")}</button>}
        <div className="ob-progress" role="progressbar" aria-label={t("ob.progress")} aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={at + 1}
          aria-valuetext={tf("ob.stepOf", { n: at + 1, of: STEPS.length })}>
          <span style={{ width: `${((at + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <div key={step} className="ob-slide">{body}</div>
      {next && (
        <div className="ob-continue">
          <button className="primary" onClick={next.go} disabled={next.disabled}>{next.label} →</button>
        </div>
      )}
    </section>
  );
}

function Question({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="ob-question">
      <h1>{title}</h1>
      {sub && <p className="muted">{sub}</p>}
      {children}
    </div>
  );
}

// The last step makes the profile, then shows the first three destinations it opens up (marking
// the ones that serve the chosen goals). The goals are kept on this device only.
function Ready({ audience, skills, job, years, goals, onBack, onSaved }: {
  audience: Audience | null; skills: string[]; job: string; years: string; goals: number[];
  onBack: () => void; onSaved: (p: Profile) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [top, setTop] = useState<RoleMatch[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setError(false);
    (async () => {
      try {
        const p = profile ?? await api.createProfile({ display_name: null, current_role_id: job || null, skills, audience, experience_years: years === "" ? null : Number(years) });
        if (!live) return;
        setProfile(p);
        if (goals.length) save(`${KEYS.goals}${p.id}`, goals.join(","));
        const m = await api.matches(p.id, "baseline");
        if (live) setTop(m.roles.slice(0, 3));
      } catch { if (live) setError(true); }
    })();
    return () => { live = false; };
  }, [attempt]);
  useEffect(() => { if (top) confetti(document.querySelector(".ob-ready h1")); }, [top]);

  if (error) return (
    <Question title={t("review.saveFailed")}>
      <div className="actions"><button className="primary" onClick={() => setAttempt((n) => n + 1)}>{t("shell.retry")}</button>
        {!profile && <button className="btn quiet" onClick={onBack}>← {t("ob.back")}</button>}</div>
    </Question>
  );
  return (
    <div className="ob-question ob-ready">
      <h1>{t("ob.readyTitle")}</h1>
      {!top ? <p className="muted" aria-live="polite">{t("ob.making")}</p> : (
        <>
          <p className="muted">{tf("ob.readySub", { n: skills.length })}</p>
          <ol className="ob-dests">
            {top.map((r) => {
              const serves = r.sdgs.some((g) => goals.includes(g.number));
              return (
                <li key={r.role_id} className="card">
                  <span className="rank">#{r.rank}</span>
                  <strong>{tr(r.title)}</strong>
                  <span>{tf("card.fit", { n: percent(r.fit) })}</span>
                  <span className={`badge ${OUTLOOK_TONE[r.outlook.baseline.label]}`}>{OUTLOOK_TEXT[r.outlook.baseline.label]}</span>
                  {serves && <span className="badge good">{t("ob.servesGoals")}</span>}
                </li>
              );
            })}
          </ol>
          <div className="ob-continue">
            <button className="primary" onClick={() => profile && onSaved(profile)}>{t("ob.start")} →</button>
          </div>
        </>
      )}
    </div>
  );
}
