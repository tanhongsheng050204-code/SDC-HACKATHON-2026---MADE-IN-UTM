import { EntryRequirements, years } from "../components/EntryRequirements";
import { useEffect, useRef, useState } from "react";
import { Tabs } from "../components/Tabs";
import { LoginToKeep } from "../components/AccountButton";
import { PathwayList } from "../components/PathwayList";
import { RouteMap } from "../components/RouteMap";
import { StudyCalendar } from "../components/StudyCalendar";
import { ProgressPanel } from "../components/ProgressPanel";
import { Citations } from "../components/SkillEvidence";
import { ProofCheck } from "../components/ProofCheck";
import { SkillRing } from "../components/SkillRing";
import { api, Pathway, Profile, RoleInfo, RoleMatch, SkillTree as Tree, TreeNode } from "../lib/api";
import { percent } from "../lib/format";
import { levelName, t, tf, tr } from "../lib/i18n";

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

// My pathway: GPS-style route map from your skills to a destination role.
// The Tree tab shows the skill dependency graph; the List tab shows ordered courses.
export function SkillTree({ profile, role, userId, onProfile, onImpact, onBack, onDestinations }: {
  profile: Profile; role: RoleMatch; userId: string | null;
  onProfile: (p: Profile) => void; onImpact: () => void; onBack: () => void; onDestinations: () => void;
}) {
  const [tab, setTab] = useState<"tree" | "list">("tree");
  const [tree, setTree] = useState<Tree | null>(null);
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [freeOnly, setFreeOnly] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleInfo | null>(null);
  const [open, setOpen] = useState<TreeNode | null>(null);
  const [proving, setProving] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [suggestedHours, setSuggestedHours] = useState<number | null>(null);
  const isDestination = profile.target_role_id === role.role_id;
  const dragStart = useRef<number | null>(null);
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

  // Fetch current role title for GPS header
  useEffect(() => {
    let cancelled = false;
    setCurrentRole(null);
    if (!profile.current_role_id) return;
    api.role(profile.current_role_id).then(p => { if (!cancelled) setCurrentRole(p); }).catch(() => {});
    return () => { cancelled = true; };
  }, [profile.current_role_id]);

  async function refreshProfile() {
    try { onProfile(await api.getProfile(profile.id)); } catch { /* tree already shows change */ }
  }

  async function setCourse(courseId: string, done: boolean, anchor?: HTMLElement) {
    if (saving) return;
    setSaving(true); setError(null);
    // Tick the box straight away; the refreshed plan (hours, readiness) follows from the server.
    const before = plan;
    setPlan(p => p && { ...p, steps: p.steps.map(s => s.course.id === courseId ? { ...s, done } : s) });
    try {
      onProfile(await api.complete(profile.id, courseId, done));
      if (done && anchor) spawnConfetti(anchor);
      setOpen(previous => previous?.course?.id === courseId ? { ...previous, course_done: done } : previous);
    } catch { setPlan(before); setError(t("target.failed")); }
    finally { setSaving(false); }
  }

  async function proven(passed: boolean) {
    if (!passed) return;
    loadTree();
    refreshProfile();
  }

  // ETA bar calculations (only when plan is loaded)
  const paidKnown = plan
    ? plan.steps.filter((s) => s.course.price_rm != null)
        .reduce((sum, s) => sum + (s.course.price_rm ?? 0), 0)
    : 0;
  const paidUnknownCount = plan
    ? plan.steps.filter((s) => s.course.cost === "paid" && s.course.price_rm == null).length
    : 0;

  const totalWeight = [...role.covered, ...role.missing].reduce((s, r) => s + r.weight, 0);
  const uncoveredWeight = plan
    ? [...role.covered, ...role.missing]
        .filter((m) => plan.uncovered_skills.includes(m.skill_id))
        .reduce((s, m) => s + m.weight, 0)
    : 0;
  const readinessAfter = totalWeight > 0 ? (totalWeight - uncoveredWeight) / totalWeight : 1;

  if (!tree) return <p className={error ? "error" : "muted"} role="status">{error || t("a.loading")}</p>;

  const depths = Array.from(new Set(tree.nodes.map((n) => n.depth))).sort((a, b) => b - a);

  // Difficulty in three layers. The steps are the learning order, so the step number against the
  // total places each skill in a band: the first third Easy, the middle third Intermediate, the
  // last third Hard. Skills you already have have no step and no band.
  const totalSteps = tree.total_steps || 0;
  const diffName = ["", t("tree.diffEasy"), t("tree.diffMedium"), t("tree.diffHard")];
  const difficultyOf = (step: number | null) =>
    !step || totalSteps < 1 ? 0 : Math.max(1, Math.min(3, Math.ceil((step * 3) / totalSteps)));

  return (
    <section className="pathway-page">
      <button className="link back-link" onClick={onBack}>← {tr(tree.role.title)}</button>
      <LoginToKeep userId={userId} isDemo={!!profile.is_demo} />
      {error && <p className="error" role="alert">{error}</p>}

      {/* GPS header */}
      <div className="gps-header">
        <h1 className="gps-route">
          <span className="eyebrow">
            {profile.current_role_id ? `${t("path.from")} ${currentRole ? tr(currentRole.title) : t("a.loading")}` : t("path.fromSkills")}
          </span>
          <span className="gps-sep">{t("path.to")}</span>
          <strong>{tr(role.title)}</strong>
        </h1>
        <button className="btn ink" onClick={onDestinations}>{t("path.changeDestination")}</button>
      </div>

      {/* Sticky ETA bar (only when plan is loaded) */}
      {plan && (
        <div className="eta-bar">
          <div className="eta-item">
            <span className="eta-value"><EtaNumber value={plan.hours_left} format={h => tf("path.etaHours", { h })} /></span>
          </div>
          {plan.requirements?.needs_licence && plan.requirements.licence && (
            <><div className="eta-divider" /><div className="eta-item">
              <span className="eta-value">{tf("req.etaPlus", { time: years(plan.requirements.licence.route_months) })}</span>
            </div></>
          )}
          {(
            <>
              <div className="eta-divider" />
              <div className="eta-item">
                <span className="eta-value">
                  {`RM ${paidKnown.toLocaleString()}`}
                  {paidKnown > 0 && paidUnknownCount > 0 ? " " : ""}
                  {paidUnknownCount > 0 ? tf("path.priceToConfirm", { n: paidUnknownCount }) : ""}
                </span>
              </div>
            </>
          )}
          <div className="eta-divider" />
          <div className="eta-item">
            <span className="eta-value">{tf("path.etaStops", { n: plan.steps.length })}</span>
          </div>
          <div className="eta-divider" />
          <div className="eta-item">
            <span className="eta-value"><EtaNumber value={percent(plan.readiness)} format={n => `${n}%`} /></span>
            <span className="eta-label">{t("path.readinessNow")}</span>
          </div>
          <span className="eta-label">→</span>
          <div className="eta-item">
            <span className="eta-value">{percent(readinessAfter)}%</span>
            <span className="eta-label">{t("path.readinessAfter")}</span>
          </div>
        </div>
      )}
      {plan && <div className="route-notes">
        <p className="source">{t("path.etaSource")} {Array.from(new Set(plan.steps.map(s => s.course.checked).filter(Boolean))).map(date => tf("pl.checked", { date: date! })).join(" · ")}</p>
        {plan.uncovered_skills.length > 0 && <p className="banner">{tf("pl.uncovered", { list: plan.uncovered_skills.map(id => tr([...role.covered, ...role.missing].find(s => s.skill_id === id)?.name ?? id)).join(", ") })}</p>}
      </div>}

      {/* Progress toward the destination: target date, weekly hours, on track or behind */}
      {isDestination && <ProgressPanel profile={profile} roleTitle={role.title} onProfile={onProfile} suggestedHours={suggestedHours} />}

      {/* A licensed job: its qualification route comes before any course */}
      {plan?.requirements?.needs_licence && <EntryRequirements req={plan.requirements} />}

      {/* Route map + free-only toggle */}
      <div className="pathway-layout">
          {plan && <RouteMap key={`${plan.role_id}-${freeOnly}`} plan={plan} title={role.title} />}
          <div className={`pathway-sheet ${expanded ? "expanded" : ""}`}>
            <button className="sheet-handle" aria-expanded={expanded} aria-controls="pathway-steps"
              onPointerDown={e => { dragStart.current = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }}
              onPointerUp={e => { if (dragStart.current !== null) setExpanded(Math.abs(e.clientY - dragStart.current) > 20 ? e.clientY < dragStart.current : !expanded); dragStart.current = null; }}
              onPointerCancel={() => { dragStart.current = null; }}
              onClick={e => { if (e.detail === 0) setExpanded(!expanded); }}
              onKeyDown={e => { if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setExpanded(e.key === "ArrowUp"); } }}>
              <span aria-hidden="true" />{t("path.sheetHandle")}
            </button>
          <div id="pathway-steps">
            <label className="free-toggle">
              <input
                type="checkbox"
                checked={freeOnly}
                disabled={saving}
                onChange={(e) => { setPlan(null); setFreeOnly(e.target.checked); }}
              />
              {t("path.freeOnly")}
            </label>
      <Tabs id="pathway" label={t("path.title")} tabs={[{ id: "tree", label: t("path.tabTree") }, { id: "list", label: t("path.tabList") }]} value={tab} onChange={setTab}>

      {tab === "tree" && (
        <div className="tree">
          <p className="source">{t("path.sub")}</p>
          <div className="tree-target">🎯 {tr(tree.role.title)}</div>
          {/* Colour key: rows show how far each skill sits from the target; colour depth and the
              chips carry the learning order and its difficulty. */}
          <ul className="tree-legend">
            <li><span className="swatch have" aria-hidden="true" />{t("tree.legendHave")}</li>
            <li><span className="swatch diff-1" aria-hidden="true" />{t("tree.diffEasy")}</li>
            <li><span className="swatch diff-2" aria-hidden="true" />{t("tree.diffMedium")}</li>
            <li><span className="swatch diff-3" aria-hidden="true" />{t("tree.diffHard")}</li>
            <li><span className="swatch locked" aria-hidden="true" />{t("tree.legendLocked")}</li>
            <li><span className="swatch done" aria-hidden="true">✓</span>{t("tree.legendDone")}</li>
          </ul>
          {depths.map((d) => (
            <div key={d} className="tree-row">
              {tree.nodes.filter((n) => n.depth === d).map((n) => {
                const state = !n.unlocked ? t("tree.locked") : n.level ? levelName(n.level) : n.from_cv ? t("tree.fromCv") : t("tree.notStarted");
                const diff = difficultyOf(n.step);
                const cls = ["tree-node",
                  diff ? `diff-${diff}` : "",
                  n.from_cv ? "from-cv" : "",
                  n.step ? "has-step" : "",
                  n.course_done ? "course-done" : "",
                  n.unlocked ? "" : "locked"].filter(Boolean).join(" ");
                return (
                  <button key={n.skill_id} className={cls} onClick={() => setOpen(n)}
                    aria-label={`${n.step ? `${t("path.step")} ${n.step}, ` : ""}${diff ? `${diffName[diff]}, ` : ""}${tr(n.name)}: ${state}, ${n.level} / 3`}>
                    {n.step && <span className="tree-step">{t("path.step")} {n.step}</span>}
                    {diff > 0 && <span className="tree-diff">{diffName[diff]}</span>}
                    <SkillRing level={n.level} />
                    <span className="tree-name">{tr(n.name)}</span>
                    <small>{state}</small>
                    {n.step && n.course && <span className="tree-course">{n.course_done ? "✓ " : ""}{tr(n.course.title)} · {n.course.hours} h</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="muted tree-foot">{t("tree.grows")}</p>
        </div>
      )}

      {tab === "list" && (plan
        ? <>
            <PathwayList plan={plan} role={role} freeOnly={freeOnly} saving={saving} onToggle={setCourse} />
            <StudyCalendar plan={plan} roleTitle={role.title} onUseAsTarget={isDestination ? setSuggestedHours : undefined} />
            <div className="actions">
              <button className="primary" onClick={onImpact}>{t("a.impact")}</button>
              <button onClick={() => window.print()}>{t("a.print")}</button>
            </div>
          </>
        : <p className="muted">{t("a.loading")}</p>)}
      </Tabs>
      </div></div></div>

      {open && !proving && (
        <div className="dialog-backdrop" onClick={() => setOpen(null)}>
          <div className="dialog node-panel" role="dialog" aria-modal="true" aria-labelledby="node-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="node-title">{open.step ? `${t("path.step")} ${open.step}: ` : ""}{tr(open.name)}</h2>
            <div className="card-row"><SkillRing level={open.level} /><span className="muted">{open.level ? levelName(open.level) : t("tree.notStarted")}</span></div>
            {open.course
              ? <p><a href={open.course.url} target="_blank" rel="noreferrer">{tr(open.course.title)} ↗</a> · {open.course.hours} h</p>
              : <p className="muted">{t("path.noCourse")}</p>}
            {open.step && open.course && (
              <label className="check"><input type="checkbox" checked={open.course_done} disabled={saving}
                onChange={(e) => { setCourse(open.course!.id, e.target.checked, e.currentTarget); }} /> {t("path.courseDone")}</label>
            )}
            {open.evidence && open.evidence.job_ads > 0 && (
              <details className="evidence-row">
                <summary>{t("ev.seenIn").replace("{n}", String(open.evidence.job_ads))}{open.added_from_ads && <span className="badge good">{t("ev.added")}</span>}</summary>
                <Citations items={open.evidence.citations} />
              </details>
            )}
            {!open.unlocked && <p className="muted">{t("path.lockedNote")}</p>}
            {open.level >= 3 && <p className="muted">{t("path.topLevel")}</p>}
            <div className="dialog-actions">
              <button className="btn ink" disabled={!open.unlocked || open.level >= 3} onClick={() => setProving(open)}>{t("path.prove")}</button>
              <button className="btn quiet" onClick={() => setOpen(null)}>{t("tree.close")}</button>
            </div>
          </div>
        </div>
      )}
      {proving && (
        <ProofCheck profileId={profile.id} node={proving} isDemo={!!profile.is_demo}
          onDone={proven} onClose={() => { setProving(null); setOpen(null); }} />
      )}
    </section>
  );
}
