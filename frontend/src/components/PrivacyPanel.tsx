import { t, type StringKey } from "../lib/i18n";

// "Your data", in plain words: what Laluan keeps, what it never keeps, what an AI reads, who can see
// it, and how to remove it. Every line matches the code (backend/app/store.py tables, the scrub in
// app/services/deid.py, cascade delete on profiles); change both together.
const BLOCKS = [
  { key: "saved", tone: "mint" },
  { key: "never", tone: "sand" },
  { key: "ai", tone: "sky" },
  { key: "who", tone: "mint" },
  { key: "rights", tone: "sky" },
  { key: "delete", tone: "sand" },
] as const;

export function PrivacyPanel() {
  return (
    <section className="privacy" id="your-data" aria-labelledby="privacy-title">
      <h2 id="privacy-title">{t("priv.title")}</h2>
      <p className="muted">{t("priv.sub")}</p>
      <div className="privacy-grid">
        {BLOCKS.map((b) => (
          <div key={b.key} className={`privacy-card ${b.tone}`}>
            <h3>{t(`priv.${b.key}` as StringKey)}</h3>
            <p>{t(`priv.${b.key}Text` as StringKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
