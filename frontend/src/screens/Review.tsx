import { useEffect, useState, type ReactNode } from "react";
import { SkillPicker } from "../components/SkillPicker";
import { api, Audience, Profile, RoleOption, SendPreview, Skill } from "../lib/api";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { takeSent } from "../lib/sent";

const AUD_WORD: Record<Audience, StringKey> = { worker: "prof.audWorker", graduate: "prof.audGraduate", switcher: "prof.audSwitcher" };
const SENTENCE: Record<Audience, StringKey> = { worker: "prof.sentWorker", graduate: "prof.sentGraduate", switcher: "prof.sentSwitcher" };
const SUGGESTED = 4;

// Two uses: checking the skills read from a new CV (creates the profile), and "My profile" for an
// existing one (edits it in place, keeping its target role, progress and account).
export function Review({ initial, audience: startAudience, existing, onSaved, onBack, onAddMore, settings }: {
  initial: string[]; audience: Audience | null; existing: Profile | null;
  onSaved: (p: Profile) => void; onBack: () => void; onAddMore?: () => void; settings?: ReactNode;
}) {
  const [skills, setSkills] = useState(initial);
  const [audience, setAudience] = useState<Audience | null>(existing?.audience ?? startAudience);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [listsFailed, setListsFailed] = useState(false);
  const [currentRole, setCurrentRole] = useState(existing?.current_role_id ?? "");
  const [years, setYears] = useState(existing?.experience_years != null ? String(existing.experience_years) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sent] = useState(takeSent);  // an uploaded CV's scrubbed text, shown once
  const [addJob, setAddJob] = useState(false);  // a student opened "Add a part-time job"

  useEffect(() => {
    setListsFailed(false);
    Promise.all([api.skills(), api.roles()])
      .then(([s, r]) => { setAllSkills(s); setRoles(r); })
      .catch(() => setListsFailed(true));
  }, [attempt]);

  const editing = existing !== null;
  const needsRole = audience === "worker" || audience === "switcher";
  const name = (id: string) => tr(allSkills.find((s) => s.id === id)?.name ?? id);
  const role = roles.find((r) => r.id === currentRole);
  const suggested = [...(role?.skills ?? [])].sort((a, b) => b.weight - a.weight).map((s) => s.skill_id).slice(0, SUGGESTED);
  const blocked = busy || skills.length === 0 || (needsRole && !currentRole);
  const dirty = editing && (
    skills.join() !== existing.skills.join() || audience !== (existing.audience ?? null)
    || currentRole !== (existing.current_role_id ?? "") || years !== (existing.experience_years != null ? String(existing.experience_years) : ""));

  async function save() {
    setBusy(true); setError(null);
    const fields = { current_role_id: currentRole || null, skills, audience, experience_years: years === "" ? null : Number(years) };
    try {
      onSaved(editing
        ? await api.updateProfile({ ...existing, ...fields })
        : await api.createProfile({ display_name: null, ...fields }));
    } catch { setError(t("review.saveFailed")); }
    finally { setBusy(false); }
  }
  function undo() {
    if (!existing) return;
    setSkills(existing.skills); setAudience(existing.audience ?? null);
    setCurrentRole(existing.current_role_id ?? "");
    setYears(existing.experience_years != null ? String(existing.experience_years) : "");
  }

  const chips = (
    <ul className="chips skill-chips">
      {skills.map((id) => (
        <li key={id} className="chip covered">{name(id)}
          <button aria-label={tf("rv.remove", { name: name(id) })} onClick={() => setSkills(skills.filter((s) => s !== id))}>×</button>
        </li>
      ))}
    </ul>
  );
  const picker = (
    <SkillPicker skills={allSkills} have={skills} suggested={suggested} onAdd={(id) => setSkills([...skills, id])}
      suggestLabel={role ? tf("prof.suggest", { job: tr(role.title).toLowerCase() }) : undefined} />
  );
  const jobPick = (
    <span className={`prof-pick${needsRole && !currentRole ? " missing" : ""}`}>
      {role ? tr(role.title) : t("prof.chooseJob")} ▾
      <select value={currentRole} aria-label={t("rv.job")} onChange={(e) => setCurrentRole(e.target.value)}>
        <option value="">{t("rv.noJob")}</option>
        {roles.map((r) => <option key={r.id} value={r.id}>{tr(r.title)}</option>)}
      </select>
    </span>
  );
  const yearsPick = (
    <span className="prof-pick">
      <input type="number" min={0} max={60} value={years} placeholder="0" aria-label={t("rv.years")} onChange={(e) => setYears(e.target.value)} />
    </span>
  );

  if (!editing) {
    return (
      <section>
        <div className="page-head"><h1>{t("h.check")}</h1><p className="muted">{t("rv.sub")}</p></div>
        {sent && <SentNote sent={sent} />}
        {listsFailed && <ListsFailed retry={() => setAttempt((n) => n + 1)} />}
        {skills.length === 0 && (
          <div className="empty-state">
            <p>{t("rv.none")}</p>
            <button onClick={onBack}>{t("rv.back")}</button>
          </div>
        )}
        <h2 className="sr-only">{t("review.skills")}</h2>
        {chips}
        {picker}
        <div className="two-col">
          <label>{t("rv.job")}
            <select value={currentRole} onChange={(e) => setCurrentRole(e.target.value)}>
              <option value="">{t("rv.noJob")}</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{tr(r.title)}</option>)}
            </select>
          </label>
          <label>{t("rv.years")}
            <input type="number" min={0} max={60} value={years} onChange={(e) => setYears(e.target.value)} />
          </label>
        </div>
        {needsRole && !currentRole && <p className="muted" role="note">{t("aud.needRole")}</p>}
        <div className="actions">
          <button className="primary" disabled={blocked} onClick={save}>{busy ? t("rv.saving") : t("a.continue")}</button>
        </div>
        {error && <p className="error" role="alert">{error} <button className="link" onClick={save}>{t("shell.retry")}</button></p>}
      </section>
    );
  }

  const aud = audience ?? "worker";
  const showJob = aud !== "graduate" || !!currentRole || addJob;
  return (
    <section className="profile-page">
      <h1 className="sr-only">{t("nav.profile")}</h1>
      {sent && <SentNote sent={sent} />}
      {listsFailed && <ListsFailed retry={() => setAttempt((n) => n + 1)} />}
      <div className="prof-who">
        <span className="prof-avatar" aria-hidden="true">{(existing.display_name || t("prof.you")).trim().charAt(0).toUpperCase()}</span>
        <div>
          <p className="prof-name">{existing.display_name || t("prof.you")}</p>
          <p className="prof-sentence">
            {fill(t(SENTENCE[aud]), {
              aud: (
                <span className="prof-pick">{t(AUD_WORD[aud])} ▾
                  <select value={aud} aria-label={t("prof.audLabel")} onChange={(e) => setAudience(e.target.value as Audience)}>
                    {(Object.keys(AUD_WORD) as Audience[]).map((a) => <option key={a} value={a}>{t(AUD_WORD[a])}</option>)}
                  </select>
                </span>
              ),
              job: jobPick, years: yearsPick,
            })}
            {aud === "graduate" && (showJob
              ? <> {fill(t("prof.sentRecent"), { job: jobPick, years: yearsPick })}</>
              : <> <button className="link" onClick={() => setAddJob(true)}>{t("prof.addJob")}</button></>)}
          </p>
          {needsRole && !currentRole && <p className="prof-need" role="note">{t("aud.needRole")}</p>}
        </div>
      </div>

      <section className="prof-sec" aria-labelledby="prof-skills-h">
        <div className="prof-sec-head"><h2 id="prof-skills-h">{t("review.skills")}</h2><span className="muted">{tf("prof.count", { n: skills.length })}</span></div>
        {chips}
        {picker}
        {onAddMore && <button className="link prof-cv" onClick={onAddMore}>{t("prof.fromCv")}</button>}
      </section>

      {settings}

      {dirty && (
        <div className="save-bar" role="region" aria-label={t("prof.unsaved")}>
          <span>{t("prof.unsaved")}</span>
          <button className="save-bar-undo" onClick={undo} disabled={busy}>{t("prof.undo")}</button>
          <button className="save-bar-save" onClick={save} disabled={blocked} aria-busy={busy}>{busy ? t("rv.saving") : t("prof.save")}</button>
        </div>
      )}
      {error && <p className="error" role="alert">{error} <button className="link" onClick={save}>{t("shell.retry")}</button></p>}
    </section>
  );
}

/** Puts controls into a translated sentence: "I'm {aud} as a {job}" keeps each language's word order. */
function fill(template: string, parts: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((piece, i) => {
    const key = piece.match(/^\{(\w+)\}$/)?.[1];
    return key && key in parts ? <span key={i}>{parts[key]}</span> : piece;
  });
}

function ListsFailed({ retry }: { retry: () => void }) {
  return <p className="error" role="alert">{t("review.listsFailed")} <button className="link" onClick={retry}>{t("shell.retry")}</button></p>;
}

/** What the uploaded CV sent to the AI, after names, contact details and links were removed. */
function SentNote({ sent }: { sent: SendPreview }) {
  const removed = Object.entries(sent.removed);
  return (
    <>
      {sent.from_scan && <p className="banner warning">{t("rv.fromScan")}</p>}
      <details className="card sent-note">
        <summary>{t("rv.sentTitle")}{removed.length > 0 && ` · ${t("send.removed")}: ${removed.map(([k, n]) => `${t(`pii.${k}` as StringKey)} (${n})`).join(", ")}`}</summary>
        <pre className="sent-text">{sent.text}</pre>
      </details>
    </>
  );
}
