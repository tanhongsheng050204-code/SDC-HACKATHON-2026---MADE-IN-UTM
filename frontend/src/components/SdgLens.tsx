import { useMemo, useState } from "react";
import type { RoleMatch, Scenario } from "../lib/api";
import { percent, signed } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { SdgTile } from "./Sdgs";

// SDG lens: pick a goal you care about and see what choosing for it would cost or gain against your
// best match: study hours, fit and outlook. The ranking itself never changes (DECISIONS #13); the
// goal changes the choice by putting the trade-off in plain numbers, and the person decides.
export function SdgLens({ roles, scenario, onOpen, onlyGoal, onOnlyGoal }: {
  roles: RoleMatch[]; scenario: Scenario; onOpen: (r: RoleMatch) => void;
  onlyGoal: number | null; onOnlyGoal: (goal: number | null) => void;
}) {
  const [goal, setGoal] = useState<number | null>(() => Number(load(KEYS.sdgLens)) || null);
  const goals = useMemo(() => {
    const seen = new Map<number, RoleMatch["sdgs"][number]>();
    roles.forEach((r) => r.sdgs.forEach((g) => { if (!seen.has(g.number)) seen.set(g.number, g); }));
    return [...seen.values()].sort((a, b) => a.number - b.number);
  }, [roles]);
  if (!roles.length || !goals.length) return null;

  const pick = (n: number | null) => { setGoal(n); save(KEYS.sdgLens, n ? String(n) : null); if (!n) onOnlyGoal(null); };
  const top = roles[0];
  const serving = goal ? roles.filter((r) => r.sdgs.some((g) => g.number === goal)) : [];
  const best = serving[0];
  const inTop10 = serving.filter((r) => r.rank <= 10).length;
  const chosen = goals.find((g) => g.number === goal);

  return (
    <section className="card sdg-lens" aria-labelledby="lens-h">
      <h2 id="lens-h">{t("lens.title")}</h2>
      <p className="muted">{t("lens.sub")}</p>
      <div className="lens-goals" role="radiogroup" aria-label={t("lens.title")}>
        {goals.map((g) => (
          <button key={g.number} role="radio" aria-checked={goal === g.number} className={`lens-goal ${goal === g.number ? "on" : ""}`}
            onClick={() => pick(goal === g.number ? null : g.number)} title={`SDG ${g.number} ${tr(g.name)}`}>
            <SdgTile sdg={g} small /><span>{tr(g.name)}</span>
          </button>
        ))}
      </div>
      {chosen && (
        <div className="lens-result" aria-live="polite">
          {!best ? <p>{tf("lens.none", { goal: `SDG ${chosen.number} ${tr(chosen.name)}` })}</p> : (
            <>
              <p>{tf("lens.count", { n: inTop10, goal: `SDG ${chosen.number} ${tr(chosen.name)}` })}</p>
              {best.role_id === top.role_id ? <p><strong>{tf("lens.topServes", { role: tr(top.title) })}</strong></p> : (
                <>
                  <p>{tf("lens.best", { role: tr(best.title), rank: best.rank })}</p>
                  <ul className="lens-trade">
                    <li>{tf("lens.hours", { a: best.plan_hours ?? 0, b: top.plan_hours ?? 0, top: tr(top.title) })}</li>
                    <li>{tf("lens.fit", { a: percent(best.fit), b: percent(top.fit) })}</li>
                    <li>{tf("lens.outlook", { a: signed(best.outlook[scenario].index), b: signed(top.outlook[scenario].index) })}</li>
                  </ul>
                </>
              )}
              <div className="actions">
                <button className="btn ink" onClick={() => onOpen(best)}>{tf("lens.open", { role: tr(best.title) })}</button>
                <label className="check">
                  <input type="checkbox" checked={onlyGoal === chosen.number} onChange={(e) => onOnlyGoal(e.target.checked ? chosen.number : null)} />
                  {t("lens.only")}
                </label>
              </div>
            </>
          )}
          <p className="source">{t("lens.note")}</p>
        </div>
      )}
    </section>
  );
}
