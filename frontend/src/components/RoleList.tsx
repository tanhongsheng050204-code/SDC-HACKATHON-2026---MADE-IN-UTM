import { KeyboardEvent, useLayoutEffect, useRef } from "react";
import type { RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { Icon } from "./Icon";

const calm = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.lite === "1";

// Every role in one dense list. Rows slide to their new place when the ranking changes (FLIP,
// 350 ms; none with reduce-motion or Lite mode). Up / Down / Home / End move between rows.
export function RoleList({ roles, scenario, targetId, onOpen }: {
  roles: RoleMatch[]; scenario: Scenario; targetId: string | null | undefined; onOpen: (r: RoleMatch) => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const last = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const now = new Map<string, number>();
    rows.current.forEach((el, id) => now.set(id, el.getBoundingClientRect().top));
    if (!calm()) {
      now.forEach((top, id) => {
        const before = last.current.get(id);
        const el = rows.current.get(id);
        if (before !== undefined && el && Math.abs(before - top) > 1) {
          el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "none" }], { duration: 350, easing: "ease-out" });
        }
      });
    }
    last.current = now;
  }, [roles.map((r) => r.role_id).join(",")]);

  function keys(e: KeyboardEvent<HTMLUListElement>) {
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button.role-row")];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? buttons.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    buttons[Math.max(0, Math.min(buttons.length - 1, to))].focus();
  }

  return (
    <div className="role-list">
      <div className="role-row role-list-head" aria-hidden="true">
        <span>#</span><span>{t("rl.role")}</span><span>{t("rl.fit")}</span><span>{t("rl.outlook")}</span><span>{t("rl.hours")}</span>
      </div>
      <ul aria-label={t("rl.title")} onKeyDown={keys}>
        {roles.map((r) => {
          const o = r.outlook[scenario];
          const move = r.rank_without_extra !== undefined ? r.rank_without_extra - r.rank : r.rank_change_vs_baseline;
          return (
            <li key={r.role_id} ref={(el) => { if (el) rows.current.set(r.role_id, el); else rows.current.delete(r.role_id); }}>
              <button className={`role-row${r.at_risk ? " at-risk" : ""}`} onClick={() => onOpen(r)}>
                <span className="rank">#{r.rank}{move > 0 ? <small className="up"> ▲{move}</small> : move < 0 ? <small className="down"> ▼{-move}</small> : null}</span>
                <span className="role-row-title">
                  <strong>{tr(r.title)}</strong>
                  {r.role_id === targetId && <span className="badge good"><Icon name="flag" />{t("ro.destination")}</span>}
                  {r.robust_pick && <span className="badge gold">{t("card.robust")}</span>}
                  {r.is_current_role && <span className="badge">{t("card.current")}</span>}
                  {r.long_shot && <span className="badge risk">{t("card.longShot")}</span>}
                </span>
                <span className="role-row-fit">
                  <span className="fit" role="img" aria-label={tf("card.fitAria", { n: percent(r.fit) })}><span style={{ width: `${r.fit * 100}%` }} /></span>
                  <small>{percent(r.fit)}%</small>
                </span>
                <span className="role-row-outlook">
                  <span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span>
                  <small className="muted">{tf("rl.range", { low: signed(r.estimate_range.low), high: signed(r.estimate_range.high), year: r.estimate_range.year })}</small>
                </span>
                <span className="role-row-hours">{r.plan_hours ? tf("rl.planHours", { h: r.plan_hours }) : "—"}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
