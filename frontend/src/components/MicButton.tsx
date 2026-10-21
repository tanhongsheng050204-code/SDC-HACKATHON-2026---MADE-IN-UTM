import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { getLang, t } from "../lib/i18n";
import { Icon } from "./Icon";

// Voice input, in order: Whisper on our own server (audio never stored, transcript scrubbed),
// then the browser's speech recognition (with a note on where the audio goes), then typing.
// With neither, the button is not shown.

type Recognition = {
  lang: string; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type RecognitionCtor = new () => Recognition;

const BROWSER_LANG = { en: "en-MY", ms: "ms-MY", zh: "zh-CN" } as const;
const MAX_SECONDS = 120; // stays well under the server's 5 MB limit
let serverVoice: Promise<boolean> | null = null;

function browserRecognition(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

export function MicButton({ onText }: { onText: (text: string) => void }) {
  const [mode, setMode] = useState<"server" | "browser" | null>(null);
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [note, setNote] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Leaving the screen mid-recording discards it: audio is only ever sent after the person presses stop.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    serverVoice ??= api.health().then((h) => !!h.voice).catch(() => false);
    serverVoice.then((ok) => { if (alive.current) setMode(ok && canRecord() ? "server" : browserRecognition() ? "browser" : null); });
    return () => {
      alive.current = false;
      window.clearTimeout(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      recorder.current?.stream.getTracks().forEach((track) => track.stop());
      recognition.current?.stop();
    };
  }, []);

  if (!mode) return null;

  async function startServer() {
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { setNote(t("mic.failed")); return; }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      window.clearTimeout(timer.current);
      stream.getTracks().forEach((track) => track.stop());
      if (!alive.current) return;
      setState("working");
      try {
        const { text } = await api.transcribe(new Blob(chunks, { type: rec.mimeType || "audio/webm" }), getLang());
        if (!alive.current) return;
        if (text) onText(text);
        setNote(null);
      } catch {
        if (!alive.current) return;
        // Cold or missing worker: the browser's own recognition is next, if there is one.
        if (browserRecognition()) { setMode("browser"); setNote(t("mic.browser")); } else setNote(t("mic.failed"));
      } finally { if (alive.current) setState("idle"); }
    };
    recorder.current = rec;
    rec.start();
    timer.current = window.setTimeout(() => { if (rec.state === "recording") rec.stop(); }, MAX_SECONDS * 1000);
    setState("recording"); setNote(null);
  }

  function startBrowser() {
    const Ctor = browserRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = BROWSER_LANG[getLang()];
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const text = e.results[0]?.[0]?.transcript?.trim(); if (text && alive.current) onText(text); };
    rec.onerror = () => { if (alive.current) setNote(t("mic.failed")); };
    rec.onend = () => { if (alive.current) setState("idle"); };
    recognition.current = rec;
    rec.start();
    setState("recording"); setNote(t("mic.browser"));
  }

  function toggle() {
    if (state === "working") return;
    if (state === "recording") {
      if (mode === "server") recorder.current?.stop(); else recognition.current?.stop();
      return;
    }
    if (mode === "server") void startServer(); else startBrowser();
  }

  const label = state === "recording" ? t("mic.stop") : state === "working" ? t("mic.working") : t("mic.start");
  return (
    <span className="mic">
      <button type="button" className={state === "recording" ? "mic-btn recording" : "mic-btn"} onClick={toggle}
        disabled={state === "working"} aria-pressed={state === "recording"} aria-label={label} title={label}>
        <Icon name="mic" />
      </button>
      {state === "working" && <span className="muted" aria-live="polite">{t("mic.working")}</span>}
      {note && <span className="muted mic-note" role="status">{note}</span>}
    </span>
  );
}
