import { useEffect, useState } from "react";
import { api, RoleHistory, Scenario } from "../lib/api";
import { signed } from "../lib/format";
import { t, tf } from "../lib/i18n";
import { OUTLOOK_TEXT, OUTLOOK_TONE } from "../lib/labels";

// How this role's outlook moved across the forecasts Laluan has used, oldest first. Each row names
// its snapshot, so a number can be traced; the illustrative seed data is labelled as such.
export function ForecastHistory({ roleId, scenario }: { roleId: string; scenario: Scenario }) {
  const [data, setData] = useState<RoleHistory | null>(null);
  useEffect(() => { api.history(roleId, scenario).then(setData).catch(() => setData(null)); }, [roleId, scenario]);
  if (!data || data.points.length === 0) return null;
  const points = data.points;
  return (
    <details className="card forecast-history">
      <summary>{tf("hist.title", { n: points.length })}</summary>
      <p className="muted">{tf("hist.sub", { s: t(`sc.${scenario}`) })}</p>
      <ol className="history-list">
        {points.map((p, i) => {
          const move = i > 0 ? Math.round((p.index - points[i - 1].index) * 10) / 10 : null;
          return (
            <li key={p.snapshot_id} className={i === points.length - 1 ? "current" : ""}>
              <span className="history-date">{p.imported}</span>
              <span className="history-value">
                <strong>{signed(p.index)}%</strong> <span className={`badge ${OUTLOOK_TONE[p.label]}`}>{OUTLOOK_TEXT[p.label]}</span>
                {move !== null && move !== 0 && <span className={`history-move ${move > 0 ? "up" : "down"}`}>{move > 0 ? "▲" : "▼"} {signed(move)}</span>}
                {move === 0 && <span className="muted"> {t("hist.same")}</span>}
              </span>
              <span className="source">
                {p.snapshot_id}{p.illustrative && <> · <span className="badge risk">{t("src.illustrative")}</span></>}
                {p.reviewed_by && ` · ${tf("src.reviewedBy", { name: p.reviewed_by })}`}
                {i === points.length - 1 && <> · <span className="badge good">{t("src.inUse")}</span></>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="source">{t("hist.note")}</p>
    </details>
  );
}
