import { useEffect, useState } from "react";
import { api, Tipping } from "../lib/api";
import { t, tr } from "../lib/i18n";

// "Your own AI future": AI adoption speed from 0.5x to 2x, beside the three presets.
export function AdoptionSlider({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? 1);
  useEffect(() => setDraft(value ?? 1), [value]);
  useEffect(() => {
    if (draft === (value ?? 1)) return;
    const id = window.setTimeout(() => onChange(draft), 200);  // re-rank once the slider rests
    return () => window.clearTimeout(id);
  }, [draft]);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="adoption">
      <label htmlFor="adoption">{t("adopt.label")} <strong>{draft.toFixed(2).replace(/0$/, "")}×</strong>
        {value !== undefined && <button className="link" onClick={() => onChange(undefined)}>{t("adopt.reset")}</button>}
      </label>
      <input id="adoption" type="range" min={0.5} max={2} step={0.05} value={draft}
        onChange={(e) => setDraft(Number(e.target.value))} aria-valuetext={`${draft}×`} />
      <div className="year-ticks" aria-hidden="true"><span>0.5× {t("adopt.slow")}</span><span>1× {t("adopt.published")}</span><span>2× {t("adopt.fast")}</span></div>
    </div>
  );
}

// Plain sentences for the tipping points Laluan found, if any.
export function TippingPoints({ profileId, year }: { profileId: string; year?: number }) {
  const [tip, setTip] = useState<Tipping | null>(null);
  useEffect(() => { api.tipping(profileId, year).then(setTip).catch(() => setTip(null)); }, [profileId, year]);
  if (!tip) return null;
  const lines: string[] = [];
  const c = tip.current_role;
  if (c && c.declining_at !== null) {
    lines.push(`${t("adopt.yourJob")} (${tr(c.title)}) ${t("adopt.becomes")} ${c.declining_below ? t("adopt.below") : t("adopt.above")} ${c.declining_at}× ${t("adopt.adoption")}.`);
  }
  for (const m of tip.overtakes) {
    lines.push(`${tr(m.title)} ${t("adopt.overtakes")} ${tr(m.overtakes_title)} ${m.direction === "above" ? t("adopt.above") : t("adopt.below")} ${m.at}× ${t("adopt.adoption")}.`);
  }
  if (!lines.length) return null;
  return (
    <div className="card tipping" role="note">
      <span className="kpi-label">{t("adopt.tipping")}</span>
      <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
  );
}
