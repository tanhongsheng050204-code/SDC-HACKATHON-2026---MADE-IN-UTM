import { useId, useState } from "react";
import { api } from "../lib/api";
import { getLang, t, type StringKey } from "../lib/i18n";

const REASONS_UP = ["clear", "useful", "other"] as const;
const REASONS_DOWN = ["wrong", "unclear", "not_relevant", "other"] as const;

// "Was this helpful?" under role advice and coach answers. Nothing identifies the person: no
// profile ID is sent, and the optional note has contact details removed on the server.
export function Helpful({ target, subject }: { target: "role_advice" | "coach"; subject?: string }) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"open" | "sent" | "failed">("open");
  const id = useId();

  async function send(h: boolean, r: string | null, n: string) {
    try {
      await api.feedback({ target, subject, helpful: h, reason: r, note: n.trim() || null, language: getLang() });
      setState("sent");
    } catch { setState("failed"); }
  }

  if (state === "sent") return <p className="helpful done" role="status">{t("fb.thanks")}</p>;
  return (
    <div className="helpful" role="group" aria-labelledby={`${id}-q`}>
      <span id={`${id}-q`}>{t("fb.question")}</span>
      <div className="helpful-buttons">
        <button className={`chip ${helpful === true ? "on" : ""}`} aria-pressed={helpful === true} onClick={() => setHelpful(true)}>👍 {t("fb.yes")}</button>
        <button className={`chip ${helpful === false ? "on" : ""}`} aria-pressed={helpful === false} onClick={() => setHelpful(false)}>👎 {t("fb.no")}</button>
      </div>
      {helpful !== null && (
        <div className="helpful-more">
          <div className="chips" role="radiogroup" aria-label={t("fb.why")}>
            {(helpful ? REASONS_UP : REASONS_DOWN).map((r) => (
              <button key={r} role="radio" aria-checked={reason === r} className={`chip ${reason === r ? "on" : ""}`}
                onClick={() => setReason(reason === r ? null : r)}>{t(`fb.r.${r}` as StringKey)}</button>
            ))}
          </div>
          <label htmlFor={`${id}-note`} className="sr-only">{t("fb.note")}</label>
          <textarea id={`${id}-note`} rows={2} maxLength={500} value={note} placeholder={t("fb.note")} onChange={(e) => setNote(e.target.value)} />
          <div className="actions">
            <button className="btn ink sm" onClick={() => send(helpful, reason, note)}>{t("fb.send")}</button>
          </div>
          <small className="muted">{t("fb.private")}</small>
        </div>
      )}
      {state === "failed" && <p className="error" role="alert">{t("fb.failed")}</p>}
    </div>
  );
}
