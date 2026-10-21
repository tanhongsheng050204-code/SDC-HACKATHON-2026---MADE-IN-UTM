import { useEffect, useRef, useState } from "react";
import { api, Pathway, Profile, RoleMatch, Scenario } from "../lib/api";
import { percent } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";
import { etaFacts } from "./EtaBar";
import { Icon } from "./Icon";

// Three route options, like a sat-nav offering routes: the top three roles with the hours and
// cost of their course plans. Plans do not depend on the scenario, so each is fetched once and
// reused when the scenario or year changes; "…" shows while one loads.
export function RouteOptions({ profile, roles, scenario, onOpen }: {
  profile: Profile; roles: RoleMatch[]; scenario: Scenario; onOpen: (r: RoleMatch) => void;
}) {
  const top = roles.slice(0, 3);
  const [plans, setPlans] = useState<Record<string, Pathway | "failed">>({});
  const asked = useRef(new Set<string>());
  const done = profile.completed_courses.length;

  useEffect(() => { asked.current.clear(); setPlans({}); }, [profile.id, done]);
  useEffect(() => {
    for (const r of top) {
      if (asked.current.has(r.role_id)) continue;
      asked.current.add(r.role_id);
      api.pathway(profile.id, r.role_id)
        .then((p) => setPlans((all) => ({ ...all, [r.role_id]: p })))
        .catch(() => setPlans((all) => ({ ...all, [r.role_id]: "failed" })));
    }
  }, [profile.id, done, top.map((r) => r.role_id).join(",")]);

  if (!top.length) return null;
  return (
    <section className="route-options" aria-labelledby="route-options-h">
      <h2 id="route-options-h">{t("ro.title")}</h2>
      <ol>
        {top.map((r, i) => {
          const plan = plans[r.role_id];
          const eta = plan && plan !== "failed" ? etaFacts(plan, r) : null;
          const o = r.outlook[scenario];
          const dest = r.role_id === profile.target_role_id;
          return (
            <li key={r.role_id}>
              <button className={`card route-option${i === 0 ? " is-first" : ""}${dest ? " is-dest" : ""}`} onClick={() => onOpen(r)}>
                <span className="route-option-badges">
                  {i === 0 && <span className="badge good">{t("ro.recommended")}</span>}
                  {dest && <span className="badge good"><Icon name="flag" />{t("ro.destination")}</span>}
                  {r.robust_pick && <span className="badge gold">{t("card.robust")}</span>}
                </span>
                <strong className="route-option-title">{tr(r.title)}</strong>
                <span className="route-option-eta">
                  {eta ? <><b>{tf("ro.hours", { h: eta.hours })}</b><span>{eta.rm}</span></>
                    : plan === "failed" ? <span className="muted">{t("ro.noPlan")}</span>
                    : <span className="muted" aria-label={t("ro.loading")}>…</span>}
                </span>
                <span className="route-option-meta">
                  <span>{tf("card.fit", { n: percent(r.fit) })}</span>
                  <span className={`badge ${OUTLOOK_TONE[o.label]}`}>{OUTLOOK_TEXT[o.label]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
