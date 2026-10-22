import { FormEvent, useEffect, useState } from "react";
import { api, Application, ApplicationStatus } from "../lib/api";
import { shortDate } from "../lib/format";
import { t, tf } from "../lib/i18n";

const STATUSES: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "not_this_time"];
const TONE: Record<ApplicationStatus, string> = { saved: "", applied: "sky", interview: "gold", offer: "good", not_this_time: "" };

// Jobs the person saved or applied for, kept with their profile: title, employer, link, status,
// interview date and a short note (contact details are removed on the server). No CV or documents.
export function ApplicationTracker({ profileId, roleId }: { profileId: string; roleId: string }) {
  const [items, setItems] = useState<Application[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", employer: "", url: "" });

  useEffect(() => { api.applications(profileId).then(setItems).catch(() => setItems([])); }, [profileId]);
  const mine = (items ?? []).filter((a) => a.role_id === roleId || a.role_id === null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const made = await api.addApplication(profileId, { role_id: roleId, title: form.title.trim(), employer: form.employer.trim() || null, url: form.url.trim() || null });
      setItems((list) => [made, ...(list ?? [])]);
      setForm({ title: "", employer: "", url: "" }); setAdding(false);
    } catch (err) { setError(err instanceof Error ? err.message : t("app.failed")); }
  }
  async function change(a: Application, fields: Partial<Application>) {
    setItems((list) => (list ?? []).map((x) => (x.id === a.id ? { ...x, ...fields } : x)));
    try { const saved = await api.updateApplication(profileId, a.id, fields); setItems((list) => (list ?? []).map((x) => (x.id === a.id ? saved : x))); }
    catch { setItems((list) => (list ?? []).map((x) => (x.id === a.id ? a : x))); setError(t("app.failed")); }
  }
  async function remove(a: Application) {
    if (!window.confirm(tf("app.removeConfirm", { title: a.title }))) return;
    try { await api.deleteApplication(profileId, a.id); setItems((list) => (list ?? []).filter((x) => x.id !== a.id)); }
    catch { setError(t("app.failed")); }
  }

  return (
    <div className="card app-tracker">
      <div className="progress-head">
        <h2>{t("app.title")}</h2>
        {!adding && <button className="btn sm" onClick={() => setAdding(true)}>{t("app.add")}</button>}
      </div>
      <p className="muted">{t("app.sub")}</p>
      {adding && (
        <form className="app-form" onSubmit={add}>
          <label>{t("app.jobTitle")}<input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label>{t("app.employer")}<input maxLength={160} value={form.employer} onChange={(e) => setForm({ ...form, employer: e.target.value })} /></label>
          <label>{t("app.link")}<input type="url" maxLength={500} placeholder="https://" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          <div className="actions">
            <button className="btn ink" type="submit" disabled={!form.title.trim()}>{t("app.save")}</button>
            <button className="btn quiet" type="button" onClick={() => setAdding(false)}>{t("a.dismiss")}</button>
          </div>
        </form>
      )}
      {items !== null && mine.length === 0 && !adding && <p className="muted">{t("app.empty")}</p>}
      {mine.length > 0 && (
        <ul className="app-list">
          {mine.map((a) => (
            <li key={a.id}>
              <div className="app-main">
                <strong>{a.url ? <a href={a.url} target="_blank" rel="noreferrer">{a.title} ↗</a> : a.title}</strong>
                {a.employer && <span className="muted"> · {a.employer}</span>}
                <span className={`badge ${TONE[a.status]}`}>{t(`app.s.${a.status}`)}</span>
              </div>
              <div className="app-edit">
                <label>{t("app.status")}
                  <select value={a.status} onChange={(e) => change(a, { status: e.target.value as ApplicationStatus })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{t(`app.s.${s}`)}</option>)}
                  </select>
                </label>
                {(a.status === "interview" || a.interview_date) && (
                  <label>{t("app.interview")}
                    <input type="date" value={a.interview_date ?? ""} onChange={(e) => change(a, { interview_date: e.target.value || null })} />
                  </label>
                )}
                <button className="btn quiet sm" onClick={() => remove(a)} aria-label={tf("app.removeAria", { title: a.title })}>{t("app.remove")}</button>
              </div>
              {a.interview_date && <small className="muted">{tf("app.interviewOn", { date: shortDate(a.interview_date) })}</small>}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="source">{t("app.privacy")}</p>
    </div>
  );
}
