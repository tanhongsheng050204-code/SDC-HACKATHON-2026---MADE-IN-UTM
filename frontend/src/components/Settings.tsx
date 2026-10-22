import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api, type Profile } from "../lib/api";
import { downloadMyData } from "../lib/exportFile";
import { authEnabled, signOut } from "../lib/auth";
import { Lang, t } from "../lib/i18n";
import { AccountButton } from "./AccountButton";
import { Icon } from "./Icon";
import { LangPicker } from "./Preferences";
import { ReportProblem } from "./ReportProblem";

// One place for the things a person changes or asks for about their own use of Laluan: language,
// account, report a problem, and their data rights (download, delete). Opened from the top bar
// and the sidebar, so it is reachable on every app screen and on a phone.
export function Settings({ profile, userId, screen, lang, onLang, onLeave, onDelete, className = "icon-btn" }: {
  profile: Profile | null; userId: string | null; screen: string; lang: Lang; onLang: (l: Lang) => void;
  onLeave: () => void; onDelete: () => void; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // A report dialog opened from here closes first.
      if (e.key === "Escape" && !document.querySelector(".report-problem")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className={className} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={className === "icon-btn" ? t("set.title") : undefined} title={t("set.title")}>
        <Icon name="settings" />{className !== "icon-btn" && t("set.title")}
      </button>
      {open && createPortal(
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div className="dialog settings" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`} onClick={(e) => e.stopPropagation()}>
            <div className="settings-top">
              <h2 id={`${id}-h`}>{t("set.title")}</h2>
              <button ref={close} className="icon-btn" aria-label={t("set.close")} onClick={() => setOpen(false)}>×</button>
            </div>

            <section className="settings-group">
              <h3>{t("set.language")}</h3>
              <LangPicker lang={lang} onChange={onLang} />
            </section>

            <section className="settings-group">
              <h3>{t("set.account")}</h3>
              {userId ? (
                <button className="btn" onClick={() => { setOpen(false); signOut(); }}><Icon name="arrowLeft" />{t("auth.logout")}</button>
              ) : authEnabled ? (
                <><p className="muted">{t("set.loginWhy")}</p><AccountButton userId={null} className="btn" /></>
              ) : (
                <p className="muted">{t("set.noAccounts")}</p>
              )}
              {profile?.is_demo && (
                <button className="btn quiet" onClick={() => { setOpen(false); onLeave(); }}><Icon name="arrowLeft" />{t("set.leaveDemo")}</button>
              )}
            </section>

            {profile && (
              <section className="settings-group">
                <h3>{t("set.data")}</h3>
                <p className="muted">{t("set.dataWhy")}</p>
                <div className="settings-row">
                  <DownloadData profileId={profile.id} />
                  <button className="btn danger" onClick={() => { setOpen(false); onDelete(); }}><Icon name="trash" />{t("shell.delete")}</button>
                </div>
              </section>
            )}

            <section className="settings-group">
              <h3>{t("set.help")}</h3>
              <ReportProblem screen={screen} className="btn" />
            </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// Data rights: everything stored about this profile as one JSON file, saved in the browser.
function DownloadData({ profileId }: { profileId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  async function download() {
    setState("busy");
    try {
      downloadMyData(profileId, await api.exportData(profileId));
      setState("idle");
    } catch { setState("failed"); }
  }
  return (
    <>
      <button className="btn" onClick={download} disabled={state === "busy"} aria-busy={state === "busy"}>
        <Icon name="download" />{t("shell.download")}
      </button>
      {state === "failed" && <p className="error" role="alert">{t("shell.downloadFailed")}</p>}
    </>
  );
}
