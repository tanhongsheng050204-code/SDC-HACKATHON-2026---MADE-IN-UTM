import { useState } from "react";
import { getLang, Lang, LANGS, setLang, t } from "../lib/i18n";

// The strings live in i18n.ts; this state only makes React re-render when the language changes.
export function useLang() {
  const [lang, setLangState] = useState<Lang>(getLang);
  return { lang, change: (l: Lang) => { setLang(l); setLangState(l); } };
}

export function LangPicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <label className="lang-picker"><span className="sr-only">{t("shell.language")}</span>
      <select value={lang} onChange={(e) => onChange(e.target.value as Lang)}>
        {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
    </label>
  );
}
