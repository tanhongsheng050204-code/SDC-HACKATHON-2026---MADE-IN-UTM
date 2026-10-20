import { useEffect, useState } from "react";
import { SdgTile } from "../components/Sdgs";
import { api, RoleInfo, RoleMatch } from "../lib/api";
import { t } from "../lib/i18n";

export function Impact({ role, onBack }: { role: RoleMatch; onBack: () => void }) {
  const [info, setInfo] = useState<RoleInfo | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.role(role.role_id).then(setInfo).catch(() => setError(true)); }, [role.role_id]);

  // Skills the person is still learning come first: those are the contributions the plan adds.
  const skills = [...role.missing.map((s) => ({ ...s, learning: true })), ...role.covered.map((s) => ({ ...s, learning: false }))]
    .filter((s) => info?.skill_sdgs[s.skill_id]?.length);

  return (
    <section>
      <button className="link back-link" onClick={onBack}>← {t("nav.pathway")}</button>
      <div className="page-head"><h1>Your impact as {/^[aeiou]/i.test(role.title) ? "an" : "a"} {role.title}</h1>
        <p className="muted">How this role and its skills connect to the UN Sustainable Development Goals. Each link has a reason you can check.</p></div>
      <div className="grid">
        {role.sdgs.map((g) => (
          <div key={g.number} className="card sdg-card" style={{ borderTopColor: g.colour }}>
            <SdgTile sdg={g} />
            <h2>SDG {g.number}: {g.name}</h2>
            {g.target && <span className="muted">Target {g.target}</span>}
            <p>{g.reason}</p>
          </div>
        ))}
      </div>

      <h2>{t("impact.skills")}</h2>
      {error && <p className="error" role="alert">Couldn't load the skill-level goals.</p>}
      {!info && !error && <p className="muted">Loading…</p>}
      {info && skills.length === 0 && <p className="muted">None of this role's skills has its own SDG link yet.</p>}
      {skills.length > 0 && (
        <ul className="skill-sdgs">
          {skills.map((s) => (
            <li key={s.skill_id} className="card">
              <div className="card-row">
                <strong>{s.name}</strong>
                <span className={`badge ${s.learning ? "gold" : "good"}`}>{s.learning ? "In your plan" : "You have this"}</span>
              </div>
              {info!.skill_sdgs[s.skill_id].map((g) => (
                <p key={g.number} className="skill-sdg"><SdgTile sdg={g} small /><span><strong>SDG {g.number}</strong> {g.reason}</span></p>
              ))}
            </li>
          ))}
        </ul>
      )}
      <p className="source">Mappings: the Laluan team's SDG map (backend/data/sdg_map.json), using the UN goal and target list.</p>
    </section>
  );
}
