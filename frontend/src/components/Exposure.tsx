import { useEffect, useState } from "react";
import { api, RoleExposure } from "../lib/api";
import { t } from "../lib/i18n";

// "Where experts disagree": three published AI-exposure studies next to Laluan's own estimate.
// Studies use different scales, so each is shown as a percentile among all occupations it covers,
// and compared with Laluan by rank among Laluan's roles. Display only: rankings don't change.

function useExposure(roleId: string) {
  const [data, setData] = useState<RoleExposure | null>(null);
  useEffect(() => { setData(null); api.exposure(roleId).then(setData).catch(() => setData(null)); }, [roleId]);
  return data;
}

export function ExposureLine({ roleId, onOpen }: { roleId: string; onOpen: () => void }) {
  const data = useExposure(roleId);
  if (!data?.band) return null;
  return (
    <p className="exposure-line">
      <strong>{t("exp.short")}</strong> {t("exp.moreThan")} {Math.round(data.band.low)}–{Math.round(data.band.high)}% {t("exp.ofOccupations")}
      {data.flag && <span className="badge gold">{t("exp.flagShort")}</span>}
      {" "}<button className="link" onClick={onOpen}>{t("exp.see")}</button>
    </p>
  );
}

export function ExposureBand({ roleId }: { roleId: string }) {
  const data = useExposure(roleId);
  if (!data) return null;
  return (
    <section className="exposure" aria-labelledby="exp-title">
      <h3 id="exp-title">{t("exp.title")}</h3>
      {data.sources.length === 0 ? <p className="muted">{data.note}</p> : (
        <>
          <p className="muted">{t("exp.intro")}</p>
          <ul className="exp-list">
            {data.sources.map((s) => (
              <li key={s.id}>
                <div className="row-between"><span><a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>
                  <strong>{Math.round(s.percentile)}%</strong></div>
                <span className="exp-bar" aria-hidden="true"><span style={{ left: `${s.percentile}%` }} /></span>
                <small className="source">{s.measure}. {s.occupation} ({s.code}){s.gradient && ` · ${s.gradient}`} · {t("exp.rank")} #{s.rank} {t("exp.of")} {data.compared} · {s.licence}</small>
              </li>
            ))}
          </ul>
          <p>{t("exp.laluan")} <strong>#{data.laluan.rank} {t("exp.of")} {data.compared}</strong>; {t("exp.studies")} #{data.published_ranks!.low}–#{data.published_ranks!.high}. <small className="muted">{t("exp.rankNote")}</small></p>
          {data.flag && <p className="banner warning">{t("exp.flag")}</p>}
          {data.note && <p className="source">{t("exp.mapping")} {data.note}</p>}
        </>
      )}
      {data.malaysia && (
        <p className="exp-malaysia">
          <strong>{t("exp.mys")}</strong> {data.malaysia.name}: {data.malaysia.mys_pct}% {t("exp.mysOf")} ({t("exp.world")} {data.malaysia.global_pct}%).
          {data.malaysia.automation_pct !== null && ` ${t("exp.mysAuto")} ${Math.round(data.malaysia.automation_pct)}% / ${Math.round(data.malaysia.augmentation_pct ?? 0)}%.`}
          <small className="source"> Anthropic Economic Index, {data.malaysia.month} (CC BY).</small>
        </p>
      )}
      <p className="source">{t("exp.foot")}</p>
    </section>
  );
}
