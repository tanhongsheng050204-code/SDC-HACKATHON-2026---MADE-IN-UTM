import { useEffect, useState } from "react";
import { api, JobPostings as PostingsData } from "../lib/api";
import { jobLinks } from "../lib/format";
import { t } from "../lib/i18n";

// Open jobs in Malaysia for this role, from freehire.me, each linking to the original posting.
// When freehire is unreachable, only the plain job-board searches are shown.
export function JobPostings({ roleId, title }: { roleId: string; title: string }) {
  const [data, setData] = useState<PostingsData | null>(null);
  useEffect(() => {
    setData(null);
    api.postings(roleId).then(setData).catch(() => setData(null));
  }, [roleId]);

  return (
    <div className="card postings">
      <div className="row-between">
        <h2>{t("open.title")}</h2>
        {data?.available && data.mentions !== null && (
          <span className="badge">{data.mentions.toLocaleString()} {t("open.mention")}</span>
        )}
      </div>
      {data?.available && data.openings.length > 0 && (
        <ul className="postings-list">
          {data.openings.map((o) => (
            <li key={o.url}>
              <a href={o.url} target="_blank" rel="noreferrer">{o.title} ↗</a>
              <span className="muted">{[o.company, o.location, o.posted].filter(Boolean).join(" · ")}</span>
            </li>
          ))}
        </ul>
      )}
      {data?.available && data.openings.length === 0 && <p className="muted">{t("open.none")}</p>}
      <div className="job-links"><span className="muted">{t("open.more")}</span>
        {data?.available && <a href={data.search_url} target="_blank" rel="noreferrer">freehire.me ↗</a>}
        {jobLinks(title).map((l) => <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>
      {data?.available && <p className="source">{t("open.source")} {data.checked}.</p>}
    </div>
  );
}
