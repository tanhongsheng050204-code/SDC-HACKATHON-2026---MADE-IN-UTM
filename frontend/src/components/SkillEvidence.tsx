import type { Citation, RoleEvidence, SkillEvidence } from "../lib/api";
import { t } from "../lib/i18n";

const ORDER = { confirmed: 0, single: 1, none: 2 } as const;

export function EvidenceBadge({ e }: { e: SkillEvidence }) {
  const cls = e.status === "confirmed" ? "badge good" : e.status === "single" ? "badge gold" : "badge";
  const label = e.status === "confirmed" ? t("ev.confirmed") : e.status === "single" ? t("ev.single") : t("ev.none");
  return <span className={cls}>{label}{e.job_ads > 0 && ` · ${e.job_ads} ${t("ev.ads")}`}</span>;
}

export function Citations({ items }: { items: Citation[] }) {
  return (
    <ul className="citations">
      {items.map((c) => (
        <li key={c.url}>
          <q>{c.quote}</q>
          <span className="source"> · <span className="badge">{c.kind === "job_ad" ? t("ev.jobAd") : t("ev.web")}</span>{" "}
            <a href={c.url} target="_blank" rel="noreferrer">{c.employer || c.title || new URL(c.url).hostname} ↗</a>
            {!c.grounded && <em> ({t("ev.notGrounded")})</em>}</span>
        </li>
      ))}
    </ul>
  );
}

// Role page: every skill of the role with its job-ad status and, on opening, the quotes and links.
export function EvidenceList({ evidence, names, added }: { evidence: RoleEvidence; names: Record<string, string>; added: Set<string> }) {
  const rows = Object.entries(evidence.skills).sort(([, a], [, b]) => ORDER[a.status] - ORDER[b.status]);
  return (
    <section className="card evidence">
      <h2>{t("ev.title")}</h2>
      <p className="muted">{t("ev.intro")}</p>
      {rows.map(([id, e]) => (
        <details key={id} className="evidence-row">
          <summary><strong>{names[id] ?? id}</strong> <EvidenceBadge e={e} />{added.has(id) && <span className="badge good">{t("ev.added")}</span>}</summary>
          {e.citations.length > 0 ? <Citations items={e.citations} /> : <p className="muted">{t("ev.none")}</p>}
        </details>
      ))}
      <p className="source">{t("ev.reviewed").replace("{date}", evidence.searched).replace("{name}", evidence.reviewed_by ?? "—")}</p>
    </section>
  );
}
