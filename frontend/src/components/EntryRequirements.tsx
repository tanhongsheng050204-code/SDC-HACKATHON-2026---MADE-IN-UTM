import type { Requirements } from "../lib/api";
import { t, tf, tr } from "../lib/i18n";

// Up to a year and a half in months; longer in years, to the nearest half year.
export const years = (months: number) => (months < 18 ? tf("req.months", { n: months }) : tf("req.years", { n: Math.round(months / 6) / 2 }));

// What it takes to be hired beyond skills: a licence (law or official body) and the education MASCO 2020
// says the occupation group usually asks for. Skills alone never make a licensed job a short move.
export function EntryRequirements({ req, compact = false }: { req: Requirements; compact?: boolean }) {
  const licence = req.licence;
  if (compact) {
    return req.needs_licence && licence
      ? <span className="req-line"><span className="badge risk">{t("req.licenceBadge")}</span> {tr(licence.name)} · {years(licence.route_months)}</span>
      : <span className="muted req-line">{t("req.usually")}: {tr(req.usual)}</span>;
  }
  return (
    <div className={req.needs_licence ? "card req req-licence" : "card req"}>
      <h3>{t("req.title")}</h3>
      {licence && (
        <>
          <p><span className="badge risk">{t("req.licenceBadge")}</span> <strong>{tr(licence.name)}</strong></p>
          <p className="muted">{tf("req.law", { law: licence.law })}</p>
          {req.needs_licence && (
            <>
              <p><strong>{t("req.route")}</strong> {tr(licence.route)} ({years(licence.route_months)})</p>
              <p className="muted">{t("req.coursesNote")}</p>
            </>
          )}
          <ul className="sources">
            {licence.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </>
      )}
      <p>{t("req.usually")}: {tr(req.usual)}</p>
      <p className="source">
        <a href={req.usual_source.url} target="_blank" rel="noreferrer">{req.usual_source.title}</a>. {t("req.usualNote")}
      </p>
    </div>
  );
}
