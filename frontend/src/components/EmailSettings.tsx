import { useEffect, useId, useState } from "react";
import { api, EmailAlerts, EmailState, Profile } from "../lib/api";
import { getLang, t, tf, type StringKey } from "../lib/i18n";
import { AccountButton } from "./AccountButton";

export const STATES: EmailState[] = ["anywhere", "johor", "kedah", "kelantan", "melaka", "negeri_sembilan", "pahang", "perak",
  "perlis", "pulau_pinang", "sabah", "sarawak", "selangor", "terengganu", "kuala_lumpur", "labuan", "putrajaya"];

// "Email me": a weekly summary and optional job alerts. Off by default, only for a profile saved to
// a Google account, sent to that account's email. Every email has a one-click unsubscribe link.
export function EmailSettings({ profile, userId, inSheet = false }: { profile: Profile; userId: string | null; inSheet?: boolean }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof api.emailSettings>> | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [digest, setDigest] = useState(false);
  const [alerts, setAlerts] = useState<EmailAlerts>("off");
  const [state, setState] = useState<EmailState>("anywhere");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  useEffect(() => {
    let live = true;
    setBlocked(false);
    api.emailSettings(profile.id).then((got) => {
      if (!live) return;
      setInfo(got);
      setDigest(got.settings?.digest ?? false);
      setAlerts(got.settings?.alerts ?? "off");
      setState(got.settings?.state ?? "anywhere");
    }).catch(() => { if (live) setBlocked(true); });
    return () => { live = false; };
  }, [profile.id, userId]);

  async function save() {
    setBusy(true); setStatus(null);
    try {
      const got = await api.saveEmailSettings(profile.id, { digest, alerts, state, language: getLang() });
      setInfo(got);
      setStatus({ error: false, text: digest || alerts !== "off" ? t("mail.saved") : t("mail.savedOff") });
    } catch { setStatus({ error: true, text: t("mail.failed") }); }
    finally { setBusy(false); }
  }

  if (!info && !blocked) return null;
  return (
    <section className={inSheet ? "email-settings in-sheet" : "card email-settings"} aria-labelledby={inSheet ? undefined : `${id}-h`}>
      {!inSheet && <><h2 id={`${id}-h`}>{t("mail.title")}</h2><p className="muted">{t("mail.sub")}</p></>}
      {info && !info.available ? <p className="muted" role="note">{t("mail.notSetUp")}</p>
        : blocked ? <p className="muted" role="note">{t("mail.saveFirst")}</p>
        : !info?.logged_in ? (
          <div className="email-login"><p>{t("mail.login")}</p><AccountButton userId={userId} className="btn ink" /></div>
        ) : (
          <>
            <label className="check big">
              <input type="checkbox" checked={digest} onChange={(e) => { setDigest(e.target.checked); if (!e.target.checked && alerts === "weekly") setAlerts("off"); }} />
              <span><strong>{t("mail.digest")}</strong><small className="muted">{t("mail.digestHint")}</small></span>
            </label>
            <fieldset className="email-alerts">
              <legend>{t("mail.alerts")}</legend>
              {(["off", "weekly", "instant"] as const).map((a) => (
                <label key={a} className="check">
                  <input type="radio" name={`${id}-alerts`} value={a} checked={alerts === a} disabled={a === "weekly" && !digest}
                    onChange={() => setAlerts(a)} /> {t(`mail.alerts.${a}` as StringKey)}
                </label>
              ))}
            </fieldset>
            {alerts !== "off" && (
              <label className="email-state">{t("mail.state")}
                <select value={state} onChange={(e) => setState(e.target.value as EmailState)}>
                  {STATES.map((s) => <option key={s} value={s}>{t(`state.${s}` as StringKey)}</option>)}
                </select>
              </label>
            )}
            {info.email && <p className="muted">{tf("mail.to", { email: info.email })}</p>}
            <div className="actions"><button className="btn ink" onClick={save} disabled={busy} aria-busy={busy}>{t("mail.save")}</button></div>
            {status && <p className={status.error ? "error" : "muted"} role={status.error ? "alert" : "status"}>{status.text}</p>}
            <p className="source">{t("mail.privacy")}</p>
          </>
        )}
    </section>
  );
}
