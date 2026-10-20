import { ReactNode } from "react";
import type { Profile } from "../lib/api";
import { t } from "../lib/i18n";
import type { Screen } from "../lib/route";
import { LogoMark } from "./Brand";
import { Icon, IconName } from "./Icon";

interface Item { id: Screen; label: string; icon: IconName; enabled: boolean }

export function Sidebar({ current, profile, hasRole, model, prefs, onGo, onHome, onDelete }: {
  current: Screen; profile: Profile | null; hasRole: boolean; model: string | null; prefs: ReactNode;
  onGo: (s: Screen) => void; onHome: () => void; onDelete: () => void;
}) {
  const groups: { label: string | null; items: Item[] }[] = [
    { label: null, items: [{ id: "intake", label: t("nav.profile"), icon: "user", enabled: true }] },
    { label: t("nav.signals"), items: [
      { id: "radar", label: t("nav.radar"), icon: "radar", enabled: !!profile },
      { id: "tasks", label: t("nav.tasks"), icon: "list", enabled: !!profile },
      { id: "sources", label: t("nav.sources"), icon: "book", enabled: true },
    ] },
    { label: t("nav.future"), items: [
      { id: "roles", label: t("nav.roles"), icon: "briefcase", enabled: !!profile },
      { id: "role", label: t("nav.pathway"), icon: "route", enabled: hasRole },
      { id: "impact", label: t("nav.impact"), icon: "globe", enabled: hasRole },
    ] },
    { label: t("nav.org"), items: [{ id: "workforce", label: t("nav.workforce"), icon: "users", enabled: true }] },
  ];
  const here = current === "review" ? "intake" : current;

  return (
    <aside className="sidebar">
      <button className="brand" onClick={onHome} aria-label="Laluan home"><LogoMark /><span>Laluan</span></button>
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
              <button key={item.id} className={here === item.id ? "side-link is-current" : "side-link"}
                aria-current={here === item.id ? "page" : undefined} disabled={!item.enabled}
                title={item.enabled ? undefined : t("shell.needsProfile")}
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
        <div className="side-prefs">{prefs}</div>
        {profile && <button className="side-link danger" onClick={onDelete}><Icon name="trash" />{t("shell.delete")}</button>}
      </div>
    </aside>
  );
}
