import { ReactNode } from "react";
import { LegalLinks } from "../screens/Legal";
import { type Journey, type JourneyStep, type Profile } from "../lib/api";
import { t } from "../lib/i18n";
import type { Screen } from "../lib/route";
import { LogoMark } from "./Brand";
import { Icon, IconName } from "./Icon";

interface Item { id: Screen; label: string; icon: IconName; enabled: boolean; hint?: string }

// The sidebar follows the four-step journey (lib/api Journey): where I stand, explore roles,
// build my skills, apply and share. Steps 3 and 4 open the target role, so they wait for one.
export function Sidebar({ current, roleId, profile, journey, model, settings, onGo, onHome }: {
  current: Screen; roleId: string | null; profile: Profile | null; journey: Journey | null; model: string | null;
  settings: ReactNode; onGo: (s: Screen) => void; onHome: () => void;
}) {
  const hasTarget = !!profile?.target_role_id;
  const needsTarget = profile ? t("shell.needsTarget") : t("shell.needsProfile");
  const done = (step: JourneyStep) => journey?.steps.find((s) => s.id === step)?.done ?? false;
  const groups: { step?: JourneyStep; label: string | null; items: Item[] }[] = [
    { label: null, items: [{ id: "home", label: t("nav.home"), icon: "home", enabled: !!profile }] },
    { step: "stand", label: `1 · ${t("step.stand")}`, items: [
      { id: "intake", label: t("nav.profile"), icon: "user", enabled: true },
      { id: "survey", label: t("nav.survey"), icon: "list", enabled: !!profile },
      { id: "tasks", label: t("nav.tasks"), icon: "list", enabled: !!profile },
      { id: "radar", label: t("nav.radar"), icon: "radar", enabled: !!profile },
    ] },
    { step: "explore", label: `2 · ${t("step.explore")}`, items: [
      { id: "roles", label: t("nav.roles"), icon: "briefcase", enabled: !!profile },
    ] },
    { step: "build", label: `3 · ${t("step.build")}`, items: [
      { id: "tree", label: t("nav.pathway"), icon: "route", enabled: hasTarget, hint: needsTarget },
      { id: "impact", label: t("nav.impact"), icon: "globe", enabled: hasTarget, hint: needsTarget },
    ] },
    { step: "apply", label: `4 · ${t("step.apply")}`, items: [
      { id: "role", label: t("nav.target"), icon: "target", enabled: hasTarget, hint: needsTarget },
    ] },
    { label: t("nav.more"), items: [
      { id: "sources", label: t("nav.sources"), icon: "book", enabled: true },
      { id: "workforce", label: t("nav.workforce"), icon: "users", enabled: true },
    ] },
  ];
  // A role page counts as "My target role" only for the target; any other role sits under Future roles.
  const here = current === "review" || current === "profile" ? "intake"
    : current === "role" && roleId !== profile?.target_role_id ? "roles" : current;

  return (
    <aside className="sidebar">
      <button className="brand" onClick={onHome} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></button>
      {profile && (
        <div className="who">
          <span className="avatar" aria-hidden="true">{(profile.display_name ?? "You").slice(0, 1)}</span>
          <span><strong>{profile.display_name ?? t("shell.yourProfile")}</strong><small>{profile.skills.length} {t("shell.skills")}</small></span>
        </div>
      )}
      <nav className="side-nav" aria-label={t("nav.sections")}>
        {groups.map((g) => (
          <div key={g.label ?? "top"} className="side-group">
            {g.label && (
              <div className="side-label">{g.label}{g.step && done(g.step) && <span className="side-done" aria-label={t("step.done")}> ✓</span>}</div>
            )}
            {g.items.map((item) => (
              <button key={item.id} className={here === item.id ? "side-link is-current" : "side-link"}
                aria-current={here === item.id ? "page" : undefined} disabled={!item.enabled}
                title={item.enabled ? undefined : item.hint ?? t("shell.needsProfile")}
                onClick={() => onGo(item.id)}>
                <Icon name={item.icon} />{item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="side-foot">
        {model && <p className="side-note">{t("shell.model")}: {model}</p>}
        <p className="side-note">{t("shell.estimates")}</p>
        <p className="side-note"><LegalLinks /></p>
        {settings}
      </div>
    </aside>
  );
}
