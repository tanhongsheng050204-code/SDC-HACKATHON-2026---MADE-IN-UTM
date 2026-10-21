import { useState } from "react";
import { api, EmergingSource } from "../lib/api";
import { t, tf } from "../lib/i18n";

// "Find current openings": a live web search for current Malaysian ads for this role. Not reviewed
// and never scored; cached for the day and limited per person, as each search is a paid call.
export function Openings({ roleId, roleTitle, profileId }: { roleId: string; roleTitle: string; profileId: string }) {
  const [found, setFound] = useState<{ searched: string; sources: EmergingSource[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true); setError(null);
    try { setFound(await api.openings(roleId, profileId)); }
    catch (e) { setError(e instanceof Error ? e.message : t("op.failed")); }
    finally { setBusy(false); }
  }

  const ads = found?.sources.filter((s) => s.kind === "job_ad") ?? [];
  const pages = found?.sources.filter((s) => s.kind !== "job_ad") ?? [];
  return (
    <div className="openings">
      {!found && (
        <button className="btn quiet" disabled={busy} onClick={search}>{busy ? t("op.searching") : tf("op.find", { role: roleTitle })}</button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {found && (
        <div className="card openings-list" role="status">
          <p className="eyebrow">{tf("op.title", { date: found.searched })} <span className="badge gold">{t("em.unreviewed")}</span></p>
          {ads.length === 0 && <p className="muted">{t("op.none")}</p>}
          <ul className="citations">
            {ads.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer"><strong>{s.title || s.url}</strong> ↗</a>
                {s.employer && <span className="muted"> · {s.employer}</span>}
                {s.quote && <><br /><q>{s.quote}</q></>}
                {!s.grounded && <em className="source"> ({t("ev.notGrounded")})</em>}
              </li>
            ))}
          </ul>
          {pages.length > 0 && <p className="source">{tf("op.otherPages", { n: pages.length })}</p>}
          <p className="source">{t("op.note")}</p>
        </div>
      )}
    </div>
  );
}
