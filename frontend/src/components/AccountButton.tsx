import { useEffect, useRef, useState } from "react";
import { authEnabled, signIn, signOut } from "../lib/auth";
import { t } from "../lib/i18n";
import { LogoMark } from "./Brand";

// Every "Log in" opens one explanation first (why, what is kept, what is not), then Google.
const OPEN = "laluan:login";
export const openLogin = () => window.dispatchEvent(new Event(OPEN));

// "Log in" or "Log out". Hidden when this build has no Supabase settings.
export function AccountButton({ userId, className = "btn quiet sm" }: { userId: string | null; className?: string }) {
  if (!authEnabled) return null;
  return userId
    ? <button className={className} onClick={() => signOut()}>{t("auth.logout")}</button>
    : <button className={className} onClick={openLogin}>{t("auth.loginShort")}</button>;
}

// Shown where progress would be lost without an account (skill tree, survey).
export function LoginToKeep({ userId, isDemo }: { userId: string | null; isDemo: boolean }) {
  if (!authEnabled || userId || isDemo) return null;
  return (
    <div className="banner info" role="status">
      {t("auth.keep")} <button className="link" onClick={openLogin}>{t("auth.loginShort")}</button>
    </div>
  );
}

// Rendered once by the app; opens when anything calls openLogin().
export function LoginHost() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const show = () => { setBusy(false); setOpen(true); };
    window.addEventListener(OPEN, show);
    return () => window.removeEventListener(OPEN, show);
  }, []);
  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!open || !authEnabled) return null;
  return (
    <div className="dialog-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="dialog login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" onMouseDown={(e) => e.stopPropagation()}>
        <span className="login-mark"><LogoMark size={28} /></span>
        <h2 id="login-title">{t("auth.title")}</h2>
        <p className="muted">{t("auth.sub")}</p>
        <ul className="login-points">
          <li><b>✓</b>{t("auth.p1")}</li>
          <li><b>✓</b>{t("auth.p2")}</li>
          <li><b>✓</b>{t("auth.p3")}</li>
        </ul>
        <button ref={first} className="google-btn" disabled={busy} onClick={() => { setBusy(true); signIn().catch(() => setBusy(false)); }}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.1z" />
            <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          {busy ? t("auth.opening") : t("auth.google")}
        </button>
        <button className="link login-later" onClick={() => setOpen(false)}>{t("auth.later")}</button>
        <p className="source">{t("auth.privacy")}</p>
      </div>
    </div>
  );
}
