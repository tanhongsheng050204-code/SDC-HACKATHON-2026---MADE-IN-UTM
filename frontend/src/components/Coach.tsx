import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, CoachProposal, CoachReply, Profile, Scenario } from "../lib/api";
import { t, tf, tr, type StringKey } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { AiBadge } from "./AiBadge";
import { Helpful } from "./Helpful";
import { MicButton } from "./MicButton";

interface Turn { question: string; reply: CoachReply | null; error?: string; dismissed?: boolean; applied?: boolean }

const STARTERS = ["coach.s1", "coach.s2", "coach.s3", "coach.s4"] as const;  // translated when shown
const MAX_KEPT = 50;  // the saved conversation is capped; the drawer itself shows every turn

function readTurns(key: string): Turn[] {
  try {
    const raw = load(key, "session");
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? (arr as Turn[]) : [];
  } catch { return []; }
}

// Split an answer into sentences. A full stop between digits (1,200.50) is not a sentence end.
function sentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    buf += ch;
    const next = text[i + 1];
    if ((ch === "." || ch === "!" || ch === "?") && (next === undefined || next === " " || next === "\n")) {
      const decimal = ch === "." && /\d/.test(text[i - 1] ?? "") && /\d/.test(text[i + 2] ?? "");
      if (!decimal) { out.push(buf.trim()); buf = ""; i++; }  // the separating space goes with the split
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

// Light formatting: **bold** as written, then money, percentages and hour counts in bold.
// Built as nodes, never as HTML, so nothing from the model can inject markup.
function Inline({ text }: { text: string }) {
  const chunks = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {chunks.map((chunk, i) => {
        if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) return <strong key={i}>{chunk.slice(2, -2)}</strong>;
        const bits = chunk.split(/(RM\s?\d[\d,.]*|\d[\d,.]*\s?%|\b\d+(?:\.\d+)?\s?hours?\b)/gi);
        return <span key={i}>{bits.map((b, j) => (j % 2 === 1 ? <strong key={j}>{b}</strong> : <span key={j}>{b}</span>))}</span>;
      })}
    </>
  );
}

// An answer: short lines starting with - or • become a list; every sentence is clickable,
// which is how "Why do you say that?" quotes exactly the sentence you mean.
function AnswerText({ text, onWhy }: { text: string; onWhy: (sentence: string) => void }) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    out.push(<ul key={`b${out.length}`} className="coach-list">{bullets.map((b, j) => <li key={j}><Inline text={b} /></li>)}</ul>);
    bullets = [];
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-•*]\s+(.+)$/);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    if (!line.trim()) continue;
    out.push(
      <p key={`p${out.length}`}>
        {sentences(line).map((s, i) => (
          <span key={i} className="coach-say" role="button" tabIndex={0} title={t("coach.whyHint")} aria-label={t("coach.whyHint")}
            onClick={() => onWhy(s)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onWhy(s); } }}>
            <Inline text={s} />{" "}
          </span>
        ))}
      </p>,
    );
  }
  flush();
  return <>{out}</>;
}

