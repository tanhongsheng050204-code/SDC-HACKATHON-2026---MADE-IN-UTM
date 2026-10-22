import { useEffect, useId, useState, type ReactNode } from "react";
import { api, Membership, Profile } from "../lib/api";
import { downloadMyData } from "../lib/exportFile";
import { t, type StringKey } from "../lib/i18n";
import { EmailSettings } from "./EmailSettings";
import { Icon, type IconName } from "./Icon";
import { JoinClass } from "./JoinClass";

type Open = "email" | "class" | "delete" | null;
type EmailInfo = Awaited<ReturnType<typeof api.emailSettings>>;

// My profile's settings: one row each with its current state; the details open in a side sheet so
// the page itself stays short. Delete sits last, behind a confirmation.
export function ProfileSettings({ profile, userId, onDelete }: { profile: Profile; userId: string | null; onDelete: () => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [email, setEmail] = useState<EmailInfo | null>(null);
  const [classes, setClasses] = useState<Membership[]>([]);
  const [downloadFailed, setDownloadFailed] = useState(false);

  // Read again whenever a sheet closes, so each row shows what was just changed.
  useEffect(() => {
    if (open) return;
    api.emailSettings(profile.id).then(setEmail).catch(() => setEmail(null));
    api.myClasses(profile.id).then(setClasses).catch(() => setClasses([]));
  }, [profile.id, userId, open]);

  const emailState = (which: "digest" | "alerts") => {
    if (!email) return "";
    if (!email.available) return t("prof.notSetUp");
    if (!email.logged_in) return t("prof.logIn");
    if (which === "digest") return email.settings?.digest ? t("prof.on") : t("prof.off");
    const a = email.settings?.alerts ?? "off";
    return a === "weekly" ? t("prof.alertWeekly") : a === "instant" ? t("prof.alertInstant") : t("prof.off");
  };
  const isOn = (which: "digest" | "alerts") =>
    !!email?.logged_in && (which === "digest" ? !!email.settings?.digest : (email.settings?.alerts ?? "off") !== "off");

  async function download() {
    setDownloadFailed(false);
    try { downloadMyData(profile.id, await api.exportData(profile.id)); } catch { setDownloadFailed(true); }
  }

  return (
    <section className="prof-sec" aria-labelledby="prof-settings-h">
      <h2 id="prof-settings-h">{t("prof.settings")}</h2>
      <div className="prof-rows">
        <Row icon="mail" label="prof.weekly" state={emailState("digest")} on={isOn("digest")} onClick={() => setOpen("email")} />
        <Row icon="briefcase" label="prof.alerts" state={emailState("alerts")} on={isOn("alerts")} onClick={() => setOpen("email")} />
        <Row icon="users" label="prof.class" state={classes[0]?.name ?? t("prof.notJoined")} on={classes.length > 0} onClick={() => setOpen("class")} />
        <Row icon="download" label="prof.download" state={t("prof.json")} onClick={download} />
        <Row icon="trash" label="prof.delete" danger onClick={() => setOpen("delete")} />
      </div>
      {downloadFailed && <p className="error" role="alert">{t("prof.downloadFailed")}</p>}

      {open === "email" && (
        <Sheet title={t("prof.emails")} onClose={() => setOpen(null)}>
          <EmailSettings profile={profile} userId={userId} inSheet />
        </Sheet>
      )}
      {open === "class" && (
        <Sheet title={t("prof.class")} onClose={() => setOpen(null)}>
          <JoinClass profile={profile} userId={userId} inSheet />
        </Sheet>
      )}
      {open === "delete" && (
        <Sheet title={t("prof.deleteTitle")} onClose={() => setOpen(null)}>
          <p>{t("prof.deleteBody")}</p>
          <p className="muted">{t("prof.deleteCopy")}</p>
          <div className="sheet-actions">
            <button className="btn danger" onClick={() => { setOpen(null); onDelete(); }}>{t("prof.delete")}</button>
            <button className="btn quiet" autoFocus onClick={() => setOpen(null)}>{t("prof.keep")}</button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function Row({ icon, label, state, on, danger, onClick }: {
  icon: IconName; label: StringKey; state?: string; on?: boolean; danger?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className={`prof-row${danger ? " danger" : ""}`} onClick={onClick}>
      <span className="prof-row-icon"><Icon name={icon} /></span>
      <strong>{t(label)}</strong>
      <span className={`prof-row-state${on ? " on" : ""}`}>{state}</span>
      <span className="prof-row-chev" aria-hidden="true">›</span>
    </button>
  );
}

// A panel from the right (from the bottom on a phone) that closes on Escape or a click outside.
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="sheet-x" aria-label={t("prof.close")} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
