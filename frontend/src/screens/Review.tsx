import { useEffect, useState } from "react";
import { api, Audience, Profile, RoleOption, Skill } from "../lib/api";
import { t } from "../lib/i18n";

export function Review({ initial, audience, onSaved, onBack }: {
  initial: string[]; audience: Audience | null; onSaved: (p: Profile) => void; onBack: () => void;
}) {
  const [skills, setSkills] = useState(initial);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [currentRole, setCurrentRole] = useState("");
  const [years, setYears] = useState("");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.skills().then(setAllSkills).catch(() => undefined);
    api.roles().then(setRoles).catch(() => undefined);
  }, []);

  const needsRole = audience === "worker" || audience === "switcher";
  const name = (id: string) => allSkills.find((s) => s.id === id)?.name ?? id;
  const notYet = allSkills.filter((s) => !skills.includes(s.id));

  async function save() {
    setBusy(true); setError(null);
    try {
      onSaved(await api.createProfile({
        display_name: null, current_role_id: currentRole || null, skills, audience,
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
      {needsRole && !currentRole && <p className="muted" role="note">{t("aud.needRole")}</p>}
      <button className="primary" disabled={busy || skills.length === 0 || (needsRole && !currentRole)} onClick={save}>{busy ? "Saving…" : t("a.continue")}</button>
      {error && <p className="error" role="alert">{error} <button className="link" onClick={save}>{t("shell.retry")}</button></p>}
    </section>
  );
}
