import type { Matches, Scenario } from "../lib/api";
import { InfoTip } from "./InfoTip";
import { percent, signed } from "../lib/format";
import { t } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

export function Kpis({ data, scenario }: { data: Matches; scenario: Scenario }) {
  const top = data.roles[0];
  const robust = data.roles.filter((r) => r.robust_pick).length;
  const current = data.roles.find((r) => r.is_current_role);
  const src = data.signal_source;
  return (
    <div className="kpis">
      <div className="kpi">
        <span className="kpi-label">{t("k.top")}</span><strong>{top?.title ?? "–"}</strong>
        {top && <span className="badge good">{percent(top.fit)}% {t("k.fit")}</span>}
      </div>
      <div className="kpi">
        <span className="kpi-label">{t("k.robust")} <InfoTip term="gl.robust" label="robust pick" /></span><strong>{robust}</strong>
        <span className="badge">{t("k.robustNote")}</span>
      </div>
      <div className="kpi">
        <span className="kpi-label">{t("k.current")}</span>
        <strong>{current ? `${signed(current.outlook[scenario].index)}%` : "–"}</strong>
        {current
          ? <span className={`badge ${OUTLOOK_TONE[current.outlook[scenario].label]}`}>{OUTLOOK_TEXT[current.outlook[scenario].label]} to {src.horizon_year}</span>
          : <span className="badge">{t("k.notSet")}</span>}
      </div>
      <div className="kpi">
        <span className="kpi-label">{t("k.data")}</span><strong>{src.imported.slice(0, 10)}</strong>
        <span className={`badge ${src.illustrative ? "risk" : "good"}`}>{src.illustrative ? t("k.illustrative") : t("k.cited")}</span>
      </div>
    </div>
  );
}
