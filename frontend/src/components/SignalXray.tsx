import { useEffect, useState } from "react";
import { api, Scenario, Xray } from "../lib/api";
import { t } from "../lib/i18n";
import { ExposureBand } from "./Exposure";

// How one forecast number is built: baseline, trend adjustments, scenario swing, year scaling.
export function SignalXray({ roleId, scenario, year, adoption, onClose }: {
  roleId: string; scenario: Scenario; year?: number; adoption?: number; onClose: () => void;
}) {
  const [xray, setXray] = useState<Xray | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { api.xray(roleId, scenario, year, adoption).then(setXray).catch(() => setError(true)); }, [roleId, scenario, year, adoption]);
  const sign = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog xray" role="dialog" aria-modal="true" aria-labelledby="xray-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="xray-title">{t("xray.title")}{xray && `: ${xray.title}`}</h2>
        {error && <p className="error" role="alert">{t("xray.failed")}</p>}
        {xray && (
          <table className="xray-table">
            <thead><tr><th>{t("xray.step")}</th><th>{t("xray.change")}</th><th>{t("xray.total")}</th></tr></thead>
            <tbody>{xray.steps.map((s) => (
              <tr key={s.label}>
                <th scope="row">{s.label}<small>{s.source}{s.cap && ` · ${t("xray.cap")} ${s.cap}`}</small></th>
                <td>{sign(s.value)}</td><td><strong>{sign(s.running_total)}%</strong></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {xray && <p className="muted">{t("xray.foot")}</p>}
        <ExposureBand roleId={roleId} />
        <div className="dialog-actions"><button className="btn ink" onClick={onClose}>{t("tree.close")}</button></div>
      </div>
    </div>
  );
}
