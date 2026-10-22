import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { Icon } from "./Icon";

// "Report a problem": a short description and the screen it happened on. No profile ID is sent,
// and contact details are removed on the server before it is stored.
export function ReportProblem({ screen, className }: { screen: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "failed">("idle");
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send() {
    setState("busy");
    try { await api.reportProblem(note.trim(), screen, getLang()); setState("sent"); setNote(""); }
    catch { setState("failed"); }
  }

  return (
    <>
      <button className={className} onClick={() => { setOpen(true); setState("idle"); }}><Icon name="flag" />{t("fb.report")}</button>
      {/* Rendered on <body>: the sidebar is its own layer, and the dialog must sit above the page. */}
      {open && createPortal(
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div className="dialog report-problem" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`} onClick={(e) => e.stopPropagation()}>
            <h2 id={`${id}-h`}>{t("fb.report")}</h2>
            {state === "sent" ? <p role="status">{t("fb.reportThanks")}</p> : (
              <>
                <label htmlFor={`${id}-note`}>{t("fb.reportWhat")}</label>
                <textarea id={`${id}-note`} rows={4} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
                <small className="muted">{t("fb.reportPrivate")}</small>
                {state === "failed" && <p className="error" role="alert">{t("fb.failed")}</p>}
              </>
            )}
            <div className="dialog-actions">
              {state !== "sent" && <button className="btn ink" onClick={send} disabled={note.trim().length < 3 || state === "busy"}>{t("fb.send")}</button>}
              <button className="btn quiet" onClick={() => setOpen(false)}>{t("tree.close")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
