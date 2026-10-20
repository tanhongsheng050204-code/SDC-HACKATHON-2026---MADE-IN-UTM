import type { Pay } from "../lib/api";
import { t } from "../lib/i18n";

const rm = (n: number) => `RM${n.toLocaleString("en-MY")}`;

// The pay difference between occupation groups, from DOSM. Always labelled as group medians.
export function PayLine({ pay, change, compact = false }: { pay: Pay; change: number | null; compact?: boolean }) {
  const rounded = change === null ? null : Math.round(change / 100) * 100;
  if (compact) {
    return <span className="muted pay">{t("pay.median")} {rm(pay.median_rm)}{rounded !== null && rounded !== 0 && ` (${rounded > 0 ? "+" : "−"}${rm(Math.abs(rounded))})`}</span>;
  }
  return (
    <div className="card pay-card">
      <span className="kpi-label">{t("pay.title")}</span>
      {change !== null ? (
        <p><strong>{rm(pay.median_rm - change)} → {rm(pay.median_rm)}</strong>: {t("pay.about")} {rounded! >= 0 ? "+" : "−"}{rm(Math.abs(rounded!))} {t("pay.month")}.</p>
      ) : (
        <p><strong>{pay.group}: {rm(pay.median_rm)}</strong> {t("pay.month")}.</p>
      )}
      <p className="source">{change === null && t("pay.sameGroup")} {t("pay.note")} {pay.group}. <a href={pay.source_url} target="_blank" rel="noreferrer">{pay.source}</a>, {pay.table.split(":")[0]}.</p>
    </div>
  );
}
