import { useEffect, useRef, useState } from "react";
import { config } from "../lib/config";
import { LegalLinks } from "../screens/Legal";
import { createPortal } from "react-dom";
import { authEnabled, signIn, signOut } from "../lib/auth";
import { t } from "../lib/i18n";
import { LogoMark } from "./Brand";

// "Log in with Google" or "Log out". Hidden when this build has no Supabase settings. Log in first
// explains what an account keeps (LoginDialog), so nobody is sent to Google without knowing why.
export function AccountButton({ userId, className = "btn quiet sm" }: { userId: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!authEnabled) return null;
  if (userId) return <button className={className} onClick={() => signOut()}>{t("auth.logout")}</button>;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>{t("auth.login")}</button>
      {open && <LoginDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function LoginDialog({ onClose }: { onClose: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // Portalled to <body> so no sidebar or card stacking context can draw over it.
  return createPortal(
    <div className="login-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="login-card" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <div className="login-top">
          <LogoMark size={56} />
          <button className="icon-btn" aria-label={t("login.close")} onClick={onClose}>×</button>
        </div>
        <h2 id="login-title">{t("login.title")}</h2>
        <p>{t("login.body")}</p>
        <ul className="login-tiles">
          <li>{t("login.k1")}</li>
          <li>{t("login.k2")}</li>
          <li>{t("login.k3")}</li>
        </ul>
        <button ref={first} className="login-google" onClick={() => signIn()}>
          <span className="login-g" aria-hidden="true">G</span>{t("login.google")}
        </button>
        {config.microsoftLogin && (
          <button className="login-google login-microsoft" onClick={() => signIn("azure")}>
            <span className="login-ms" aria-hidden="true"><i /><i /><i /><i /></span>{t("login.microsoft")}
          </button>
        )}
        <button className="link login-skip" onClick={onClose}>{t("login.notNow")}</button>
        <p className="login-note">{t("login.note")} <LegalLinks /></p>
      </div>
    </div>,
    document.body,
  );
}

// Shown where progress would be lost without an account (skill tree, survey).
export function LoginToKeep({ userId, isDemo }: { userId: string | null; isDemo: boolean }) {
  const [open, setOpen] = useState(false);
  if (!authEnabled || userId || isDemo) return null;
  return (
    <div className="banner info" role="status">
      {t("auth.keep")} <button className="link" onClick={() => setOpen(true)}>{t("auth.login")}</button>
      {open && <LoginDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
