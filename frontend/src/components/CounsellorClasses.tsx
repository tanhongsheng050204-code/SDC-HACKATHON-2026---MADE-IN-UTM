import { useEffect, useId, useState } from "react";
import { api, ClassDashboard, CounsellorMe, ProgressStatus } from "../lib/api";
import { percent, shortDate } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { AccountButton } from "./AccountButton";
import { STATUS_KEY, STATUS_TONE } from "./ProgressPanel";

type Filter = "all" | ProgressStatus | "no_date";

// Career-centre counsellors (approved by an admin): make a class, share its join code, and see
// each student who joined with only the fields they agreed to share.
export function CounsellorClasses({ userId }: { userId: string | null }) {
  const [me, setMe] = useState<CounsellorMe | null>(null);
  const [name, setName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [className, setClassName] = useState("");
  const [open, setOpen] = useState<ClassDashboard | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (!userId) { setMe(null); return; }
    api.counsellorMe().then(setMe).catch(() => setError(t("cls.loadFailed")));
  }, [userId]);

  async function request() {
    setError(null);
    try { setMe(await api.counsellorRequest(name.trim(), organisation.trim())); } catch { setError(t("cls.loadFailed")); }
  }
  async function create() {
    setError(null);
    try { await api.createClass(className.trim()); setClassName(""); setMe(await api.counsellorMe()); } catch { setError(t("cls.loadFailed")); }
  }
  async function show(classId: string) {
    setError(null);
    try { setOpen(await api.classDashboard(classId)); setFilter("all"); } catch { setError(t("cls.loadFailed")); }
  }
  async function remove(classId: string, label: string) {
    if (!window.confirm(tf("cls.deleteConfirm", { name: label }))) return;
    try { await api.deleteClass(classId); setOpen(null); setMe(await api.counsellorMe()); } catch { setError(t("cls.loadFailed")); }
  }

  if (!userId) return (
    <div className="card counsellor"><h2>{t("cls.title")}</h2><p className="muted">{t("cls.loginFirst")}</p><AccountButton userId={null} className="btn ink" /></div>
  );
  if (!me) return error ? <p className="error" role="alert">{error}</p> : <p className="muted">{t("a.loading")}</p>;
  const joinLink = (code: string) => `${window.location.origin}/?join=${code}`;
  const students = open ? open.students.filter((s) => filter === "all" || (filter === "no_date" ? s.status === null : s.status === filter)) : [];

  return (
    <div className="counsellor">
      <div className="card">
        <h2>{t("cls.title")}</h2>
        <p className="muted">{t("cls.sub")}</p>
        {me.status === null && (
          <form className="progress-form" onSubmit={(e) => { e.preventDefault(); request(); }}>
            <label htmlFor={`${id}-n`}>{t("cls.yourName")}<input id={`${id}-n`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
            <label htmlFor={`${id}-o`}>{t("cls.org")}<input id={`${id}-o`} value={organisation} maxLength={120} onChange={(e) => setOrganisation(e.target.value)} /></label>
            <button className="btn ink" type="submit" disabled={name.trim().length < 2 || organisation.trim().length < 2}>{t("cls.request")}</button>
          </form>
        )}
        {me.status === "pending" && <p className="banner info" role="status">{t("cls.pending")}</p>}
        {me.status === "revoked" && <p className="banner error" role="status">{t("cls.revoked")}</p>}
        {me.status === "approved" && (
          <>
            <form className="progress-form" onSubmit={(e) => { e.preventDefault(); create(); }}>
              <label htmlFor={`${id}-c`}>{t("cls.className")}<input id={`${id}-c`} value={className} maxLength={80} onChange={(e) => setClassName(e.target.value)} /></label>
              <button className="btn ink" type="submit" disabled={className.trim().length < 2}>{t("cls.create")}</button>
            </form>
            {me.classes.length === 0 ? <p className="muted">{t("cls.none")}</p> : (
              <ul className="class-list">
                {me.classes.map((c) => (
                  <li key={c.id}>
                    <span><strong>{c.name}</strong> · {tf("cls.members", { n: c.members })}<br />
                      <small>{t("cls.code")}: <code className="class-code">{c.code}</code> · <span className="muted">{joinLink(c.code)}</span></small></span>
                    <span className="actions">
                      <button className="btn ink sm" onClick={() => show(c.id)}>{t("cls.open")}</button>
                      <button className="btn quiet sm" onClick={() => navigator.clipboard?.writeText(joinLink(c.code)).then(() => setCopied(c.id)).catch(() => {})}>
                        {copied === c.id ? t("cls.copied") : t("cls.copy")}</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {open && (
        <div className="card class-board">
          <div className="progress-head">
            <h2>{open.name}</h2>
            <button className="btn quiet sm" onClick={() => remove(open.id, open.name)}>{t("cls.delete")}</button>
          </div>
          <p className="muted">{t("cls.boardNote")}</p>
          <div className="chips" role="radiogroup" aria-label={t("cls.filter")}>
            {(["all", "on_track", "ahead", "behind", "done", "no_date"] as const).map((f) => (
              <button key={f} role="radio" aria-checked={filter === f} className={`chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
                {f === "all" ? tf("cls.all", { n: open.students.length }) : `${f === "no_date" ? t("cls.noDate") : t(STATUS_KEY[f])} (${open.counts[f] ?? 0})`}
              </button>
            ))}
          </div>
          {open.students.length === 0 ? <p className="muted">{t("cls.empty")}</p> : (
            <div className="table-scroll">
              <table className="usage-table class-table">
                <thead><tr>
                  <th scope="col">{t("cls.f.display_name")}</th><th scope="col">{t("cls.f.destination")}</th><th scope="col">{t("cls.f.readiness")}</th>
                  <th scope="col">{t("cls.f.courses_finished")}</th><th scope="col">{t("cls.f.skills_proven")}</th>
                  <th scope="col">{t("cls.f.target_date")}</th><th scope="col">{t("cls.f.status")}</th><th scope="col">{t("cls.f.last_active")}</th>
                </tr></thead>
                <tbody>{students.map((s, i) => (
                  <tr key={i}>
                    <th scope="row">{s.display_name ?? t("cls.unnamed")}</th>
                    <td>{s.destination ? tr(s.destination) : "—"}</td>
                    <td>{s.readiness === null ? "—" : `${percent(s.readiness)}%`}</td>
                    <td>{s.courses_finished}</td>
                    <td>{s.skills_proven.length ? s.skills_proven.map((k) => `${tr(k.name)} (${k.level})`).join(", ") : "—"}</td>
                    <td>{s.target_date ? shortDate(s.target_date) : "—"}</td>
                    <td>{s.status ? <span className={`badge ${STATUS_TONE[s.status]}`}>{t(STATUS_KEY[s.status])}</span> : t("cls.noDate")}</td>
                    <td>{shortDate(s.last_active)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
