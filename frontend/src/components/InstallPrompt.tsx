import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { canPromptInstall, isIosSafari, isStandalone, onInstallable, promptInstall } from "../lib/pwa";
import { KEYS, load, save } from "../lib/storage";

// Counts this session once; the prompt waits until the person comes back a second time.
function visits() {
  let n = Number(load(KEYS.visits) ?? "0") || 0;
  if (!load(KEYS.visitCounted, "session")) { n += 1; save(KEYS.visits, String(n)); save(KEYS.visitCounted, "1", "session"); }
  return n;
}

// "Install Laluan": a small card in the corner of Today from the second visit, when the browser
// offers it (or on iPhone Safari, with the Share-menu steps). "Not now" hides it for good on this
// device; Settings still has Install.
export function InstallPrompt() {
  const [ready, setReady] = useState(canPromptInstall);
  const [hidden, setHidden] = useState(() => load(KEYS.installDismissed) === "1" || isStandalone() || visits() < 2);
  useEffect(() => onInstallable(() => setReady(true)), []);
  const ios = !ready && isIosSafari();
  if (hidden || (!ready && !ios)) return null;

  function dismiss() { save(KEYS.installDismissed, "1"); setHidden(true); }
  async function install() {
    if (await promptInstall()) { api.usage("app_installed").catch(() => {}); setHidden(true); }
    else setReady(canPromptInstall());
  }
  return (
    <div className="install-snack" role="region" aria-label={t("pwa.title")}>
      <img src="/icons/icon-192.png" alt="" width={32} height={32} />
      <span>{ios ? t("pwa.ios") : t("pwa.snack")}</span>
      {!ios && <button className="btn sm" onClick={install}>{t("pwa.install")}</button>}
      <button className="install-x" onClick={dismiss} aria-label={t("pwa.notNow")}>×</button>
    </div>
  );
}
