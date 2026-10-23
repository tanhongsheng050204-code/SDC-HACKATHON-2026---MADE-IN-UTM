import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api, type Profile } from "../lib/api";
import { downloadMyData } from "../lib/exportFile";
import { authEnabled, signOut } from "../lib/auth";
import { Lang, LANGS, t } from "../lib/i18n";
import { canPromptInstall, isIosSafari, isStandalone, onInstallable, promptInstall } from "../lib/pwa";
import { LegalLinks } from "../screens/Legal";
import { AccountButton } from "./AccountButton";
import { Icon } from "./Icon";
import { ReportProblem } from "./ReportProblem";

// One place for the things a person changes or asks for about their own use of Laluan: language,
// account, installing the app, their data rights (download, delete), help, and what the app runs
// on. A side panel of short rows, opened from the top bar, the account button in the sidebar and
// the phone's More sheet, so it is reachable on every app screen.
export function Settings({ profile, userId, screen, lang, model = null, onLang, onLeave, onDelete, className = "icon-btn", children }: {
  profile: Profile | null; userId: string | null; screen: string; lang: Lang; model?: string | null; onLang: (l: Lang) => void;
  onLeave: () => void; onDelete: () => void; className?: string; children?: ReactNode;
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
        aria-label={children ? undefined : t("set.title")} title={t("set.title")}>
        {children ?? <Icon name="settings" />}
      </button>
      {open && createPortal(
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet settings" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`}>
            <div className="sheet-head">
              <h2 id={`${id}-h`}>{t("set.title")}</h2>
              <button ref={close} className="sheet-x" aria-label={t("set.close")} onClick={() => setOpen(false)}>×</button>
            </div>

            <section className="settings-group">
              <h3>{t("set.language")}</h3>
              <div className="segmented settings-lang" role="radiogroup" aria-label={t("set.language")}>
                {LANGS.map((l) => <button key={l.id} role="radio" aria-checked={lang === l.id} lang={l.htmlLang} onClick={() => onLang(l.id)}>{l.label}</button>)}
              </div>
            </section>

            <section className="settings-group">
              <h3>{t("set.account")}</h3>
              {userId ? (
                <button className="settings-row" onClick={() => { setOpen(false); signOut(); }}><span>{t("auth.logout")}</span><Icon name="arrowLeft" /></button>
              ) : authEnabled ? (
                <><AccountButton userId={null} className="settings-row" /><p className="muted">{t("set.loginWhy")}</p></>
              ) : (
                <p className="muted">{t("set.noAccounts")}</p>
              )}
              {profile?.is_demo && (
                <button className="settings-row" onClick={() => { setOpen(false); onLeave(); }}><span>{t("set.leaveDemo")}</span><Icon name="arrowLeft" /></button>
              )}
            </section>

            <InstallRow />

            {profile && (
              <section className="settings-group">
                <h3>{t("set.data")}</h3>
                <DownloadData profileId={profile.id} />
                <button className="settings-row danger" onClick={() => { setOpen(false); onDelete(); }}><span>{t("shell.delete")}</span><Icon name="trash" /></button>
                <p className="muted">{t("set.dataWhy")}</p>
              </section>
            )}

            <section className="settings-group">
              <h3>{t("set.help")}</h3>
              <ReportProblem screen={screen} className="settings-row" />
            </section>

            <section className="settings-group settings-about">
              <h3>{t("set.about")}</h3>
              {model && <p>{t("shell.model")}: {model}</p>}
              <p>{t("shell.estimates")}</p>
              <p><LegalLinks /></p>
            </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// "Install Laluan", for when the small prompt on Today was dismissed: the browser's own install
// dialog where it offers one, or the Share-menu steps on iPhone Safari.
function InstallRow() {
  const [ready, setReady] = useState(canPromptInstall);
  useEffect(() => onInstallable(() => setReady(true)), []);
  const ios = !ready && isIosSafari();
  if (isStandalone() || (!ready && !ios)) return null;
  return (
    <section className="settings-group">
      <h3>{t("set.app")}</h3>
      {ios ? <p className="muted">{t("pwa.ios")}</p> : (
        <button className="settings-row" onClick={async () => {
          if (await promptInstall()) api.usage("app_installed").catch(() => {});
          setReady(canPromptInstall());
        }}><span>{t("pwa.title")}<small>{t("set.installHint")}</small></span><Icon name="download" /></button>
      )}
    </section>
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
      <button className="settings-row" onClick={download} disabled={state === "busy"} aria-busy={state === "busy"}>
        <span>{t("shell.download")}</span><Icon name="download" />
      </button>
      {state === "failed" && <p className="error" role="alert">{t("shell.downloadFailed")}</p>}
    </>
  );
}
