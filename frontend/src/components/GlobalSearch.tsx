import { FormEvent, KeyboardEvent, RefObject, useEffect, useId, useRef, useState } from "react";
import { api, type Profile, type RoleMatch, type Scenario } from "../lib/api";
import { percent } from "../lib/format";
import { t, tf, tr } from "../lib/i18n";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

// The top bar's one box: type a role to jump to it, or a question for the coach. Ctrl+K (⌘K)
// focuses it; on a phone it opens from a search icon. Roles load the first time it is used.
export function GlobalSearch({ profile, scenario, onOpenRole, onAsk }: {
  profile: Profile; scenario: Scenario; onOpenRole: (r: RoleMatch) => void; onAsk: (q?: string) => void;
}) {
  const [roles, setRoles] = useState<RoleMatch[] | null>(null);
  const [sheet, setSheet] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function load() { if (!roles) api.matches(profile.id, scenario).then((d) => setRoles(d.roles)).catch(() => setRoles([])); }
  useEffect(() => { setRoles(null); }, [profile.id, scenario]);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const pick = (r: RoleMatch) => { setSheet(false); onOpenRole(r); };
  const ask = (q?: string) => { setSheet(false); onAsk(q); };
  return (
    <>
      <SearchBox inputRef={input} roles={roles} onFocus={load} onPick={pick} onAsk={ask} className="global-search" />
      <button className="icon-btn search-icon" aria-label={t("search.label")} onClick={() => { load(); setSheet(true); }}><Icon name="search" /></button>
      {sheet && (
        <Sheet title={t("search.title")} onClose={() => setSheet(false)}>
          <SearchBox roles={roles} onFocus={load} onPick={pick} onAsk={ask} autoFocus />
        </Sheet>
      )}
    </>
  );
}

function SearchBox({ roles, onFocus, onPick, onAsk, inputRef, className = "", autoFocus }: {
  roles: RoleMatch[] | null; onFocus: () => void; onPick: (r: RoleMatch) => void; onAsk: (q?: string) => void;
  inputRef?: RefObject<HTMLInputElement>; className?: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const needle = q.trim().toLowerCase();
  const matches = needle.length < 2 ? [] : (roles ?? []).filter((r) =>
    tr(r.title).toLowerCase().includes(needle) || r.title.toLowerCase().includes(needle)).slice(0, 5);
  // The last option always asks the coach: with the text typed, or just opens it.
  const count = matches.length + 1;
  const at = Math.min(active, count - 1);

  function choose(i: number) {
    setOpen(false); setQ("");
    if (i < matches.length) onPick(matches[i]); else onAsk(q.trim() || undefined);
  }
  function submit(e: FormEvent) { e.preventDefault(); choose(at); }
  function keys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % count); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + count) % count); }
    else if (e.key === "Escape") { setOpen(false); (e.target as HTMLInputElement).blur(); }
  }
  return (
    <form className={`search-box ${className}`} onSubmit={submit} role="search">
      <Icon name="search" />
      <input ref={inputRef} type="text" maxLength={500} value={q} autoComplete="off" autoFocus={autoFocus}
        aria-label={t("search.label")} placeholder={t("search.placeholder")}
        role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open ? `${id}-o${at}` : undefined}
        onFocus={() => { onFocus(); setOpen(true); }} onBlur={() => setOpen(false)}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onKeyDown={keys} />
      <kbd aria-hidden="true">Ctrl K</kbd>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="search-list" aria-label={t("search.label")}>
          {matches.map((r, i) => (
            <li key={r.role_id} id={`${id}-o${i}`} role="option" aria-selected={i === at}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)}>
              <Icon name="briefcase" /><span>{tr(r.title)}</span><small>#{r.rank} · {percent(r.fit)}%</small>
            </li>
          ))}
          <li id={`${id}-o${matches.length}`} role="option" aria-selected={at === matches.length}
            onMouseDown={(e) => e.preventDefault()} onClick={() => choose(matches.length)}>
            <Icon name="chat" /><span>{q.trim() ? tf("search.ask", { q: q.trim() }) : t("search.openCoach")}</span><small>Enter</small>
          </li>
        </ul>
      )}
    </form>
  );
}
