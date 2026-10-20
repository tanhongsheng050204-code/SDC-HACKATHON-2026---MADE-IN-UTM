import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { api, Audience, ChatTurn, Skill } from "../lib/api";
import { getLang, t } from "../lib/i18n";

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

function UploadCv({ onDone }: { onDone: (skills: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try { onDone((await api.upload(file)).skills); }
    catch (e) { setError(e instanceof Error ? e.message : "Upload failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="dropzone">
      <Icon name="upload" />
      <p><strong>Upload your CV</strong></p>
      <p className="muted">PDF, Word (.docx) or text, up to 5 MB. Read in memory and never stored.</p>
      <label className="btn ink file-btn">{busy ? t("in.reading") : "Choose a file"}
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
  const length = text.trim().length;
  async function read() {
    setBusy(true); setError(null);
    try { onDone((await api.extract(text)).skills); }
    catch { setError("We couldn't read that. Try picking skills from the list instead."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <label htmlFor="cv">Paste your CV or describe your work (at least 50 characters)</label>
      <textarea id="cv" rows={10} maxLength={20000} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="muted counter" aria-live="polite">{length < 50 ? `${50 - length} more characters` : `${length.toLocaleString()} / 20,000`}</p>
      <button className="primary" disabled={busy || length < 50} onClick={read}>
        {busy ? t("in.reading") : t("in.read")}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

function PickSkills({ onDone }: { onDone: (skills: string[]) => void }) {
  const [all, setAll] = useState<Skill[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.skills().then(setAll).catch(() => setError("Can't load the skill list.")); }, []);
  const shown = all.filter((s) => s.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <>
      <label className="narrow">Filter skills
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. Excel" />
      </label>
      <div className="chips">
        {shown.map((s) => (
          <button key={s.id} className={picked.includes(s.id) ? "chip covered" : "chip"} aria-pressed={picked.includes(s.id)}
            onClick={() => toggle(s.id)}>{s.name}</button>
        ))}
        {all.length > 0 && shown.length === 0 && <p className="muted">No skill matches “{filter}”.</p>}
      </div>
      <button className="primary" disabled={picked.length < 3} onClick={() => onDone(picked)}>
        {picked.length < 3 ? "Pick at least 3 skills" : `Continue with ${picked.length} skills`}
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
      .catch(() => setError("The questionnaire is unavailable. Try another tab."));
  }, []);
  async function send() {
    if (!answer.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: answer.trim() }];
    setAnswer(""); setBusy(true); setError(null);
    try {
      const reply = await api.turn(next, getLang());
      setTurn(reply);
      setMessages([...next, { role: "assistant", content: reply.next_question }]);
    } catch { setError("Couldn't send that. Try again."); }
    finally { setBusy(false); }
  }
  return (
    <div className="chat card">
      <ol className="chat-log" aria-live="polite">
        {messages.map((m, i) => <li key={i} className={m.role}>{m.content}</li>)}
      </ol>
      {turn && turn.skills_found.length > 0 && <p className="muted">Skills found so far: {turn.skills_found.length}</p>}
      {turn?.is_complete ? (
        <button className="primary" disabled={turn.skills_found.length === 0} onClick={() => onDone(turn.skills_found)}>
          {turn.skills_found.length ? `Continue with ${turn.skills_found.length} skills` : "No skills found. Try another tab"}
        </button>
      ) : (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <label className="sr-only" htmlFor="answer">Your answer</label>
          <input id="answer" type="text" maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer" />
          <button className="primary" type="submit" disabled={busy || !answer.trim()}>{busy ? "…" : "Send"}</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
