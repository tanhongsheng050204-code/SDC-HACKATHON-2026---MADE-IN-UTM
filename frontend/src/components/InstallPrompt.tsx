import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { canPromptInstall, isIosSafari, isStandalone, onInstallable, promptInstall } from "../lib/pwa";
import { KEYS, load, save } from "../lib/storage";

// "Install Laluan": shown on Today when the browser offers it (or on iPhone Safari, with the
// Share-menu steps). "Not now" hides it for good on this device.
export function InstallPrompt() {
  const [ready, setReady] = useState(canPromptInstall);
  const [hidden, setHidden] = useState(() => load(KEYS.installDismissed) === "1" || isStandalone());
  useEffect(() => onInstallable(() => setReady(true)), []);
  const ios = !ready && isIosSafari();
  if (hidden || (!ready && !ios)) return null;

  function dismiss() { save(KEYS.installDismissed, "1"); setHidden(true); }
  async function install() {
    if (await promptInstall()) { api.usage("app_installed").catch(() => {}); setHidden(true); }
    else setReady(canPromptInstall());
  }
  return (
    <div className="card install-prompt" role="region" aria-label={t("pwa.title")}>
      <img src="/icons/icon-192.png" alt="" width={48} height={48} />
      <div>
        <strong>{t("pwa.title")}</strong>
        <p className="muted">{ios ? t("pwa.ios") : t("pwa.body")}</p>
      </div>
      <div className="actions">
        {!ios && <button className="btn ink" onClick={install}>{t("pwa.install")}</button>}
        <button className="btn quiet" onClick={dismiss}>{t("pwa.notNow")}</button>
      </div>
    </div>
  );
}
