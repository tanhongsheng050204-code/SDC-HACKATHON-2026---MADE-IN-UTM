import { useEffect, useState } from "react";
import { LoginToKeep } from "../components/AccountButton";
import { PathwayList } from "../components/PathwayList";
import { StudyCalendar } from "../components/StudyCalendar";
import { Citations } from "../components/SkillEvidence";
import { ProofCheck } from "../components/ProofCheck";
import { SkillRing } from "../components/SkillRing";
import { api, Pathway, Profile, RoleMatch, SkillTree as Tree, TreeNode } from "../lib/api";
import { percent } from "../lib/format";
import { levelName, t, tr } from "../lib/i18n";


// My pathway: the skill tree is the map (skills you have at the bottom, the role on top), each
// node carries the course that teaches it, and the ring fills as levels are proven. The List tab
// is the same plan as ordered courses, for hours, cost and printing.
export function SkillTree({ profile, role, userId, onProfile, onImpact, onBack }: {
  profile: Profile; role: RoleMatch; userId: string | null;
  onProfile: (p: Profile) => void; onImpact: () => void; onBack: () => void;
}) {
  const [tab, setTab] = useState<"tree" | "list">("tree");
  const [tree, setTree] = useState<Tree | null>(null);
  const [plan, setPlan] = useState<Pathway | null>(null);
  const [open, setOpen] = useState<TreeNode | null>(null);
  const [proving, setProving] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.tree(profile.id, role.role_id).then(setTree).catch(() => setError(t("tree.loadFailed")));
  }
  useEffect(load, [profile.id, role.role_id, profile.completed_courses.length]);
  useEffect(() => {
    if (tab === "list" && !plan) api.pathway(profile.id, role.role_id).then(setPlan).catch(() => setError(t("tree.loadFailed")));
  }, [tab, plan, profile.id, role.role_id]);

  async function refreshProfile() {
    try { onProfile(await api.getProfile(profile.id)); } catch { /* the tree already shows the change */ }
  }
  async function setCourse(courseId: string, done: boolean) {
    try {
      onProfile(await api.complete(profile.id, courseId, done));
      setPlan(null);
      if (tab === "list") setPlan(await api.pathway(profile.id, role.role_id));
    } catch { setError(t("tree.loadFailed")); }
  }
  async function proven(passed: boolean) {
    if (!passed) return;
    load();
    refreshProfile();
  }

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!tree) return <p className="muted">{t("a.loading")}</p>;

  const depths = Array.from(new Set(tree.nodes.map((n) => n.depth))).sort((a, b) => b - a);
  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {tr(tree.role.title)}</button>
      <div className="page-head"><h1>{t("path.title")}: {tr(tree.role.title)}</h1><p className="muted">{t("path.sub")}</p></div>
      <LoginToKeep userId={userId} isDemo={!!profile.is_demo} />

      <div className="card path-head">
        <div className="card-row"><strong>{t("path.readiness")}</strong><strong className="readiness-num">{percent(tree.readiness)}%</strong></div>
        <div className="fit" role="img" aria-label={`${t("path.readiness")} ${percent(tree.readiness)}%`}><div style={{ width: `${tree.readiness * 100}%` }} /></div>
        <span className="muted">{tree.total_steps} {t("path.steps")} · {tree.hours_left} {t("path.hoursLeft")}</span>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "tree"} onClick={() => setTab("tree")}>{t("path.tabTree")}</button>
        <button role="tab" aria-selected={tab === "list"} onClick={() => setTab("list")}>{t("path.tabList")}</button>
      </div>

      {tab === "tree" && (
        <div className="tree">
          <div className="tree-target">🎯 {tr(tree.role.title)}</div>
          {depths.map((d) => (
            <div key={d} className="tree-row">
              {tree.nodes.filter((n) => n.depth === d).map((n) => {
                const state = !n.unlocked ? t("tree.locked") : n.level ? levelName(n.level) : n.from_cv ? t("tree.fromCv") : t("tree.notStarted");
                const cls = ["tree-node", n.unlocked ? "" : "locked", n.step ? "has-step" : "", n.course_done ? "course-done" : ""].join(" ").trim();
                return (
                  <button key={n.skill_id} className={cls} onClick={() => setOpen(n)}
                    aria-label={`${n.step ? `${t("path.step")} ${n.step}, ` : ""}${tr(n.name)}: ${state}, ${n.level} / 3`}>
                    {n.step && <span className="tree-step">{t("path.step")} {n.step}</span>}
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
            <PathwayList plan={plan} role={role} onToggle={setCourse} />
            <StudyCalendar plan={plan} roleTitle={role.title} />
            <div className="actions">
              <button className="primary" onClick={onImpact}>{t("a.impact")}</button>
              <button onClick={() => window.print()}>{t("a.print")}</button>
            </div>
          </>
        : <p className="muted">{t("a.loading")}</p>)}

      {open && !proving && (
        <div className="dialog-backdrop" onClick={() => setOpen(null)}>
          <div className="dialog node-panel" role="dialog" aria-modal="true" aria-labelledby="node-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="node-title">{open.step ? `${t("path.step")} ${open.step}: ` : ""}{tr(open.name)}</h2>
            <div className="card-row"><SkillRing level={open.level} /><span className="muted">{open.level ? levelName(open.level) : t("tree.notStarted")}</span></div>
            {open.course
              ? <p><a href={open.course.url} target="_blank" rel="noreferrer">{tr(open.course.title)} ↗</a> · {open.course.hours} h</p>
              : <p className="muted">{t("path.noCourse")}</p>}
            {open.step && open.course && (
              <label className="check"><input type="checkbox" checked={open.course_done}
                onChange={(e) => { setCourse(open.course!.id, e.target.checked); setOpen({ ...open, course_done: e.target.checked }); }} /> {t("path.courseDone")}</label>
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
