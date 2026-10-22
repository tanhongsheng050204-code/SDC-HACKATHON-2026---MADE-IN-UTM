import { useEffect, useId, useState } from "react";
import { LegalLinks } from "../screens/Legal";
import { api, ClassPreview, Membership, Profile } from "../lib/api";
import { shortDate } from "../lib/format";
import { t, tf } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { SHARED_LABELS } from "./ClassShare";

// A student joins a counsellor's class with a code: first they see who runs it and exactly what
// will be shared, then they confirm. Leaving takes effect at once.
export function JoinClass({ profile, userId, inSheet = false }: { profile: Profile; userId: string | null; inSheet?: boolean }) {
  const [code, setCode] = useState(() => load(KEYS.joinCode, "session") ?? "");
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [mine, setMine] = useState<Membership[]>([]);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();
  const owned = !!userId && profile.user_id === userId;

  useEffect(() => { api.myClasses(profile.id).then(setMine).catch(() => setMine([])); }, [profile.id, userId]);
  useEffect(() => { if (owned && code && !preview) look(); }, [owned]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function look() {
    setMessage(null); setPreview(null);
    try { setPreview(await api.classPreview(code.trim())); }
    catch { setMessage({ error: true, text: t("cls.noClass") }); }
  }
  async function join() {
    setBusy(true);
    try {
      setMine(await api.joinClass(code.trim(), profile.id));
      save(KEYS.joinCode, null, "session");
      setMessage({ error: false, text: tf("cls.joined", { name: preview?.name ?? "" }) });
      setPreview(null); setCode("");
    } catch { setMessage({ error: true, text: t("cls.joinFailed") }); }
    finally { setBusy(false); }
  }
  async function leave(m: Membership) {
    if (!window.confirm(tf("cls.leaveConfirm", { name: m.name }))) return;
    try { setMine(await api.leaveClass(profile.id, m.id)); setMessage({ error: false, text: tf("cls.left", { name: m.name }) }); }
    catch { setMessage({ error: true, text: t("cls.joinFailed") }); }
  }

  return (
    <section className={inSheet ? "join-class in-sheet" : "card join-class"} aria-labelledby={inSheet ? undefined : `${id}-h`}>
      {!inSheet && <h2 id={`${id}-h`}>{t("cls.studentTitle")}</h2>}
      <p className="muted">{t("cls.studentSub")}</p>
      {mine.length > 0 && (
        <ul className="class-list">
          {mine.map((m) => (
            <li key={m.id}>
              <span><strong>{m.name}</strong> · {m.counsellor}, {m.organisation}<small className="muted"> · {tf("cls.since", { date: shortDate(m.joined_at) })}</small></span>
              <button className="btn quiet sm" onClick={() => leave(m)}>{t("cls.leave")}</button>
            </li>
          ))}
        </ul>
      )}
      {!owned ? <p className="muted" role="note">{t("cls.needLogin")}</p> : (
        <>
          <form className="progress-form" onSubmit={(e) => { e.preventDefault(); look(); }}>
            <label htmlFor={`${id}-code`}>{t("cls.code")}
              <input id={`${id}-code`} value={code} maxLength={12} autoCapitalize="characters" autoComplete="off"
                onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <button className="btn quiet" type="submit" disabled={code.trim().length < 6}>{t("cls.find")}</button>
          </form>
          {preview && (
            <div className="join-preview" role="region" aria-label={t("cls.shareTitle")}>
              <p><strong>{preview.name}</strong> · {preview.counsellor}, {preview.organisation}</p>
              <p>{t("cls.shareTitle")}</p>
              <ul>{preview.shared.map((f) => <li key={f}>{SHARED_LABELS[f] ? t(SHARED_LABELS[f]) : f}</li>)}</ul>
              <p className="muted">{t("cls.notShared")}</p>
              <p className="muted"><LegalLinks /></p>
              <div className="actions">
                <button className="btn ink" onClick={join} disabled={busy} aria-busy={busy}>{t("cls.join")}</button>
                <button className="btn quiet" onClick={() => setPreview(null)}>{t("a.dismiss")}</button>
              </div>
            </div>
          )}
        </>
      )}
      {message && <p className={message.error ? "error" : "muted"} role={message.error ? "alert" : "status"}>{message.text}</p>}
    </section>
  );
}
