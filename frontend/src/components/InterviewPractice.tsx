import { useState } from "react";
import { api, InterviewReply, InterviewTurn } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { AiBadge } from "./AiBadge";
import { MicButton } from "./MicButton";

// Interview practice: five questions built from the gap between this role and your skills.
// The answers stay in this component; nothing is saved.
export function InterviewPractice({ profileId, roleId }: { profileId: string; roleId: string }) {
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [reply, setReply] = useState<InterviewReply | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(next: InterviewTurn[]) {
    setBusy(true); setError(null);
    try {
      const r = await api.interview(profileId, roleId, next, getLang());
      setReply(r);
      if (r.mode !== "blocked") { setTurns(next); setAnswer(""); }
    } catch { setError(t("iv.error")); }
    finally { setBusy(false); }
  }

  if (!reply) {
    return (
      <div className="card interview">
        <h2>{t("iv.title")}</h2>
        <p className="muted">{t("iv.intro")}</p>
        <button className="primary" disabled={busy} onClick={() => ask([])}>{busy ? "…" : t("iv.start")}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="card interview" aria-live="polite">
      <div className="row-between">
        <h2>{t("iv.title")}</h2>
        {!reply.done && <span className="badge">{reply.number} / {reply.total}</span>}
      </div>
      {reply.feedback && (
        <div className={`iv-feedback ${reply.mode === "blocked" ? "blocked" : ""}`}>
          <strong>{t("iv.feedback")}</strong> <AiBadge mode={reply.mode} grounded={false} />
          <p>{reply.feedback}</p>
        </div>
      )}
      {reply.done ? (
        <>
          <p><strong>{t("iv.done")}</strong></p>
          <button onClick={() => { setTurns([]); setReply(null); }}>{t("iv.again")}</button>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) ask([...turns, { question: reply.question!, answer: answer.trim() }]); }}>
          {reply.focus && <span className="next-tag">{reply.focus}</span>}
          <p className="iv-question">{reply.question}</p>
          <label className="sr-only" htmlFor="iv-answer">{t("iv.answer")}</label>
          <textarea id="iv-answer" rows={5} maxLength={2000} value={answer} onChange={(e) => setAnswer(e.target.value)}
            placeholder={t("iv.answer")} />
          <div className="actions">
            <button className="primary" type="submit" disabled={busy || !answer.trim()}>{busy ? "…" : t("iv.send")}</button>
            <MicButton onText={(spoken) => setAnswer((a) => `${a.trimEnd()} ${spoken}`.trim().slice(0, 2000))} />
          </div>
        </form>
      )}
      <p className="source">{t("iv.note")}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
