import { useEffect, useState } from "react";
import { api, Audience, Profile, RoleOption, SendPreview, Skill } from "../lib/api";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { takeSent } from "../lib/sent";

const AUDIENCES: { id: Audience; label: "aud.worker" | "aud.graduate" | "aud.switcher" }[] = [
  { id: "worker", label: "aud.worker" }, { id: "graduate", label: "aud.graduate" }, { id: "switcher", label: "aud.switcher" },
];

// Two uses: checking the skills read from a new CV (creates the profile), and "My profile" for an
// existing one (edits it in place, keeping its target role, progress and account).
export function Review({ initial, audience: startAudience, existing, onSaved, onBack, onAddMore, onStartOver }: {
  initial: string[]; audience: Audience | null; existing: Profile | null;
  onSaved: (p: Profile) => void; onBack: () => void; onAddMore?: () => void; onStartOver?: () => void;
}) {
  const [skills, setSkills] = useState(initial);
  const [audience, setAudience] = useState<Audience | null>(existing?.audience ?? startAudience);
  const [allSkills, setAllSkills] = useState<Skill[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [listsFailed, setListsFailed] = useState(false);
  const [currentRole, setCurrentRole] = useState(existing?.current_role_id ?? "");
  const [years, setYears] = useState(existing?.experience_years != null ? String(existing.experience_years) : "");
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sent] = useState(takeSent);  // an uploaded CV's scrubbed text, shown once

  useEffect(() => {
    setListsFailed(false);
    Promise.all([api.skills(), api.roles()])
      .then(([s, r]) => { setAllSkills(s); setRoles(r); })
      .catch(() => setListsFailed(true));
  }, [attempt]);

  const editing = existing !== null;
  const needsRole = audience === "worker" || audience === "switcher";
  const name = (id: string) => tr(allSkills.find((s) => s.id === id)?.name ?? id);
  const notYet = allSkills.filter((s) => !skills.includes(s.id));

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

  return (
    <section>
      <div className="page-head"><h1>{editing ? t("nav.profile") : t("h.check")}</h1>
        <p className="muted">{editing ? t("review.editSub") : t("rv.sub")}</p></div>
      {sent && <SentNote sent={sent} />}
      {listsFailed && (
        <p className="error" role="alert">{t("review.listsFailed")} <button className="link" onClick={() => setAttempt((n) => n + 1)}>{t("shell.retry")}</button></p>
      )}
      {editing && (
        <fieldset className="audience-pick">
          <legend>{t("aud.title")}</legend>
          <div className="segmented" role="radiogroup" aria-label={t("aud.title")}>
            {AUDIENCES.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={audience === a.id} onClick={() => setAudience(a.id)}>{t(a.label)}</button>
            ))}
          </div>
        </fieldset>
      )}
      {skills.length === 0 && (
        <div className="empty-state">
          <p>{t("rv.none")}</p>
          <button onClick={onBack}>{t("rv.back")}</button>
        </div>
      )}
      <h2 className="sr-only">{t("review.skills")}</h2>
      <div className="chips">
        {skills.map((id) => (
          <span key={id} className="chip covered">{name(id)}
            <button aria-label={tf("rv.remove", { name: name(id) })} onClick={() => setSkills(skills.filter((s) => s !== id))}>×</button>
          </span>
        ))}
      </div>
      <div className="two-col">
        <label>{t("rv.add")}
          <select value={adding} onChange={(e) => { if (e.target.value) setSkills([...skills, e.target.value]); setAdding(""); }}>
            <option value="">{t("rv.choose")}</option>
            {notYet.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}
          </select>
        </label>
        {editing && onAddMore && (
          <div className="review-more"><span className="muted">{t("review.fromCv")}</span>
            <button className="btn quiet sm" onClick={onAddMore}>{t("review.addMore")}</button></div>
        )}
      </div>
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
        <button className="primary" disabled={busy || skills.length === 0 || (needsRole && !currentRole)} onClick={save}>
          {busy ? t("rv.saving") : editing ? t("review.save") : t("a.continue")}
        </button>
        {editing && onStartOver && <button className="btn quiet" onClick={onStartOver}>{t("review.startOver")}</button>}
      </div>
      {error && <p className="error" role="alert">{error} <button className="link" onClick={save}>{t("shell.retry")}</button></p>}
    </section>
  );
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
