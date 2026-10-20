import { useEffect, useState } from "react";
import { Lang, LANGS, getLang, setLang, t } from "../lib/i18n";
import { KEYS, load, save } from "../lib/storage";
import { Icon } from "./Icon";

type Theme = "light" | "dark";

// A theme is remembered only once the person picks one; until then the system setting wins.
export function useTheme() {
  const [chosen, setChosen] = useState<Theme | null>(() => {
    const saved = load(KEYS.theme);
    return saved === "light" || saved === "dark" ? saved : null;
  });
  const system: Theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = chosen ?? system;
  useEffect(() => {
    if (chosen) document.documentElement.dataset.theme = chosen;
    else delete document.documentElement.dataset.theme;
  }, [chosen]);
  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChosen(next);
    save(KEYS.theme, next);
  }
  return { theme, toggle };
}

export function useLite() {
  const [lite, setLite] = useState(() => load(KEYS.lite) === "1");
  useEffect(() => {
    if (lite) document.documentElement.dataset.lite = "1";
    else delete document.documentElement.dataset.lite;
    save(KEYS.lite, lite ? "1" : "0");
  }, [lite]);
  return { lite, setLite };
}

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

export function LiteToggle({ lite, onChange }: { lite: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="check lite-toggle" title={t("shell.liteHelp")}>
      <input type="checkbox" checked={lite} onChange={(e) => onChange(e.target.checked)} /> {t("shell.lite")}
    </label>
  );
}

export function ThemeButton({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button className="icon-btn" onClick={onToggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
