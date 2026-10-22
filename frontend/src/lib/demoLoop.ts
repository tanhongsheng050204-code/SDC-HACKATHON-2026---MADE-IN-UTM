// Looping "live demo" scenes on the landing page. A scene is a list of phase lengths in ms; the hook
// returns the current phase and starts again after the last one. It only runs while the scene is on
// screen. With reduce motion or Lite mode it stays on the final phase, so the finished picture shows.
import { RefObject, useEffect, useState } from "react";

export function stillMode(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.lite === "1";
}

export function useDemoLoop(ref: RefObject<HTMLElement>, phases: number[], paused = false): number {
  const last = phases.length - 1;
  const [phase, setPhase] = useState(() => (stillMode() ? last : 0));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);

  useEffect(() => {
    if (stillMode()) { setPhase(last); return; }
    if (!visible || paused) return;
    const id = window.setTimeout(() => setPhase((p) => (p >= last ? 0 : p + 1)), phases[phase]);
    return () => window.clearTimeout(id);
  }, [phase, visible, paused, last, phases]);

  return phase;
}

/** Text typed out one character at a time while `on` is true (all of it when motion is off). */
export function useTyping(text: string, on: boolean, msPerChar = 45): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) { setN(0); return; }
    if (stillMode()) { setN(text.length); return; }
    setN(0);
    const id = window.setInterval(() => setN((c) => { if (c >= text.length) { window.clearInterval(id); return c; } return c + 1; }), msPerChar);
    return () => window.clearInterval(id);
  }, [text, on, msPerChar]);
  return text.slice(0, n);
}
