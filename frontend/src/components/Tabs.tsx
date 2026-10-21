import { KeyboardEvent, ReactNode, useRef } from "react";

// Accessible tabs (WAI-ARIA tabs pattern): arrow keys, Home and End move between tabs, and only
// the selected tab is in the tab order. The panel is labelled by its tab.
export function Tabs<T extends string>({ id, label, tabs, value, onChange, children }: {
  id: string; label: string; tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void; children: ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: KeyboardEvent, i: number) {
    const last = tabs.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1) : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
      : e.key === "Home" ? 0 : e.key === "End" ? last : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    refs.current[next]?.focus();
  }
  return (
    <>
      <div className="tabs" role="tablist" aria-label={label}>
        {tabs.map((tab, i) => (
          <button key={tab.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`${id}-tab-${tab.id}`}
            aria-selected={value === tab.id} aria-controls={`${id}-panel`} tabIndex={value === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)} onKeyDown={(e) => onKey(e, i)}>{tab.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${value}`} className="tab-panel">{children}</div>
    </>
  );
}
