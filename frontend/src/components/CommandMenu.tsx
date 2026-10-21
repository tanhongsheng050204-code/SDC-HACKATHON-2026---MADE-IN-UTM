import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Icon, IconName } from "./Icon";

export interface Command { id: string; label: string; hint?: string; icon: IconName; group: string; run: () => void }

// Ctrl/Cmd+K: jump to any screen or role, change a setting, or ask Laluan. Arrow keys move,
// Enter runs, Esc closes. When nothing matches, Enter asks Laluan the typed question.
export function CommandMenu({ commands, onAsk, onClose }: { commands: Command[]; onAsk: (q: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  const before = useRef<Element | null>(document.activeElement);
  useEffect(() => {
    box.current?.focus();
    const back = before.current;
    return () => { if (back instanceof HTMLElement) back.focus(); };
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = needle ? commands.filter((c) => `${c.label} ${c.hint ?? ""} ${c.group}`.toLowerCase().includes(needle)) : commands;
    return list.slice(0, 40);
  }, [commands, needle]);
  const askItem = needle.length > 1;
  const total = shown.length + (askItem ? 1 : 0);
  const at = Math.min(active, Math.max(0, total - 1));

  function run(i: number) {
    if (i < shown.length) { shown[i].run(); onClose(); }
    else if (askItem) { onAsk(q.trim()); onClose(); }
  }
  function keys(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % Math.max(1, total)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + Math.max(1, total)) % Math.max(1, total)); }
    else if (e.key === "Enter") { e.preventDefault(); run(at); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }

  let lastGroup = "";
  return (
    <div className="cmdk-backdrop" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label={t("cmd.title")} onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <Icon name="radar" />
          <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys}
            placeholder={t("cmd.placeholder")} role="combobox" aria-expanded="true" aria-controls={`${id}-list`}
            aria-activedescendant={total ? `${id}-${at}` : undefined} aria-autocomplete="list" />
          <kbd>Esc</kbd>
        </div>
        <ul className="cmdk-list" id={`${id}-list`} role="listbox" aria-label={t("cmd.title")}>
          {shown.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id} role="presentation">
                {head && <span className="cmdk-group" role="presentation">{head}</span>}
                <div id={`${id}-${i}`} role="option" aria-selected={i === at} className="cmdk-item"
                  onMouseMove={() => setActive(i)} onClick={() => run(i)}>
                  <Icon name={c.icon} /><span>{c.label}</span>{c.hint && <small>{c.hint}</small>}
                </div>
              </li>
            );
          })}
          {askItem && (
            <li role="presentation">
              <span className="cmdk-group" role="presentation">{t("as.title")}</span>
              <div id={`${id}-${shown.length}`} role="option" aria-selected={at === shown.length} className="cmdk-item cmdk-ask"
                onMouseMove={() => setActive(shown.length)} onClick={() => run(shown.length)}>
                <Icon name="chat" /><span>{t("cmd.ask")} “{q.trim()}”</span>
              </div>
            </li>
          )}
          {total === 0 && <li className="cmdk-empty muted">{t("cmd.empty")}</li>}
        </ul>
        <p className="cmdk-foot"><kbd>↑</kbd><kbd>↓</kbd> {t("cmd.move")} · <kbd>Enter</kbd> {t("cmd.open")} · <kbd>Ctrl</kbd>+<kbd>K</kbd></p>
      </div>
    </div>
  );
}
