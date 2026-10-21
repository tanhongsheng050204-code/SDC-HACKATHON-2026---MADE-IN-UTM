import { useEffect, useId, useRef, useState } from "react";
import { GlossaryKey, t } from "../lib/i18n";

// A small "?" next to a term. Opens on hover, focus or tap; Esc or tapping outside closes it.
// The explanation is also given to screen readers through aria-describedby.
export function InfoTip({ term, label }: { term: GlossaryKey; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [open]);
  const text = t(term);
  return (
    <span className="info-tip" ref={ref} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="info-tip-btn" aria-label={`${t("gl.what")} ${label ?? ""}`.trim()}
        aria-describedby={id} aria-expanded={open} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>?</button>
      <span role="tooltip" id={id} className={open ? "info-tip-body is-open" : "info-tip-body"}>{text}</span>
    </span>
  );
}
