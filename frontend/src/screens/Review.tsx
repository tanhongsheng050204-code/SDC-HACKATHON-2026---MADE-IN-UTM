import { useEffect, useState } from "react";
import { SdgTile } from "../components/Sdgs";
import { api, Profile, RoleOption, Sdg, Skill } from "../lib/api";
import { t } from "../lib/i18n";

export function Review({ initial, onSaved, onBack }: { initial: string[]; onSaved: (p: Profile) => void; onBack: () => void }) {
  const [skills, setSkills] = useState(initial);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [sdgs, setSdgs] = useState<Sdg[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [interests, setInterests] = useState<number[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [years, setYears] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.skills().then(setAllSkills).catch(() => undefined);
    api.sdgs().then(setSdgs).catch(() => undefined);
    api.roles().then(setRoles).catch(() => undefined);
  }, []);

  const name = (id: string) => allSkills.find((s) => s.id === id)?.name ?? id;
  const notYet = allSkills.filter((s) => !skills.includes(s.id));
  const toggleGoal = (n: number) => setInterests(interests.includes(n) ? interests.filter((x) => x !== n) : [...interests, n]);

  async function save() {
    setBusy(true); setError(null);
    try {
      onSaved(await api.createProfile({
        display_name: null, current_role_id: currentRole || null, skills, interests,
        experience_years: years === "" ? null : Number(years),
      }));
    } catch { setError("Couldn't save your profile. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <section>
      <div className="page-head"><h1>{t("h.check")}</h1>
        <p className="muted">Remove anything that isn't right and add what we missed. Only these skills are saved, never your CV.</p></div>
      {skills.length === 0 && (
        <div className="empty-state">
          <p>We didn't find any skills. Add them below or go back and pick from the list.</p>
          <button onClick={onBack}>Back to my skills</button>
        </div>
      )}
      <div className="chips">
        {skills.map((id) => (
          <span key={id} className="chip covered">{name(id)}
            <button aria-label={`Remove ${name(id)}`} onClick={() => setSkills(skills.filter((s) => s !== id))}>×</button>
          </span>
        ))}
      </div>
      <label className="narrow">Add a skill we missed
        <select value={adding} onChange={(e) => { if (e.target.value) setSkills([...skills, e.target.value]); setAdding(""); }}>
          <option value="">Choose a skill</option>
          {notYet.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="two-col">
        <label>Current or most recent job
          <select value={currentRole} onChange={(e) => setCurrentRole(e.target.value)}>
            <option value="">Not working yet / not listed</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>
        <label>Years of work experience
          <input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
        </label>
      </div>
      <fieldset>
        <legend>Which goals matter to you? Roles that serve them move up your list.</legend>
        <div className="chips">
          {sdgs.map((g) => (
            <button key={g.number} className={interests.includes(g.number) ? "chip covered" : "chip"} aria-pressed={interests.includes(g.number)}
              onClick={() => toggleGoal(g.number)}>
              <SdgTile sdg={g} small />{g.name}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="primary" disabled={busy || skills.length === 0} onClick={save}>{busy ? "Saving…" : t("a.continue")}</button>
      {error && <p className="error" role="alert">{error} <button className="link" onClick={save}>{t("shell.retry")}</button></p>}
    </section>
  );
}
