import { useId, useState } from "react";
import type { Skill } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

const MAX_RESULTS = 8;

// Add a skill by typing: matches the skill's name in the chosen language, its English name and its
// nicknames ("vlookup" finds Spreadsheets). Below it, one-tap suggestions such as the job's core skills.
export function SkillPicker({ skills, have, suggested, suggestLabel, onAdd }: {
  skills: Skill[]; have: string[]; suggested: string[]; suggestLabel?: string; onAdd: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const id = useId();
  const query = q.trim().toLowerCase();
  const hits = query ? skills.filter((s) => !have.includes(s.id)).map((s) => {
    const names = [tr(s.name), s.name].map((n) => n.toLowerCase());
    const via = names.some((n) => n.includes(query)) ? null : s.aliases?.find((a) => a.toLowerCase().includes(query));
    return names.some((n) => n.includes(query)) || via ? { skill: s, via } : null;
  }).filter((x) => x !== null).slice(0, MAX_RESULTS) : [];
  const open = focused && query.length > 0;
  const pick = (skillId: string) => { onAdd(skillId); setQ(""); setActive(0); };
  const suggest = suggested.filter((s) => !have.includes(s));
  const nameOf = (skillId: string) => tr(skills.find((s) => s.id === skillId)?.name ?? skillId);

  return (
    <div className="skill-picker">
      <div className="skill-search">
        <svg className="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="text" value={q} placeholder={t("pick.placeholder")} aria-label={t("pick.label")} autoComplete="off"
          role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${id}-${hits[active].skill.id}` : undefined}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === "Enter" && hits[active]) { e.preventDefault(); pick(hits[active].skill.id); }
            else if (e.key === "Escape") setQ("");
          }} />
        {open && (
          <ul className="skill-results" id={`${id}-list`} role="listbox" aria-label={t("pick.label")}>
            {hits.map((h, i) => (
              <li key={h.skill.id} id={`${id}-${h.skill.id}`} role="option" aria-selected={i === active}
                className={i === active ? "active" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(h.skill.id)}>
                <span>{tr(h.skill.name)}</span>{h.via && <small>{tf("pick.matches", { word: h.via })}</small>}
              </li>
            ))}
            {hits.length === 0 && <li className="skill-none">{tf("pick.none", { q: q.trim() })}</li>}
          </ul>
        )}
      </div>
      {suggest.length > 0 && (
        <div className="skill-suggest">
          {suggestLabel && <span>{suggestLabel}</span>}
          {suggest.map((s) => <button key={s} type="button" className="skill-add" onClick={() => onAdd(s)}>+ {nameOf(s)}</button>)}
        </div>
      )}
    </div>
  );
}
