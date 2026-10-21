import { authEnabled, signIn, signOut } from "../lib/auth";
import { t } from "../lib/i18n";

// "Log in with Google" or "Log out". Hidden when this build has no Supabase settings.
export function AccountButton({ userId, className = "btn quiet sm" }: { userId: string | null; className?: string }) {
  if (!authEnabled) return null;
  return userId
    ? <button className={className} onClick={() => signOut()}>{t("auth.logout")}</button>
    : <button className={className} onClick={() => signIn()}>{t("auth.login")}</button>;
}

// Shown where progress would be lost without an account (skill tree, survey).
export function LoginToKeep({ userId, isDemo }: { userId: string | null; isDemo: boolean }) {
  if (!authEnabled || userId || isDemo) return null;
  return (
    <div className="banner info" role="status">
      {t("auth.keep")} <button className="link" onClick={() => signIn()}>{t("auth.login")}</button>
    </div>
  );
}
