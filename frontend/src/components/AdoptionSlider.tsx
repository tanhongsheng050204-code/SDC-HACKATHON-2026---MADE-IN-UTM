import { useEffect, useState } from "react";
import { api, Tipping } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

const MIN = 0.5, MAX = 2;
const fmt = (v: number) => v.toFixed(2).replace(/0$/, "");
const left = (v: number) => `${((v - MIN) / (MAX - MIN)) * 100}%`;

// "Custom" AI speed: adoption from 0.5x to 2x, with the tipping points Laluan found marked on the
// scale where they happen and named in a short legend underneath.
export function SpeedPanel({ profileId, year, value, preset, onChange }: {
  profileId: string; year?: number; value: number | undefined; preset: number; onChange: (v: number | undefined) => void;
}) {
  // Opens at the chosen preset's speed (Fast is 1.6x), so nothing changes until the slider moves.
  const [draft, setDraft] = useState(value ?? preset);
  const [tip, setTip] = useState<Tipping | null>(null);
  useEffect(() => setDraft(value ?? preset), [value, preset]);
  useEffect(() => {
    if (draft === (value ?? preset)) return;
    const id = window.setTimeout(() => onChange(draft), 200);  // re-rank once the slider rests
    return () => window.clearTimeout(id);
  }, [draft]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.tipping(profileId, year).then(setTip).catch(() => setTip(null)); }, [profileId, year]);

  const marks: { at: number; tone: "risk" | "flip"; text: string }[] = [];
  const c = tip?.current_role;
  if (c && c.declining_at !== null) {
    marks.push({ at: c.declining_at, tone: "risk",
      text: tf(c.declining_below ? "roles.tipDeclBelow" : "roles.tipDecl", { at: fmt(c.declining_at), job: tr(c.title) }) });
  }
  for (const m of tip?.overtakes ?? []) {
    marks.push({ at: m.at, tone: "flip",
      text: tf(m.direction === "below" ? "roles.tipOverBelow" : "roles.tipOver", { at: fmt(m.at), a: tr(m.title), b: tr(m.overtakes_title) }) });
  }

  return (
    <div className="speed-panel">
      <label htmlFor="adoption"><strong>{tf("roles.customTitle", { v: fmt(draft) })}</strong></label>
      <input id="adoption" type="range" min={MIN} max={MAX} step={0.05} value={draft}
        onChange={(e) => setDraft(Number(e.target.value))} aria-valuetext={`${fmt(draft)}×`} />
      {marks.length > 0 && (
        <div className="speed-marks" aria-hidden="true">
          {[...new Set(marks.map((m) => m.at))].map((at) => (
            <span key={at} className={marks.find((m) => m.at === at)!.tone} style={{ left: left(at) }}>{fmt(at)}×</span>
          ))}
        </div>
      )}
      <div className="speed-scale" aria-hidden="true"><span>{t("roles.slower")}</span><span>{t("roles.published")}</span><span>{t("roles.faster")}</span></div>
      {marks.length > 0 && (
        <ul className="speed-legend" aria-label={t("adopt.tipping")}>
          {marks.map((m) => <li key={m.text} className={m.tone}>{m.text}</li>)}
        </ul>
      )}
      {value !== undefined && <button className="link" onClick={() => onChange(undefined)}>{t("roles.reset")}</button>}
    </div>
  );
}
