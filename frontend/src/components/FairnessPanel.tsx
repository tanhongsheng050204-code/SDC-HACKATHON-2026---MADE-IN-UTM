import { useEffect, useState } from "react";
import { api, Fairness } from "../lib/api";
import { t, tf } from "../lib/i18n";

// The fairness check, run by the server on the forecast in use: the same results whatever name
// a person gives, and no demographic fields collected at all. One line that opens to the details.
export function FairnessPanel() {
  const [data, setData] = useState<Fairness | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.fairness().then(setData).catch(() => setFailed(true)); }, []);
  if (failed || !data) return null;
  return (
    <details className="fairness-line">
      <summary className={data.passed ? "" : "failed"}>{data.passed ? `✓ ${t("fair.oneLine")}` : `✕ ${t("fair.oneLineFailed")}`}</summary>
      <p>{tf("fair.summary", { checks: data.checks, profiles: data.profiles, names: data.names.length, cvs: data.cvs })}</p>
      <p className="muted">{t("fair.method")}</p>
      <p className="muted">{tf("fair.names", { list: data.names.join(" · ") })}</p>
      <p className="muted">{tf("fair.notCollected", { list: data.not_collected.join(", ") })}</p>
      {data.failures.length > 0 && <ul className="error">{data.failures.map((f) => <li key={f}>{f}</li>)}</ul>}
    </details>
  );
}