// The coach only proposes. A proposal changes nothing until the person presses Apply.
export function Coach({ profile, scenario, roleId, initialQuestion, onApply, onClose }: {
  profile: Profile; scenario: Scenario; roleId?: string; initialQuestion?: string; onApply: (p: CoachProposal) => Promise<void>; onClose: () => void;
}) {
  const storeKey = KEYS.coach + profile.id + "." + (roleId ?? "any");
  const [turns, setTurns] = useState<Turn[]>(() => readTurns(storeKey));
  const [question, setQuestion] = useState("");
  const [interim, setInterim] = useState("");  // live speech, not yet final
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  // The conversation survives closing the drawer (this tab only).
  useEffect(() => {
    save(storeKey, turns.length ? JSON.stringify(turns.slice(-MAX_KEPT)) : null, "session");
  }, [turns, storeKey]);
  // A different profile or role in the same open drawer loads that thread instead.
  useEffect(() => { setTurns(readTurns(storeKey)); setInterim(""); }, [storeKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The field grows with the question (up to a cap), so nothing you type or dictate is hidden.
  const shown = interim ? `${question.trimEnd()} ${interim}`.trim().slice(0, 500) : question;
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [shown]);

  // A question typed on the Today screen opens the coach already asking it (once, even in dev mode).
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!initialQuestion || asked.current === initialQuestion) return;
    asked.current = initialQuestion;
    // A restored conversation that already holds this question doesn't need it asked again.
    if (turns.some((x) => x.question === initialQuestion)) return;
    ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  function mark(i: number, patch: Partial<Turn>) {
    setTurns((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(""); setInterim(""); setBusy(true);
    const index = turns.length;
    setTurns((all) => [...all, { question: text, reply: null }]);
    try { mark(index, { reply: await api.coach(profile.id, text, scenario, roleId) }); }
    catch (e) { mark(index, { error: String(e).includes("429") ? t("shell.slowDown") : t("coach.offline") }); }
    finally { setBusy(false); }
  }

  async function apply(i: number, p: CoachProposal) {
    try { await onApply(p); mark(i, { applied: true }); }
    catch { mark(i, { error: "Couldn't apply that change. Nothing was changed." }); }
  }

  async function copy(i: number) {
    const text = turns[i]?.reply?.answer;
    if (!text) return;
    try { await navigator.clipboard.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 2000); }
    catch { /* clipboard blocked: the text is still selectable */ }
  }

  // "Why do you say that?" — one click quotes the sentence into the field instead of retyping it.
  function whyQuote(sentence: string) {
    setQuestion((q) => (q.trim() ? `${q.trim()} ` : "") + tf("coach.whyQuote", { q: sentence }));
    box.current?.focus();
  }

  function whyAbout(turn: Turn) {
    const parts = sentences(turn.reply?.answer ?? "");
    whyQuote(parts.find((s) => /\d/.test(s)) ?? parts[0] ?? turn.question);
  }

  function clearAll() { setTurns([]); setInterim(""); save(storeKey, null, "session"); }

  const suggestions = turns.at(-1)?.reply?.suggestions ?? STARTERS.map((k) => t(k));
  return (
    <div className="coach" role="dialog" aria-modal="false" aria-labelledby="coach-title">
      <div className="coach-head">
        <h2 id="coach-title">{t("coach.title")}</h2>
        <div className="coach-head-actions">
          {turns.length > 0 && <button className="link" onClick={clearAll}>{t("coach.clear")}</button>}
          <button className="icon-btn" onClick={onClose} aria-label={t("coach.close")}>×</button>
        </div>
      </div>
      <p className="muted coach-note">{t("note.coach")}</p>
      <ol className="coach-log" aria-live="polite">
        {turns.map((turn, i) => (
          <li key={i}>
            <p className="coach-q">{turn.question}</p>
            {turn.reply?.removed && Object.keys(turn.reply.removed).length > 0 && (
              <p className="coach-removed">
                {t("coach.removed")}{" "}
                {Object.entries(turn.reply.removed).map(([kind, n]) => `${n} ${t(`${n === 1 ? "pii1" : "pii"}.${kind}` as StringKey)}`).join(", ")}
              </p>
            )}
            {!turn.reply && !turn.error && <p className="muted typing">{t("coach.thinking")}</p>}
            {turn.error && <p className="error" role="alert">{turn.error}</p>}
            {turn.reply && (
              <div className="coach-a">
                <AnswerText text={turn.reply.answer} onWhy={whyQuote} />
                <AiBadge mode={turn.reply.mode} />
                {turn.reply.grounding && (
                  <span className={`badge ${turn.reply.grounding.all_supported ? "good" : "risk"}`}>
                    {turn.reply.grounding.all_supported ? t("coach.grounded") : tf("coach.ungrounded", { list: turn.reply.grounding.unsupported.join(", ") })}
                  </span>
                )}
                {turn.reply.revised && (
                  <p className="coach-revised">
                    <span aria-hidden="true">✓</span> {t("coach.revised")}
                    {!!turn.reply.dropped && <> · {tf(turn.reply.dropped === 1 ? "coach.dropped" : "coach.droppedMany", { n: turn.reply.dropped })}</>}
                  </p>
                )}
                {turn.reply.mode !== "blocked" && <Helpful target="coach" />}
                <details><summary className="muted">{tf("coach.sources", { n: turn.reply.sources.length })}</summary>
                  <ul className="coach-sources">{turn.reply.sources.map((s) => <li key={s.id}><strong>{s.id}</strong> {tr(s.text)}</li>)}</ul>
                </details>
                {turn.reply.proposal && !turn.dismissed && (
                  <div className="proposal card">
                    <p className="eyebrow">{t("coach.suggested")}</p>
                    <p><strong>{turn.reply.proposal.label}</strong></p>
                    {turn.applied ? <span className="badge good">{t("coach.applied")}</span> : (
                      <div className="actions">
                        <button className="primary" onClick={() => apply(i, turn.reply!.proposal!)}>{t("a.apply")}</button>
                        <button onClick={() => mark(i, { dismissed: true })}>{t("a.dismiss")}</button>
                      </div>
                    )}
                  </div>
                )}
                <div className="coach-tools">
                  <button className="btn quiet sm" onClick={() => copy(i)}>{copied === i ? t("coach.copied") : t("coach.copy")}</button>
                  <button className="btn quiet sm" onClick={() => ask(turn.question)} disabled={busy}>{t("coach.again")}</button>
                  <button className="btn quiet sm" onClick={() => whyAbout(turn)}>{t("coach.why")}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <div className="chips coach-suggest">
        {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
      </div>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="coach-q">{t("coach.ask")}</label>
        <textarea id="coach-q" ref={box} rows={1} maxLength={500} value={shown} className={interim ? "is-interim" : undefined}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }}
          placeholder={t("coach.ask")} autoFocus />
        <MicButton onText={(text) => setQuestion((q) => `${q.trimEnd()} ${text}`.trim().slice(0, 500))} onInterim={setInterim} />
        <button className="primary" type="submit" disabled={busy || !question.trim()}>{t("a.ask")}</button>
      </form>
    </div>
  );
}
