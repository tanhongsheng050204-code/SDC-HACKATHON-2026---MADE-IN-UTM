import { useEffect, useId, type ReactNode } from "react";
import { t } from "../lib/i18n";

// A panel from the right (from the bottom on a phone) that closes on Escape or a click outside.
export function Sheet({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  const id = useId();
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="sheet-x" aria-label={t("prof.close")} onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
