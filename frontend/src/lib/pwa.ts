// Installable app: the service worker (public/sw.js) and the install prompt. Production builds
// only, so the dev server never serves stale files.

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => { /* the app works without it */ });
  });
}

// Remove this device's copy of the person's data (after Delete my profile or logging out): the
// service worker's offline copy, and coach conversations kept in this tab.
export function clearOfflineData() {
  try { navigator.serviceWorker?.controller?.postMessage("clear-data"); } catch { /* no worker */ }
  try {
    for (const key of Object.keys(window.sessionStorage)) if (key.startsWith("laluan.coach.")) window.sessionStorage.removeItem(key);
  } catch { /* storage blocked */ }
}

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();  // we show our own, calmer prompt
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
}

export function onInstallable(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

export function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

// iPhone and iPad Safari have no install prompt: they add to the home screen from the Share menu.
export function isIosSafari() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}
