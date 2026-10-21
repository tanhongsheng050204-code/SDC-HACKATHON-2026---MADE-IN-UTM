import { useEffect, useState } from "react";
import { api, Scenario, Xray } from "../lib/api";
import { t, tr, tv, type StringKey } from "../lib/i18n";

// How one forecast number is built: baseline, trend adjustments, scenario swing, year scaling.
// The step's label in the chosen language; the adoption step names the scenario or "your own setting".
function stepLabel(s: Xray["steps"][number]) {
  if (s.key === "adoption") {
    const which = s.vars?.own ? t("xr.own") : t(`sc.${String(s.vars?.scenario)}` as StringKey);
    return tv("xr.adoption", { x: String(s.vars?.x ?? ""), which }, s.label);
  }
  return tv(`xr.${s.key}`, s.vars, s.label);
}

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
        <h2 id="xray-title">{t("xray.title")}{xray && `: ${tr(xray.title)}`}</h2>
        {error && <p className="error" role="alert">{t("xray.failed")}</p>}
        {xray && (
          <table className="xray-table">
            <thead><tr><th>{t("xray.step")}</th><th>{t("xray.change")}</th><th>{t("xray.total")}</th></tr></thead>
            <tbody>{xray.steps.map((s) => (
              <tr key={s.label}>
                <th scope="row">{stepLabel(s)}<small>{s.vars?.refreshed === false ? t("xr.noRefresh") : s.source}{s.cap && ` · ${t("xray.cap")} ${s.cap}`}</small></th>
                <td>{sign(s.value)}</td><td><strong>{sign(s.running_total)}%</strong></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {xray && <p className="muted">{t("xray.foot")}</p>}
        <div className="dialog-actions"><button className="btn ink" onClick={onClose}>{t("tree.close")}</button></div>
      </div>
    </div>
  );
}
