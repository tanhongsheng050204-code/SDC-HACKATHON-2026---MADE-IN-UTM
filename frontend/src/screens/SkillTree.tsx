import { EntryRequirements, years } from "../components/EntryRequirements";
import { useEffect, useRef, useState } from "react";
import { LoginToKeep } from "../components/AccountButton";
import { PlanAbout, StepCourse } from "../components/PathwayList";
import { StudyCalendar } from "../components/StudyCalendar";
import { ProgressPanel, STATUS_KEY, STATUS_TONE } from "../components/ProgressPanel";
import { Citations } from "../components/SkillEvidence";
import { ProofCheck } from "../components/ProofCheck";
import { Sheet } from "../components/Sheet";
import { api, Pathway, Profile, Progress, RoleInfo, RoleMatch, SkillTree as Tree, TreeNode } from "../lib/api";
import { percent, shortDate } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";

type Step = Pathway["steps"][number];
type Open = { kind: "step"; step: number } | { kind: "about" } | { kind: "goal" } | { kind: "licence" } | null;

function EtaNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const from = previous.current;
    previous.current = value;
    const finish = () => { cancelAnimationFrame(frame); setShown(value); };
    const reduced = () => media.matches || document.documentElement.dataset.lite === "1";
    const start = performance.now();
    const tick = (now: number) => {
      if (reduced()) { finish(); return; }
      const progress = Math.min(1, (now - start) / 600);
      setShown(Math.round(from + (value - from) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    if (reduced()) finish(); else frame = requestAnimationFrame(tick);
    const observer = new MutationObserver(() => { if (reduced()) finish(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-lite"] });
    media.addEventListener("change", finish);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); media.removeEventListener("change", finish); };
  }, [value]);
  return <><span aria-hidden="true">{format(shown)}</span><span className="sr-only">{format(value)}</span></>;
}

function spawnConfetti(anchor: HTMLElement) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || document.documentElement.dataset.lite === "1") return;
  const colors = ["var(--accent)", "var(--gold-bright)", "var(--good)", "var(--accent-soft)"];
  const rect = anchor.getBoundingClientRect();
  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;overflow:visible;z-index:100`;
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const d = 36 + Math.random() * 36;
    const p = document.createElement("div");
    const sz = 4 + Math.random() * 4;
    p.style.cssText = `position:absolute;left:50%;top:50%;width:${sz}px;height:${sz}px;`
      + `background:${colors[i % colors.length]};border-radius:${Math.random() > 0.5 ? "50%" : "3px"};`
      + `--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d - 28).toFixed(1)}px;`
      + `animation:confetti-burst 700ms ease-out forwards;animation-delay:${Math.round(i * 12)}ms`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 800);
}

// My pathway, read top to bottom like directions: the route and three facts, one card for the
// next thing to do, then every step down to the destination. A step's course, the "finished"
// tick and the three-question proof open in a side sheet; the weekly goal and sources do too.
export function SkillTree({ profile, role, userId, onProfile, onImpact, onBack, onDestinations }: {
  profile: Profile; role: RoleMatch; userId: string | null;
  onProfile: (p: Profile) => void; onImpact: () => void; onBack: () => void; onDestinations: () => void;
}) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleInfo | null>(null);
  const [open, setOpen] = useState<Open>(null);
  const [proving, setProving] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [suggestedHours, setSuggestedHours] = useState<number | null>(null);
  const isDestination = profile.target_role_id === role.role_id;
  const completions = profile.completed_courses.join(",");

  function loadTree() {
    api.tree(profile.id, role.role_id).then(setTree).catch(() => setError(t("tree.loadFailed")));
  }
  useEffect(() => {
    let cancelled = false;
    api.tree(profile.id, role.role_id).then(p => { if (!cancelled) setTree(p); })
      .catch(() => { if (!cancelled) setError(t("tree.loadFailed")); });
    return () => { cancelled = true; };
  }, [profile.id, role.role_id, completions, profile.skill_levels]);

  // Load plan on mount and whenever role, profile completions, or freeOnly changes
  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.pathway(profile.id, role.role_id, freeOnly)
      .then((p) => { if (!cancelled) setPlan(p); })
      .catch(() => { if (!cancelled) setError(t("tree.loadFailed")); });
    return () => { cancelled = true; };
  }, [profile.id, role.role_id, freeOnly, completions, profile.skill_levels]);

  // The weekly strip reads the same /progress the goal panel edits.
  useEffect(() => {
    let cancelled = false;
    if (!isDestination || open?.kind === "goal") return;
    api.progress(profile.id).then((p) => { if (!cancelled) setProgress(p); }).catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, [profile.id, isDestination, completions, profile.weekly_hours, profile.target_date, open?.kind]);

  // Fetch current role title for the route line
  useEffect(() => {
    let cancelled = false;
    setCurrentRole(null);
    if (!profile.current_role_id) return;
    api.role(profile.current_role_id).then(p => { if (!cancelled) setCurrentRole(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [profile.current_role_id]);

  async function refreshProfile() {
    try { onProfile(await api.getProfile(profile.id)); } catch { /* the path already shows the change */ }
  }

  async function setCourse(courseId: string, done: boolean, anchor?: HTMLElement) {
    if (saving) return;
    setSaving(true); setError(null);
    // Tick the step straight away; the refreshed plan (hours, readiness) follows from the server.
    const before = plan;
    setPlan(p => p && { ...p, steps: p.steps.map(s => s.course.id === courseId ? { ...s, done } : s) });
    try {
      onProfile(await api.complete(profile.id, courseId, done));
      if (done && anchor) spawnConfetti(anchor);
      if (done) setNotice(t("pw.finishedToast"));
    } catch { setPlan(before); setError(t("target.failed")); }
    finally { setSaving(false); }
  }

  async function proven(passed: boolean) {
    if (!passed) return;
    loadTree();
    refreshProfile();
  }

  if (!tree || !plan) return <p className={error ? "error" : "muted"} role="status">{error || t("a.loading")}</p>;

  const nodesOf = (s: Step) => tree.nodes.filter((n) => n.step === s.step);
  const proved = (s: Step) => { const ns = nodesOf(s); return ns.length > 0 && ns.every((n) => n.level >= 1); };
  const locked = (s: Step) => !s.done && nodesOf(s).some((n) => !n.unlocked);
  const toProve = (s: Step) => nodesOf(s).find((n) => n.level < 1 && n.unlocked);
  const complete = (s: Step) => s.done && proved(s);
  const next = plan.steps.find((s) => !complete(s));
  const left = plan.steps.filter((s) => !complete(s)).length;
  const isCore = (s: Step) => s.skills.some((k) => role.missing.some((m) => m.skill_id === k.skill_id && m.weight === 3));

  const paidKnown = plan.steps.filter((s) => s.course.price_rm != null).reduce((sum, s) => sum + (s.course.price_rm ?? 0), 0);
  const paidUnknown = plan.steps.filter((s) => s.course.cost === "paid" && s.course.price_rm == null).length;
  const totalWeight = [...role.covered, ...role.missing].reduce((s, r) => s + r.weight, 0);
  const uncoveredWeight = [...role.covered, ...role.missing].filter((m) => plan.uncovered_skills.includes(m.skill_id)).reduce((s, m) => s + m.weight, 0);
  const readinessAfter = totalWeight > 0 ? (totalWeight - uncoveredWeight) / totalWeight : 1;
  const licence = plan.requirements?.needs_licence ? plan.requirements.licence : null;
  const openStep = open?.kind === "step" ? plan.steps.find((s) => s.step === open.step) : undefined;

  const stateOf = (s: Step) => complete(s) ? <span className="pw-tag ok">{t("pw.sProved")}</span>
    : s.done ? <span className="pw-tag state">{t("pw.sDone")}</span>
    : locked(s) ? <span className="pw-tag">{t("pw.sLocked")}</span>
    : s === next ? <span className="pw-tag state">{t("pw.sNext")}</span>
    : <span className="pw-tag">{t("pw.sLater")}</span>;
  const costTag = (s: Step) => <span className={`pw-tag ${s.course.cost === "paid" ? "paid" : "free"}`}>{s.course.cost === "paid" ? t("pw.paid") : t("pw.free")}</span>;

  return (
    <section className="pathway-page">
      <button className="link back-link" onClick={onBack}>← {tr(tree.role.title)}</button>
      <LoginToKeep userId={userId} isDemo={!!profile.is_demo} />
      {error && <p className="error" role="alert">{error}</p>}

      <div className="pw-route">
        <h1><span className="pw-from">{profile.current_role_id ? (currentRole ? tr(currentRole.title) : "…") : t("pw.fromSkills")} →</span> {tr(role.title)}
          <button className="link pw-change" onClick={onDestinations}>{t("pw.change")}</button></h1>
        <div className="pw-facts">
          <span className="pw-fact"><strong><EtaNumber value={plan.hours_left} format={h => `~${h} h`} /></strong><span>{t("pw.left")}</span></span>
          <span className="pw-fact"><strong>{tf("pw.ofSteps", { n: left, total: plan.steps.length })}</strong><span>{t("pw.stepsToGo")}</span></span>
          <span className="pw-fact"><strong><EtaNumber value={percent(plan.readiness)} format={n => `${n}%`} /> → {percent(readinessAfter)}%</strong><span>{t("pw.ready")}</span></span>
          <span className="pw-fact"><strong>RM {paidKnown.toLocaleString()}{paidUnknown > 0 && ` ${tf("path.priceToConfirm", { n: paidUnknown })}`}</strong><span>{t("pw.toPay")}</span></span>
          {licence && <span className="pw-fact"><strong>{tf("req.etaPlus", { time: years(licence.route_months) })}</strong><span>{tr(licence.name)}</span></span>}
        </div>
      </div>

      {isDestination && progress && (
        <div className="pw-week">
          {progress.week.target ? (
            <>
              <span>{tf("pw.week", { done: progress.week.hours_done, target: progress.week.target })}
                {progress.finish_estimate && ` · ${tf("pw.finish", { date: shortDate(progress.finish_estimate) })}`}</span>
              <span className="pw-week-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (progress.week.hours_done / progress.week.target) * 100)}%` }} /></span>
              {progress.status && <span className={`badge ${STATUS_TONE[progress.status]}`}>{t(STATUS_KEY[progress.status])}</span>}
            </>
          ) : <span className="muted">{t("pw.weekNoGoal")}</span>}
          <button className="link" onClick={() => setOpen({ kind: "goal" })}>{t("pw.editGoal")}</button>
        </div>
      )}

      {next ? (
        <div className="pw-next">
          <span className="pw-next-k">{tf("pw.next", { n: next.step })}</span>
          <h2>{next.skills.map((k) => tr(k.name)).join(", ")}</h2>
          <p>{tr(next.course.title)} · {next.course.provider} · {next.course.cost === "paid" ? t("pw.paid") : t("pw.free")} · {tf("pl.hours", { h: next.course.hours })}</p>
          <div className="pw-next-acts">
            {locked(next) ? <span>{tf("pw.locked", { n: Math.max(1, next.step - 1) })}</span>
              : !next.done ? (
                <>
                  {next.course.url && <a className="btn pw-p" href={next.course.url} target="_blank" rel="noreferrer">{t("pw.open")} ↗</a>}
                  <button className="pw-s" disabled={saving} onClick={(e) => setCourse(next.course.id, true, e.currentTarget)}>{t("pw.finished")}</button>
                </>
              ) : (
                <>
                  {toProve(next) && <button className="pw-p" onClick={() => setProving(toProve(next)!)}>{t("pw.prove")}</button>}
                  <button className="pw-s" onClick={() => setOpen({ kind: "step", step: next.step })}>{t("pw.details")}</button>
                </>
              )}
          </div>
        </div>
      ) : (
        <div className="pw-next">
          <h2>{t("pw.allDone")}</h2>
          <p>{t("pw.allDoneSub")}</p>
        </div>
      )}
      {notice && <p className="muted" role="status">{notice}</p>}

      <div className="pw-tools">
        <button className="pw-chip" aria-pressed={freeOnly} disabled={saving} onClick={() => { setPlan(null); setFreeOnly(!freeOnly); }}>{t("path.freeOnly")}</button>
        <button className="link" onClick={() => setOpen({ kind: "about" })}>ⓘ {t("pw.about")}</button>
      </div>

      {role.covered.length > 0 && (
        <details className="pw-have">
          <summary>✓ {role.covered.length === 1 ? t("pw.haveOne") : tf("pw.have", { n: role.covered.length })}</summary>
          <p className="muted">{role.covered.map((s) => tr(s.name)).join(" · ")}</p>
        </details>
      )}

      <ol className="pw-path">
        {licence && (
          <li>
            <span className="pw-dot warn" aria-hidden="true">!</span>
            <button className="pw-step" onClick={() => setOpen({ kind: "licence" })}>
              <span className="pw-step-top"><span className="pw-tag paid">{t("rp.licence")}</span></span>
              <strong>{tf("pw.licence", { name: tr(licence.name) })}</strong>
              <span className="muted">{tf("pw.licenceSub", { time: years(licence.route_months) })}</span>
            </button>
          </li>
        )}
        {plan.steps.map((s) => (
          <li key={s.step}>
            <span className={`pw-dot${complete(s) ? " done" : s === next ? " now" : ""}`} aria-hidden="true">{complete(s) ? "✓" : s.step}</span>
            <button className={`pw-step${s === next ? " now" : ""}`} onClick={() => setOpen({ kind: "step", step: s.step })}>
              <span className="pw-step-top">{t("path.step")} {s.step} {stateOf(s)} {isCore(s) && <span className="pw-tag core">{t("pw.core")}</span>} {costTag(s)}</span>
              <strong>{s.skills.map((k) => tr(k.name)).join(", ")}</strong>
              <span className="muted">{tr(s.course.title)} · {s.course.provider} · {tf("pl.hours", { h: s.course.hours })}</span>
            </button>
          </li>
        ))}
        <li>
          <span className="pw-dot goal" aria-hidden="true">🎯</span>
          <div className="pw-step goal">
            <strong>{tr(role.title)}</strong>
            <span className="muted">{next ? t("pw.goalReady") : t("pw.goalDone")}</span>
            <button className="link" onClick={onImpact}>{t("pw.impact")} →</button>
          </div>
        </li>
      </ol>

      {openStep && (
        <Sheet title={tf("pw.stepTitle", { n: openStep.step, skill: openStep.skills.map((k) => tr(k.name)).join(", ") })} onClose={() => setOpen(null)}>
          <StepCourse step={openStep} role={role} />
          {locked(openStep) && <p className="muted">{t("path.lockedNote")}</p>}
          <div className="sheet-actions">
            {!openStep.done
              ? <button className="primary" disabled={saving || locked(openStep)} onClick={(e) => setCourse(openStep.course.id, true, e.currentTarget)}>{t("path.courseDone")}</button>
              : <>
                  {nodesOf(openStep).filter((n) => n.unlocked && n.level < 3).map((n) => (
                    <button key={n.skill_id} className="primary" onClick={() => setProving(n)}>
                      {t("pw.prove")}{nodesOf(openStep).length > 1 ? ` · ${tr(n.name)}` : ""}</button>
                  ))}
                  <button className="link" disabled={saving} onClick={() => setCourse(openStep.course.id, false)}>{t("pw.undo")}</button>
                </>}
          </div>
          {nodesOf(openStep).some((n) => n.level >= 3) && <p className="muted">{t("path.topLevel")}</p>}
          {nodesOf(openStep).filter((n) => n.evidence && n.evidence.job_ads > 0).map((n) => (
            <details key={n.skill_id} className="evidence-row">
              <summary>{t("ev.seenIn").replace("{n}", String(n.evidence!.job_ads))}{n.added_from_ads && <span className="badge good">{t("ev.added")}</span>}</summary>
              <Citations items={n.evidence!.citations} />
            </details>
          ))}
        </Sheet>
      )}
      {open?.kind === "about" && (
        <Sheet title={t("pw.about")} onClose={() => setOpen(null)}>
          <PlanAbout plan={plan} role={role} freeOnly={freeOnly} />
        </Sheet>
      )}
      {open?.kind === "goal" && (
        <Sheet title={t("pw.goalTitle")} onClose={() => setOpen(null)}>
          <ProgressPanel profile={profile} roleTitle={role.title} onProfile={onProfile} suggestedHours={suggestedHours} />
          <StudyCalendar plan={plan} roleTitle={role.title} onUseAsTarget={setSuggestedHours} />
        </Sheet>
      )}
      {open?.kind === "licence" && plan.requirements && (
        <Sheet title={t("rp.entry")} onClose={() => setOpen(null)}>
          <EntryRequirements req={plan.requirements} />
        </Sheet>
      )}
      {proving && (
        <ProofCheck profileId={profile.id} node={proving} isDemo={!!profile.is_demo}
          onDone={proven} onClose={() => { setProving(null); }} />
      )}
    </section>
  );
}
