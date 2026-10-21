import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { MicButton } from "../components/MicButton";
import { api, Audience, ChatTurn, SendPreview, Skill } from "../lib/api";
import { getLang, StringKey, t, tf, tr } from "../lib/i18n";

type Tab = "upload" | "cv" | "chat" | "pick";

const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  { id: "worker", label: "aud.worker", hint: "aud.workerHint" },
  { id: "graduate", label: "aud.graduate", hint: "aud.graduateHint" },
  { id: "switcher", label: "aud.switcher", hint: "aud.switcherHint" },
];

export function Intake({ audience, onAudience, onDone }: {
  audience: Audience | null; onAudience: (a: Audience) => void; onDone: (skills: string[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("upload");
  if (!audience) {
    return (
      <section>
        <div className="page-head"><h1>{t("aud.title")}</h1><p className="muted">{t("aud.sub")}</p></div>
        <div className="audience-choices" role="radiogroup" aria-label={t("aud.title")}>
          {AUDIENCES.map((a) => (
            <button key={a.id} role="radio" aria-checked={false} className="card audience" onClick={() => onAudience(a.id)}>
              <strong>{t(a.label as never)}</strong><span className="muted">{t(a.hint as never)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }
  const tabs: { id: Tab; label: string }[] = [
    { id: "upload", label: t("in.upload") },
    { id: "cv", label: t("in.paste") },
    { id: "chat", label: t("in.chat") },
    { id: "pick", label: t("in.pick") },
  ];
  return (
    <section>
      <div className="page-head"><h1>{t("h.skills")}</h1></div>
      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button key={x.id} role="tab" id={`tab-${x.id}`} aria-selected={tab === x.id} aria-controls="intake-panel"
            onClick={() => setTab(x.id)}>{x.label}</button>
        ))}
      </div>
      <p className="source">{t("note.cv")}</p>
      <div id="intake-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "upload" && <UploadCv onDone={onDone} />}
        {tab === "cv" && <PasteCv onDone={onDone} />}
        {tab === "chat" && <Questionnaire onDone={onDone} />}
        {tab === "pick" && <PickSkills onDone={onDone} />}
      </div>
    </section>
  );
}

/** What gets sent: the scrubbed text, editable, before any language model reads it. */
function SendCheck({ preview, onBack, onDone }: { preview: SendPreview; onBack: () => void; onDone: (skills: string[]) => void }) {
  const [text, setText] = useState(preview.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const removed = Object.entries(preview.removed);
  async function send() {
    setBusy(true); setError(null);
    try { onDone((await api.extract(text)).skills); }
    catch { setError(t("in.readFailed")); }
    finally { setBusy(false); }
  }
  return (
    <div className="send-check">
      <h2>{t("send.title")}</h2>
      <p className="muted">{t("send.sub")}</p>
      {removed.length ? (
        <p className="chips" aria-label={t("send.removed")}>
          <span>{t("send.removed")}:</span>
          {removed.map(([kind, n]) => <span key={kind} className="chip">{t(`pii.${kind}` as StringKey)} ({n})</span>)}
        </p>
      ) : <p className="muted">{t("send.none")}</p>}
      <label className="sr-only" htmlFor="send-text">{t("send.title")}</label>
      <textarea id="send-text" rows={12} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions">
        <button className="primary" disabled={busy || text.trim().length < 50} onClick={send}>{busy ? t("in.reading") : t("send.ok")}</button>
        <button className="btn quiet" disabled={busy} onClick={onBack}>{t("send.back")}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function UploadCv({ onDone }: { onDone: (skills: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SendPreview | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try { setPreview(await api.previewUpload(file)); }
    catch (e) { setError(e instanceof Error ? e.message : t("in.uploadFailed")); }
    finally { setBusy(false); }
  }
  if (preview) return <SendCheck preview={preview} onBack={() => setPreview(null)} onDone={onDone} />;
  return (
    <div className="dropzone">
      <Icon name="upload" />
      <p><strong>{t("in.uploadTitle")}</strong></p>
      <p className="muted">{t("in.uploadSub")}</p>
      <label className="btn ink file-btn">{busy ? t("in.reading") : t("in.chooseFile")}
        <input type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

function PasteCv({ onDone }: { onDone: (skills: string[]) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const length = text.trim().length;
  async function check() {
    setBusy(true); setError(null);
    try { setPreview(await api.preview(text)); }
    catch { setError(t("in.readFailed")); }
    finally { setBusy(false); }
  }
  if (preview) return <SendCheck preview={preview} onBack={() => setPreview(null)} onDone={onDone} />;
  return (
    <>
      <label htmlFor="cv">{t("in.pasteLabel")}</label>
      <textarea id="cv" rows={10} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row-between">
        <p className="muted counter" aria-live="polite">{length < 50 ? tf("in.moreChars", { n: 50 - length }) : `${length.toLocaleString()} / 20,000`}</p>
        <MicButton onText={(spoken) => setText((x) => `${x.trimEnd()}\n${spoken}`.trim().slice(0, 20000))} />
      </div>
      <button className="primary" disabled={busy || length < 50} onClick={check}>
        {busy ? t("in.reading") : t("send.check")}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

// Skills are shown one field at a time, so the list is never a wall of words; typing a filter
// searches every field. What is picked stays listed whichever field is open.
const FIELDS = ["digital", "data", "ai", "technical", "business", "human", "green"] as const;

function PickSkills({ onDone }: { onDone: (skills: string[]) => void }) {
  const [all, setAll] = useState<Skill[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [field, setField] = useState<string>(FIELDS[0]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.skills().then(setAll).catch(() => setError("Can't load the skill list.")); }, []);
  const query = filter.trim().toLowerCase();
  const fields = [...FIELDS, ...new Set(all.map((s) => s.category).filter((c) => !(FIELDS as readonly string[]).includes(c)))];
  const fieldName = (c: string) => ((FIELDS as readonly string[]).includes(c) ? t(`pick.${c}` as StringKey) : c);
  const shown = all.filter((s) => (query ? `${s.name} ${tr(s.name)}`.toLowerCase().includes(query) : s.category === field));  // either language matches
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const chip = (s: Skill) => (
    <button key={s.id} className={picked.includes(s.id) ? "chip covered" : "chip"} aria-pressed={picked.includes(s.id)}
      onClick={() => toggle(s.id)}>{picked.includes(s.id) && "✓ "}{tr(s.name)}</button>
  );
  return (
    <>
      <label className="narrow">{t("pick.filter")}
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("in.filterHint")} />
      </label>
      {!query && (
        <div className="tabs pick-fields" role="tablist" aria-label={t("pick.fields")}>
          {fields.filter((c) => all.some((s) => s.category === c)).map((c) => {
            const n = all.filter((s) => s.category === c && picked.includes(s.id)).length;
            return <button key={c} role="tab" aria-selected={field === c} onClick={() => setField(c)}>
              {fieldName(c)}{n > 0 && <span className="badge good">{n}</span>}</button>;
          })}
        </div>
      )}
      {query ? fields.filter((c) => shown.some((s) => s.category === c)).map((c) => (
        <div key={c} className="pick-group"><span className="kpi-label">{fieldName(c)}</span>
          <div className="chips">{shown.filter((s) => s.category === c).map(chip)}</div></div>
      )) : <div className="chips" role="tabpanel">{shown.map(chip)}</div>}
      {all.length > 0 && query && shown.length === 0 && <p className="muted">{tf("in.noMatch", { q: filter })}</p>}
      {picked.length > 0 && (
        <div className="pick-group"><span className="kpi-label">{t("pick.picked")} ({picked.length})</span>
          <div className="chips">{all.filter((s) => picked.includes(s.id)).map(chip)}</div></div>
      )}
      <button className="primary" disabled={picked.length < 3} onClick={() => onDone(picked)}>
        {picked.length < 3 ? t("in.pickThree") : tf("in.continueWith", { n: picked.length })}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

function Questionnaire({ onDone }: { onDone: (skills: string[]) => void }) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [turn, setTurn] = useState<ChatTurn | null>(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.turn([], getLang())
      .then((first) => { setTurn(first); setMessages([{ role: "assistant", content: first.next_question }]); })
      .catch(() => setError(t("in.chatUnavailable")));
  }, []);
  async function send() {
    if (!answer.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: answer.trim() }];
    setAnswer(""); setBusy(true); setError(null);
    try {
      const reply = await api.turn(next, getLang());
      setTurn(reply);
      setMessages([...next, { role: "assistant", content: reply.next_question }]);
    } catch { setError(t("in.sendFailed")); }
    finally { setBusy(false); }
  }
  return (
    <div className="chat card">
      <ol className="chat-log" aria-live="polite">
        {messages.map((m, i) => <li key={i} className={m.role}>{m.content}</li>)}
      </ol>
      {turn && turn.skills_found.length > 0 && <p className="muted">{tf("in.foundSoFar", { n: turn.skills_found.length })}</p>}
      {turn?.is_complete ? (
        <button className="primary" disabled={turn.skills_found.length === 0} onClick={() => onDone(turn.skills_found)}>
          {turn.skills_found.length ? tf("in.continueWith", { n: turn.skills_found.length }) : t("in.noneFound")}
        </button>
      ) : (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="answer">{t("in.answer")}</label>
          <input id="answer" type="text" maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t("in.typeAnswer")} />
          <MicButton onText={(spoken) => setAnswer((a) => `${a.trimEnd()} ${spoken}`.trim().slice(0, 1000))} />
          <button className="primary" type="submit" disabled={busy || !answer.trim()}>{busy ? "…" : t("in.send")}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
