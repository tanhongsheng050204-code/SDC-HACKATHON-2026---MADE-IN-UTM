import { useEffect, useRef, useState } from "react";
import { api, CoachAction, CoachReply, Profile, Scenario } from "../lib/api";
import { getLang, StringKey, t, tf, tr } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { AiBadge } from "./AiBadge";
import { MicButton } from "./MicButton";

interface Turn { question: string; reply: CoachReply | null; error?: string; done?: string[] }

// Suggestions that fit the screen the person is on; translated when shown.
const SUGGEST: Record<string, StringKey[]> = {
  home: ["as.s.next", "as.s.top", "as.s.risk", "as.s.guide"],
  roles: ["as.s.top", "as.s.compare", "as.s.faster", "as.s.climate"],
  role: ["as.s.why", "as.s.hours", "as.s.pay", "as.s.target"],
  tree: ["as.s.hours", "as.s.free", "as.s.cost", "as.s.next"],
  tasks: ["as.s.tasks", "as.s.risk", "as.s.skills", "as.s.next"],
  radar: ["as.s.skills", "as.s.top", "as.s.next", "as.s.guide"],
};
const VOICE: Record<string, string> = { en: "en-GB", ms: "ms-MY", zh: "zh-CN" };
const CITE = /\s*\[(?:SOURCE-\d+[,;\s]*)+\]/g;  // the model's citation marks; sources are listed below the answer
const KEEP = 12;  // turns kept for this browser tab, so closing the panel doesn't lose the thread

