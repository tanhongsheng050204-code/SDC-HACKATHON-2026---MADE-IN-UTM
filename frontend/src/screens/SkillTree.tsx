import { useEffect, useState } from "react";
import { LoginToKeep } from "../components/AccountButton";
import { ProofCheck } from "../components/ProofCheck";
import { SkillRing } from "../components/SkillRing";
import { api, Profile, SkillTree as Tree, TreeNode } from "../lib/api";
import { t } from "../lib/i18n";

const LEVELS = ["", "Basic", "Working", "Advanced"];

// The classic tree: skills you have at the bottom, the target role on top. Each ring fills as a
// level is proven by a proof check.
export function SkillTree({ profile, roleId, userId, onProfile, onBack }: {
  profile: Profile; roleId: string; userId: string | null;
  onProfile: (p: Profile) => void; onBack: () => void;
}) {
  const [tree, setTree] = useState<Tree | null>(null);
  const [open, setOpen] = useState<TreeNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.tree(profile.id, roleId).then(setTree).catch(() => setError(t("tree.loadFailed")));
  }
  useEffect(load, [profile.id, roleId]);

  async function finished(passed: boolean) {
    if (!passed) return;
    load();
    try { onProfile(await api.getProfile(profile.id)); } catch { /* the tree already shows the new level */ }
  }

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!tree) return <p className="muted">{t("a.loading")}</p>;

  const depths = Array.from(new Set(tree.nodes.map((n) => n.depth))).sort((a, b) => b - a);
  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {tree.role.title}</button>
      <div className="page-head"><h1>{t("tree.title")}</h1><p className="muted">{t("tree.sub")}</p></div>
      <LoginToKeep userId={userId} isDemo={!!profile.is_demo} />
      <div className="tree">
        <div className="tree-target">🎯 {tree.role.title}</div>
        {depths.map((d) => (
          <div key={d} className="tree-row">
            {tree.nodes.filter((n) => n.depth === d).map((n) => {
              const state = !n.unlocked ? t("tree.locked") : n.level ? LEVELS[n.level] : n.from_cv ? t("tree.fromCv") : t("tree.notStarted");
              return (
                <button key={n.skill_id} className={n.unlocked ? "tree-node" : "tree-node locked"}
                  disabled={!n.unlocked || n.level >= 3} onClick={() => setOpen(n)}
                  aria-label={`${n.name}: ${state}, ${n.level} / 3`}>
                  <SkillRing level={n.level} />
                  <span className="tree-name">{n.name}</span>
                  <small>{state}</small>
                </button>
              );
            })}
          </div>
        ))}
        <p className="muted tree-foot">{t("tree.grows")}</p>
      </div>
      {open && (
        <ProofCheck profileId={profile.id} node={open} isDemo={!!profile.is_demo}
          onDone={finished} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}
