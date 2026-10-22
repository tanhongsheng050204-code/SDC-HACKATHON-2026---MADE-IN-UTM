import { setSent } from "../lib/sent";
import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { MicButton } from "../components/MicButton";
import { api, Audience, ChatTurn, Programme, SendPreview, Skill } from "../lib/api";
import { getLang, StringKey, t, tf, tr } from "../lib/i18n";

type Tab = "upload" | "cv" | "chat" | "pick";
type Step = "audience" | "degree" | "method" | "input";

const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  { id: "worker", label: "aud.worker", hint: "aud.workerHint" },
  { id: "graduate", label: "aud.graduate", hint: "aud.graduateHint" },
  { id: "switcher", label: "aud.switcher", hint: "aud.switcherHint" },
];

const METHODS: { id: Tab; labelKey: string; hintKey: string }[] = [
  { id: "upload", labelKey: "in.methodUpload", hintKey: "in.methodUploadHint" },
  { id: "cv",     labelKey: "in.methodPaste",  hintKey: "in.methodPasteHint"  },
  { id: "chat",   labelKey: "in.methodChat",   hintKey: "in.methodChatHint"   },
  { id: "pick",   labelKey: "in.methodPick",   hintKey: "in.methodPickHint"   },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="intake-progress" role="progressbar" aria-label={tf("in.step", { n: step, total })}
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={step}>
      <div className="intake-progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Intake({ audience, onAudience, onDone: finish }: {
  audience: Audience | null; onAudience: (a: Audience) => void; onDone: (skills: string[]) => void;
}) {
  const [step, setStep] = useState<Step>("audience");
  const [method, setMethod] = useState<Tab>("upload");
  const [fromDegree, setFromDegree] = useState<string[]>([]);

  const onDone = (skills: string[]) => finish([...new Set([...fromDegree, ...skills])]);

  // Steps for non-grad: audience(1) → method(2) → input(3) = 3 total
  // Steps for grad:     audience(1) → degree(2) → method(3) → input(4) = 4 total
  const isGrad = audience === "graduate";
  const totalSteps = isGrad ? 4 : 3;

  const stepNumber: Record<Step, number> = isGrad
    ? { audience: 1, degree: 2, method: 3, input: 4 }
    : { audience: 1, degree: 1, method: 2, input: 3 };

  function goBack() {
    if (step === "method") {
      setStep(isGrad ? "degree" : "audience");
    } else if (step === "degree") {
      setStep("audience");
    } else if (step === "input") {
      setStep("method");
    }
  }

  // --- Audience step ---
  if (step === "audience") {
    return (
      <section className="intake-step">
        <ProgressBar step={1} total={totalSteps} />
        <h1>{t("aud.title")}</h1>
        <p className="muted">{t("aud.sub")}</p>
        <div className="audience-choices" role="radiogroup" aria-label={t("aud.title")}>
          {AUDIENCES.map((a) => (
            <button
              key={a.id}
              role="radio"
              aria-checked={audience === a.id}
              className="card audience"
              onClick={() => {
                onAudience(a.id);
                setStep(a.id === "graduate" ? "degree" : "method");
              }}
            >
              <strong>{t(a.label as never)}</strong>
              <span className="muted">{t(a.hint as never)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // --- Degree step (graduates only) ---
  if (step === "degree") {
    return (
      <section className="intake-step">
        <ProgressBar step={stepNumber.degree} total={totalSteps} />
        <button className="intake-back" onClick={goBack}>{t("in.back")}</button>
        <DegreeStart
          onChange={setFromDegree}
          onUse={(skills) => {
            setFromDegree(skills);
            setStep("method");
          }}
          onSkip={() => setStep("method")}
        />
      </section>
    );
  }

  // --- Method step ---
  if (step === "method") {
    return (
      <section className="intake-step">
        <ProgressBar step={stepNumber.method} total={totalSteps} />
        <button className="intake-back" onClick={goBack}>{t("in.back")}</button>
        <h1>{t("in.methodTitle")}</h1>
        <p className="muted">{t("in.methodSub")}</p>
        <div className="method-grid">
          {METHODS.map((m) => (
            <button
              key={m.id}
              className="method-card"
              onClick={() => { setMethod(m.id); setStep("input"); }}
            >
              <strong>{t(m.labelKey as never)}</strong>
              <small>{t(m.hintKey as never)}</small>
            </button>
          ))}
        </div>
      </section>
    );
  }

  // --- Input step ---
  return (
    <section className="intake-step">
      <ProgressBar step={stepNumber.input} total={totalSteps} />
      <button className="intake-back" onClick={goBack}>{t("in.back")}</button>
      {method === "upload" && <UploadCv onDone={onDone} />}
      {method === "cv"     && <PasteCv onDone={onDone} />}
      {method === "chat"   && <Questionnaire onDone={onDone} />}
      {method === "pick"   && <PickSkills onDone={onDone} />}
    </section>
  );
}

/** Degree start card — used on the degree step for graduates. */
function DegreeStart({
  onChange,
  onUse,
  onSkip,
}: {
  onChange: (skills: string[]) => void;
  onUse: (skills: string[]) => void;
  onSkip: () => void;
}) {
  const [list, setList] = useState<Programme[]>([]);
  const [all, setAll] = useState<Skill[]>([]);
  const [chosen, setChosen] = useState("");
  useEffect(() => {
    api.programmes().then(setList).catch(() => setList([]));
    api.skills().then(setAll).catch(() => setAll([]));
  }, []);
  const prog = list.find((p) => p.id === chosen);
  const name = (id: string) => tr(all.find((s) => s.id === id)?.name ?? id);
  return (
    <div className="card degree-start">
      <h2>{t("deg.title")}</h2>
      <p className="muted">{t("deg.sub")}</p>
      {list.length > 0 && (
        <label className="narrow">{t("deg.label")}
          <select value={chosen} onChange={(e) => {
            setChosen(e.target.value);
            onChange(list.find((p) => p.id === e.target.value)?.skills ?? []);
          }}>
            <option value="">{t("deg.choose")}</option>
            {list.map((p) => <option key={p.id} value={p.id}>{p.name[getLang()] || p.name.en}</option>)}
          </select>
        </label>
      )}
      {prog && (
        <>
          <p>{t("deg.usually")}</p>
          <div className="chips">{prog.skills.map((s) => <span key={s} className="chip covered">✓ {name(s)}</span>)}</div>
          <p className="source">{t("deg.note")}</p>
          <button className="primary" onClick={() => onUse(prog.skills)}>
            {tf("in.continueWith", { n: prog.skills.length })}
          </button>
        </>
      )}
      <button className="intake-back" style={{ marginTop: 8 }} onClick={onSkip}>
        {t("in.degreeSkip")}
      </button>
    </div>
  );
}

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
      {preview.from_scan && <p className="banner warning">{t("send.fromScan")}</p>}
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

// An upload goes straight to "Check your skills": the file is scrubbed on the server, the scrubbed text
// is what the AI reads, and that text waits on the next screen in a collapsed note (lib/sent.ts).
function UploadCv({ onDone }: { onDone: (skills: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const preview = await api.previewUpload(file);
      const { skills } = await api.extract(preview.text);
      setSent(preview);
      onDone(skills);
    }
    catch (e) { setError(e instanceof Error ? e.message : t("in.uploadFailed")); }
    finally { setBusy(false); }
  }
  return (
    <div className="dropzone">
      <Icon name="upload" />
      <p><strong>{t("in.uploadTitle")}</strong></p>
      <p className="muted">{t("in.uploadSub")}</p>
      <label className="btn ink file-btn">{busy ? t("in.reading") : t("in.chooseFile")}
        <input type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png"
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
