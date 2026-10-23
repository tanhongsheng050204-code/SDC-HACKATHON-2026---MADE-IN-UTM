import { ReactNode, useState } from "react";
import { type Journey, type JourneyStep, type Profile } from "../lib/api";
import { t, type StringKey } from "../lib/i18n";
import type { Screen } from "../lib/route";
import { LogoMark } from "./Brand";
import { Icon, IconName } from "./Icon";
import { Sheet } from "./Sheet";

interface Item { id: Screen; label: string; icon: IconName; enabled: boolean; hint?: string }

// The sidebar follows the four-step journey (lib/api Journey) under short headings: Me, Explore,
// Build, Apply, each ticked when done. Build and Apply open the target role, so they wait for one.
// Sources and For organisations fold under More; the account button at the bottom opens Settings.
// On a phone it becomes a bottom bar of five tabs, with the rest in a More sheet.
export function Sidebar({ current, roleId, profile, journey, account, settings, onGo, onHome }: {
  current: Screen; roleId: string | null; profile: Profile | null; journey: Journey | null;
  account: ReactNode; settings: ReactNode; onGo: (s: Screen) => void; onHome: () => void;
}) {
  const [more, setMore] = useState(false);
  const hasTarget = !!profile?.target_role_id;
  const needsTarget = profile ? t("shell.needsTarget") : t("shell.needsProfile");
  const done = (step: JourneyStep) => journey?.steps.find((s) => s.id === step)?.done ?? false;
  const item = (id: Screen, label: StringKey, icon: IconName, enabled: boolean, hint?: string): Item => ({ id, label: t(label), icon, enabled, hint });
  const it = {
    home: item("home", "nav.home", "home", !!profile),
    intake: item("intake", "nav.profile", "user", true),
    survey: item("survey", "nav.survey", "heart", !!profile),
    tasks: item("tasks", "nav.tasks", "list", !!profile),
    radar: item("radar", "nav.radar", "radar", !!profile),
    roles: item("roles", "nav.roles", "briefcase", !!profile),
    tree: item("tree", "nav.pathway", "route", hasTarget, needsTarget),
    impact: item("impact", "nav.impact", "globe", hasTarget, needsTarget),
    role: item("role", "nav.target", "target", hasTarget, needsTarget),
    sources: item("sources", "nav.sources", "book", true),
    workforce: item("workforce", "h.workforce", "users", true),
  };
  const groups: { step?: JourneyStep; label: StringKey | null; items: Item[] }[] = [
    { label: null, items: [it.home] },
    { step: "stand", label: "side.me", items: [it.intake, it.survey, it.tasks, it.radar] },
    { step: "explore", label: "side.explore", items: [it.roles] },
    { step: "build", label: "side.build", items: [it.tree, it.impact] },
    { step: "apply", label: "side.apply", items: [it.role] },
  ];
  // A role page counts as "My target role" only for the target; any other role sits under Future roles.
  const here = current === "review" || current === "profile" ? "intake"
    : current === "role" && roleId !== profile?.target_role_id ? "roles" : current;
  const link = (i: Item, after?: () => void) => (
    <button key={i.id} className={here === i.id ? "side-link is-current" : "side-link"}
      aria-current={here === i.id ? "page" : undefined} disabled={!i.enabled}
      title={i.enabled ? undefined : i.hint ?? t("shell.needsProfile")}
      onClick={() => { after?.(); onGo(i.id); }}>
      <Icon name={i.icon} />{i.label}
    </button>
  );
  const tabs: Item[] = [it.home, { ...it.intake, label: t("side.me") }, { ...it.roles, label: t("side.roles") }, it.tree];
  const rest = [it.survey, it.tasks, it.radar, it.impact, it.role, it.sources, it.workforce];
  const inRest = rest.some((i) => i.id === here);

  return (
    <>
      <aside className="sidebar">
        <button className="brand" onClick={onHome} aria-label={t("nav.homeAria")}><LogoMark /><span>Laluan</span></button>
        <nav className="side-nav" aria-label={t("nav.sections")}>
          {groups.map((g) => (
            <div key={g.label ?? "top"} className="side-group">
              {g.label && (
                <div className="side-label">{t(g.label)}{g.step && done(g.step) && <span className="side-done" aria-label={t("step.done")}>✓</span>}</div>
              )}
              {g.items.map((i) => link(i))}
            </div>
          ))}
          <details className="side-group side-more" open={here === "sources" || here === "workforce" || undefined}>
            <summary className="side-link"><Icon name="more" />{t("nav.more")}</summary>
            {link(it.sources)}{link(it.workforce)}
          </details>
        </nav>
        <div className="side-foot">{account}</div>
      </aside>

      <nav className="bottom-nav" aria-label={t("nav.sections")}>
        {tabs.map((i) => (
          <button key={i.id} className={here === i.id ? "is-current" : ""} aria-current={here === i.id ? "page" : undefined}
            disabled={!i.enabled} onClick={() => onGo(i.id)}><Icon name={i.icon} /><span>{i.label}</span></button>
        ))}
        <button className={inRest ? "is-current" : ""} aria-haspopup="dialog" aria-expanded={more} onClick={() => setMore(true)}>
          <Icon name="more" /><span>{t("nav.more")}</span></button>
      </nav>
      {more && (
        <Sheet title={t("nav.more")} onClose={() => setMore(false)}>
          <div className="more-sheet">
            {rest.map((i) => link(i, () => setMore(false)))}
            {settings}
          </div>
        </Sheet>
      )}
    </>
  );
}
