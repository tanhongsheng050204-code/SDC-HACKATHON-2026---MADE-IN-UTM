import type { ReactNode } from "react";
import { t, type StringKey } from "../lib/i18n";

// "Your data" as a privacy label: one short answer per row, the full plain-words text one tap down.
// Every full text matches the code (backend/app/store.py tables, the scrub in app/services/deid.py,
// cascade delete on profiles); change both together.
const ROWS: { key: string; icon: string; tone: string; also?: StringKey }[] = [
  { key: "saved", icon: "✓", tone: "keep" },
  { key: "never", icon: "✕", tone: "never" },
  { key: "ai", icon: "AI", tone: "ai" },
  { key: "who", icon: "👁", tone: "who" },
  { key: "rights", icon: "⇩", tone: "rights", also: "priv.deleteText" },
];

export function PrivacyPanel({ actions }: { actions?: ReactNode }) {
  return (
    <section className="privacy" id="your-data" aria-labelledby="privacy-title">
      <h2 id="privacy-title" className="sr-only">{t("priv.title")}</h2>
      <div className="privacy-label">
        {ROWS.map((r) => (
          <details key={r.key}>
            <summary>
              <span className={`privacy-icon ${r.tone}`} aria-hidden="true">{r.icon}</span>
              <span><strong>{t(`priv.${r.key}` as StringKey)}</strong><span className="muted">{t(`priv.${r.key}Short` as StringKey)}</span></span>
            </summary>
            <div className="privacy-full">
              <p>{t(`priv.${r.key}Text` as StringKey)}</p>
              {r.also && <p>{t(r.also)}</p>}
            </div>
          </details>
        ))}
      </div>
      {actions}
    </section>
  );
}
