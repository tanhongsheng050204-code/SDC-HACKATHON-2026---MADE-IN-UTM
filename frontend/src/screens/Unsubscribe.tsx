import { useEffect, useState } from "react";
import { LogoMark } from "../components/Brand";
import { api } from "../lib/api";
import { t } from "../lib/i18n";

// Opened from the link in an email: unsubscribes at once, no login. The token says what to stop
// (all email, or job alerts only) and is checked on the server.
export function Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<"busy" | "all" | "alerts" | "failed">("busy");
  useEffect(() => {
    api.unsubscribe(token).then((r) => setState(r.done)).catch(() => setState("failed"));
  }, [token]);
  return (
    <main className="unsubscribe-page" id="main">
      <div className="card unsubscribe-card">
        <LogoMark size={44} />
        <h1>{state === "failed" ? t("unsub.failedTitle") : t("unsub.title")}</h1>
        <p role="status">{state === "busy" ? t("a.loading") : state === "all" ? t("unsub.all") : state === "alerts" ? t("unsub.alerts") : t("unsub.failed")}</p>
        <a className="btn ink" href="/?view=home">{t("unsub.open")}</a>
      </div>
    </main>
  );
}
