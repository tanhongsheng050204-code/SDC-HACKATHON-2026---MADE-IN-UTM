import { useEffect, useRef, useState } from "react";
import { api, CoachProposal, CoachReply, Profile, Scenario } from "../lib/api";
import { t } from "../lib/i18n";
import { AiBadge } from "./AiBadge";
import { MicButton } from "./MicButton";

interface Turn { question: string; reply: CoachReply | null; error?: string; dismissed?: boolean; applied?: boolean }

const STARTERS = ["Why is this my top role?", "How long will the plan take?", "Is my current job at risk?", "What if AI adoption is faster?"];

// The coach only proposes. A proposal changes nothing until the person presses Apply.
export function Coach({ profile, scenario, roleId, initialQuestion, onApply, onClose }: {
  profile: Profile; scenario: Scenario; roleId?: string; initialQuestion?: string; onApply: (p: CoachProposal) => Promise<void>; onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // A question typed on the Today screen opens the coach already asking it (once, even in dev mode).
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!initialQuestion || asked.current === initialQuestion) return;
    asked.current = initialQuestion;
    ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  function mark(i: number, patch: Partial<Turn>) {
    setTurns((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(""); setBusy(true);
    const index = turns.length;
    setTurns((all) => [...all, { question: text, reply: null }]);
    try { mark(index, { reply: await api.coach(profile.id, text, scenario, roleId) }); }
    catch { mark(index, { error: "The coach is offline right now. Try one of the suggested questions later." }); }
    finally { setBusy(false); }
  }

  async function apply(i: number, p: CoachProposal) {
    try { await onApply(p); mark(i, { applied: true }); }
    catch { mark(i, { error: "Couldn't apply that change. Nothing was changed." }); }
  }

  const suggestions = turns.at(-1)?.reply?.suggestions ?? STARTERS;
  return (
    <div className="coach" role="dialog" aria-modal="false" aria-labelledby="coach-title">
      <div className="coach-head">
        <h2 id="coach-title">{t("coach.title")}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close the coach">×</button>
      </div>
      <p className="muted coach-note">{t("note.coach")}</p>
      <ol className="coach-log" aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i}>
            <p className="coach-q">{turn.question}</p>
            {!turn.reply && !turn.error && <p className="muted typing">Thinking…</p>}
            {turn.error && <p className="error" role="alert">{turn.error}</p>}
            {turn.reply && (
              <div className="coach-a">
                <p>{turn.reply.answer}</p>
                <AiBadge mode={turn.reply.mode} />
                {turn.reply.grounding && (
                  <span className={`badge ${turn.reply.grounding.all_supported ? "good" : "risk"}`}>
                    {turn.reply.grounding.all_supported ? "Every sentence backed by a source" : `Check sentence ${turn.reply.grounding.unsupported.join(", ")}: not in the sources`}
                  </span>
                )}
                <details><summary className="muted">Sources ({turn.reply.sources.length})</summary>
                  <ul className="coach-sources">{turn.reply.sources.map((s) => <li key={s.id}><strong>{s.id}</strong> {s.text}</li>)}</ul>
                </details>
                {turn.reply.proposal && !turn.dismissed && (
                  <div className="proposal card">
                    <p className="eyebrow">Suggested change</p>
                    <p><strong>{turn.reply.proposal.label}</strong></p>
                    {turn.applied ? <span className="badge good">Applied</span> : (
                      <div className="actions">
                        <button className="primary" onClick={() => apply(i, turn.reply!.proposal!)}>{t("a.apply")}</button>
                        <button onClick={() => mark(i, { dismissed: true })}>{t("a.dismiss")}</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="chips coach-suggest">
        {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="coach-q">Ask about your results</label>
        <input id="coach-q" type="text" maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about your results" autoFocus />
        <MicButton onText={(text) => setQuestion((q) => `${q.trimEnd()} ${text}`.trim().slice(0, 500))} />
        <button className="primary" type="submit" disabled={busy || !question.trim()}>{t("a.ask")}</button>
      </form>
    </div>
  );
}
