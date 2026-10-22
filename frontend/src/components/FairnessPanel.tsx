import { useEffect, useState } from "react";
import { api, Fairness } from "../lib/api";
import { t, tf } from "../lib/i18n";

// The fairness check, run by the server on the forecast in use: the same results whatever name
// a person gives, and no demographic fields collected at all.
export function FairnessPanel() {
  const [data, setData] = useState<Fairness | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.fairness().then(setData).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  return (
    <section className="card fairness" aria-labelledby="fair-h">
      <h2 id="fair-h">{t("fair.title")}</h2>
      {!data ? <p className="muted">{t("a.loading")}</p> : (
        <>
          <p><span className={`badge ${data.passed ? "good" : "risk"}`}>{data.passed ? t("fair.passed") : t("fair.failed")}</span>{" "}
            {tf("fair.summary", { checks: data.checks, profiles: data.profiles, names: data.names.length, cvs: data.cvs })}</p>
          <p className="muted">{t("fair.method")}</p>
          <p className="muted">{tf("fair.names", { list: data.names.join(" · ") })}</p>
          <p className="muted">{tf("fair.notCollected", { list: data.not_collected.join(", ") })}</p>
          {data.failures.length > 0 && <ul className="error">{data.failures.map((f) => <li key={f}>{f}</li>)}</ul>}
        </>
      )}
    </section>
  );
}