// Ask Laluan: a career aide that answers from the person's own results, follows the conversation,
// and offers actions (switch scenario, open a screen, set a destination). Nothing changes until
// the person presses an action's button.
export function Coach({ profile, scenario, roleId, screen, screenTitle, initialQuestion, onAction, onClose }: {
  profile: Profile; scenario: Scenario; roleId?: string; screen: string; screenTitle: string; initialQuestion?: string;
  onAction: (a: CoachAction) => Promise<void>; onClose: () => void;
}) {
  const memory = `${KEYS.assistant}${profile.id}`;
  const [turns, setTurns] = useState<Turn[]>(() => {
    try { return (JSON.parse(load(memory, "session") ?? "[]") as Turn[]).filter((x) => x.reply); } catch { return []; }
  });
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [speak, setSpeak] = useState(() => load(KEYS.assistantVoice) === "1");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => { save(memory, JSON.stringify(turns.filter((x) => x.reply).slice(-KEEP)), "session"); }, [turns, memory]);
  useEffect(() => { log.current?.lastElementChild?.scrollIntoView({ block: "end" }); }, [turns]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (canSpeak) window.speechSynthesis.cancel(); };
  }, [onClose, canSpeak]);

  // A question typed elsewhere (Today's "Where to?", the command menu) opens the panel asking it, once.
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

  function say(text: string, lang: string) {
    if (!speak || !canSpeak) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(CITE, ""));
    u.lang = VOICE[lang] ?? "en-GB";
    window.speechSynthesis.speak(u);
  }

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setQuestion(""); setBusy(true);
    const history = turns.filter((x) => x.reply).slice(-4).map((x) => ({ question: x.question, answer: x.reply!.answer }));
    const index = turns.length;
    setTurns((all) => [...all, { question: text, reply: null }]);
    try {
      const reply = await api.coach(profile.id, text, scenario, roleId, { history, language: getLang(), screen });
      mark(index, { reply });
      say(reply.answer, reply.language ?? "en");
    } catch { mark(index, { error: t("coach.offline") }); }
    finally { setBusy(false); input.current?.focus(); }
  }

  async function act(i: number, a: CoachAction) {
    try { await onAction(a); mark(i, { done: [...(turns[i].done ?? []), a.label] }); }
    catch { mark(i, { error: t("as.actionFailed") }); }
  }

  function toggleVoice() {
    const next = !speak;
    setSpeak(next); save(KEYS.assistantVoice, next ? "1" : "0");
    if (!next && canSpeak) window.speechSynthesis.cancel();
  }

  const last = turns.at(-1)?.reply;
  const starters = (SUGGEST[screen] ?? SUGGEST.home).map((k) => t(k));
  const suggestions = last?.suggestions?.length ? last.suggestions.slice(0, 4) : starters;
  const name = profile.display_name?.replace(/\s*\(demo\)$/, "");
  return (
    <aside className="coach assistant" role="dialog" aria-modal="false" aria-labelledby="coach-title">
      <div className="as-head">
        <span className={`as-orb${busy ? " busy" : ""}`} aria-hidden="true" />
        <div className="as-title">
          <h2 id="coach-title">{t("as.title")}</h2>
          <span>{t("as.sub")}</span>
        </div>
        {canSpeak && (
          <button className={`icon-btn as-voice${speak ? " on" : ""}`} onClick={toggleVoice} aria-pressed={speak} title={t("as.voice")} aria-label={t("as.voice")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={speak ? "M4 9v6h4l5 4V5L8 9H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" : "M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6"} />
            </svg>
          </button>
        )}
        <button className="icon-btn" onClick={onClose} aria-label={t("coach.close")}>×</button>
      </div>
      <p className="as-context"><span className="as-dot" aria-hidden="true" />{tf("as.context", { screen: screenTitle })}</p>

      <ol className="coach-log" ref={log} aria-live="polite">
        {turns.length === 0 && (
          <li className="as-hello">
            <p className="as-greet">{name ? tf("as.helloName", { name }) : t("as.hello")}</p>
            <p className="muted">{t("as.intro")}</p>
            <div className="as-tiles">
              {starters.map((s) => <button key={s} className="as-tile" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
            </div>
          </li>
        )}
        {turns.map((turn, i) => (
          <li key={i} className="as-turn">
            <p className="coach-q">{turn.question}</p>
            {!turn.reply && !turn.error && (
              <div className="as-thinking" role="status">
                <span className="as-bars" aria-hidden="true"><i /><i /><i /></span>{t("as.thinking")}
              </div>
            )}
            {turn.error && <p className="error" role="alert">{turn.error}</p>}
            {turn.reply && (
              <div className="coach-a as-answer">
                <p>{turn.reply.answer.replace(CITE, "")}</p>
                {(turn.reply.actions ?? []).length > 0 && (
                  <div className="as-actions">
                    {(turn.reply.actions ?? []).map((a, k) => {
                      const did = turn.done?.includes(a.label);
                      return (
                        <button key={`${a.kind}-${a.value}-${k}`} className={k === 0 ? "primary sm" : "btn quiet sm"} disabled={did} onClick={() => act(i, a)}>
                          {did ? "✓ " : a.kind === "open" ? "→ " : a.kind === "target" ? "⚑ " : "⇄ "}{actionLabel(a)}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="as-meta">
                  <AiBadge mode={turn.reply.mode} />
                  {turn.reply.grounding && (
                    <span className={`badge ${turn.reply.grounding.all_supported ? "good" : "risk"}`}>
                      {turn.reply.grounding.all_supported ? t("coach.grounded") : tf("coach.ungrounded", { list: turn.reply.grounding.unsupported.join(", ") })}
                    </span>
                  )}
                  <details><summary className="muted">{tf("coach.sources", { n: turn.reply.sources.length })}</summary>
                    <ul className="coach-sources">{turn.reply.sources.map((s) => <li key={s.id}><strong>{s.id}</strong> {tr(s.text)}</li>)}</ul>
                  </details>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      {turns.length > 0 && (
        <div className="chips coach-suggest">
          {suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}
        </div>
      )}
      <form className="as-form" onSubmit={(e) => { e.preventDefault(); ask(question); }}>
        <label className="sr-only" htmlFor="coach-q">{t("as.placeholder")}</label>
        <textarea id="coach-q" ref={input} rows={1} maxLength={500} value={question} placeholder={t("as.placeholder")} autoFocus
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(question); } }} />
        <MicButton onText={(text) => setQuestion((q) => `${q.trimEnd()} ${text}`.trim().slice(0, 500))} />
        <button className="primary" type="submit" disabled={busy || !question.trim()} aria-label={t("a.ask")}>↑</button>
      </form>
      <p className="as-foot">{t("note.coach")}{turns.length > 0 && <> <button className="link" onClick={() => setTurns([])}>{t("as.clear")}</button></>}</p>
    </aside>
  );
}

// Labels come from the API in English; the parts we know are rebuilt in the chosen language.
function actionLabel(a: CoachAction): string {
  if (a.kind === "scenario") return tf("as.a.scenario", { name: t(`sc.${a.value}` as StringKey) });
  if (a.kind === "target") return tf("as.a.target", { role: tr(a.label.replace(/^Set /, "").replace(/ as your destination$/, "")) });
  const screen = t(`as.screen.${a.value}` as StringKey);
  const role = a.role_id ? a.label.split(" for ")[1] : undefined;
  return role ? tf("as.a.openFor", { screen, role: tr(role) }) : tf("as.a.open", { screen });
}
