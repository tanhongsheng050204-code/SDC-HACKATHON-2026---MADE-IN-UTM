import type { AdQuote, Requirements } from "../lib/api";
import { t, tf, tr, type StringKey } from "../lib/i18n";

// Up to a year and a half in months; longer in years, to the nearest half year.
export const years = (months: number) => (months < 18 ? tf("req.months", { n: months }) : tf("req.years", { n: Math.round(months / 6) / 2 }));

const level = (id: string) => t(`req.lvl.${id}` as StringKey);

/** The qualification in one line: the licence route, what most job ads ask for, or the MASCO default. */
export function qualificationText(req: Requirements, short = false): string {
  const q = req.qualification;
  if (q.basis !== "ads") return tr(q.text);
  const fields = q.fields.slice(0, short ? 2 : 4).map((f) => tr(f));
  return fields.length ? tf("req.levelIn", { level: level(q.level), fields: fields.join(", ") }) : level(q.level);
}

function Quotes({ items }: { items: AdQuote[] }) {
  return (
    <ul className="sources">
      {items.map((s) => (
        <li key={s.url + s.quote}>“{s.quote}” <a href={s.url} target="_blank" rel="noreferrer">{s.title}{s.company ? `, ${s.company}` : ""}</a></li>
      ))}
    </ul>
  );
}

// What it takes to be hired beyond skills: a licence (law or official body), the qualification, and
// certificates Malaysian employers name in their ads. Skills alone never make a licensed job a short move.
export function EntryRequirements({ req, compact = false }: { req: Requirements; compact?: boolean }) {
  const licence = req.licence;
  if (compact) {
    return req.needs_licence && licence
      ? <span className="req-line"><span className="badge risk">{t("req.licenceBadge")}</span> {tr(licence.name)} · {years(licence.route_months)}</span>
      : <span className="muted req-line">{t("req.usually")}: {qualificationText(req, true)}</span>;
  }
  const q = req.qualification;
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
      <p><strong>{t("req.qualification")}</strong> {qualificationText(req)}</p>
      {q.basis === "ads" && <p className="muted">{tf("req.fromAds", { n: q.level_ads, total: q.ads_with_level })}</p>}
      {q.basis === "masco" && (
        <p className="source"><a href={req.usual_source.url} target="_blank" rel="noreferrer">{req.usual_source.title}</a>. {t("req.usualNote")}</p>
      )}
      {req.certifications.length > 0 && (
        <>
          <p><strong>{t("req.certs")}</strong></p>
          <ul className="req-certs">
            {req.certifications.map((c) => (
              <li key={c.name}>
                <details><summary>{c.name} · {tf("req.inAds", { n: c.ads, total: req.ads?.ads_read ?? c.ads })}</summary><Quotes items={c.sources} /></details>
              </li>
            ))}
          </ul>
        </>
      )}
      {req.ads && req.ads.sources.length > 0 && (
        <details>
          <summary className="muted">{tf("req.adsShown", { n: req.ads.ads_read, date: req.ads.searched })}</summary>
          <Quotes items={req.ads.sources} />
          {req.ads.source && <p className="source"><a href={req.ads.source.url} target="_blank" rel="noreferrer">{req.ads.source.title}</a></p>}
        </details>
      )}
      {!req.ads && q.basis !== "masco" && <p className="muted">{t("req.noAds")}</p>}
    </div>
  );
}
