import { useEffect, useState } from "react";
import { api, RegionSdg as RegionData } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";
import { SdgTile } from "./Sdgs";

// SDG contribution for a region: across Malaysia, how many Laluan users are heading for roles that
// serve each goal. Counts only; groups under 3 show as "fewer than 3".
export function RegionSdg() {
  const [data, setData] = useState<RegionData | null>(null);
  useEffect(() => { api.sdgRegion().then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  const count = (n: number | null) => (n === null ? t("region.few") : String(n));
  return (
    <section className="card region-sdg" aria-labelledby="region-h">
      <h2 id="region-h">{t("region.title")}</h2>
      <p className="muted">{data.people === null && data.goals.length === 0 ? t("region.empty") : tf("region.sub", { n: count(data.people) })}</p>
      {data.goals.length > 0 && (
        <ul className="region-goals">
          {data.goals.map((g) => (
            <li key={g.sdg}>
              <SdgTile sdg={{ number: g.sdg, name: g.name, colour: g.colour }} small />
              <span><strong>SDG {g.sdg} {tr(g.name)}</strong><small className="muted">{g.roles.map(tr).join(", ")}</small></span>
              <strong className="region-n">{count(g.people)}</strong>
            </li>
          ))}
        </ul>
      )}
      <p className="source">{t("region.note")}</p>
    </section>
  );
}
