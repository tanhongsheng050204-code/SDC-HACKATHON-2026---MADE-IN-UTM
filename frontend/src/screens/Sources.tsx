import { useEffect, useState } from "react";
import { api, Profile, Snapshot } from "../lib/api";
import { downloadMyData } from "../lib/exportFile";
import { monthsOld, shortDate } from "../lib/format";
import { t, tf, type StringKey } from "../lib/i18n";
import { PrivacyPanel } from "../components/PrivacyPanel";
import { FairnessPanel } from "../components/FairnessPanel";
import { Tabs } from "../components/Tabs";

type Tab = "data" | "sources";
type Source = { title: string; by: string; what: string; url?: string };

// Every source Laluan uses, grouped by what it powers. Titles and the "what" lines are translated;
// publishers stay as they publish themselves.
function groups(): { title: StringKey; items: Source[] }[] {
  return [
    { title: "src.gJobs", items: [
      { title: t("src.forecastT"), by: "World Economic Forum · Future of Jobs Report 2025", what: t("src.forecastWhat"), url: "https://www.weforum.org/publications/the-future-of-jobs-report-2025/" },
      { title: t("src.trendT"), by: "arXiv / OpenAlex · Hacker News · OpenDOSM", what: `${t("src.trend1")} ${t("src.opendosm")} ${t("src.trend2")} backend/data/raw/.`, url: "https://open.dosm.gov.my/data-catalogue/wages_occupation" },
      { title: t("src.myresearchT"), by: "OpenAlex · papers from Malaysian institutions", what: t("src.myresearch"), url: "https://openalex.org" },
      { title: t("src.attentionT"), by: "Stack Overflow · GitHub · npm · PyPI", what: t("src.attention"), url: "https://api.stackexchange.com/docs" },
      { title: t("src.labourT"), by: "OpenDOSM · Labour Force Survey, Malaysia", what: t("src.labour"), url: "https://open.dosm.gov.my/data-catalogue?id=lfs_month" },
      { title: t("src.sectorT"), by: "OpenDOSM · employment by sector", what: t("src.sector"), url: "https://open.dosm.gov.my/data-catalogue?id=employment_sector" },
      { title: t("src.cpiT"), by: "OpenDOSM · consumer price index", what: t("src.cpi"), url: "https://open.dosm.gov.my/data-catalogue?id=cpi_headline" },
      { title: t("src.mycolT"), by: "TalentCorp · MyCOL 2024/2025", what: t("src.mycol"), url: "https://www.talentcorp.com.my/mycol/" },
      { title: t("src.postingsT"), by: "freehire.me", what: t("src.postings"), url: "https://freehire.me" },
    ] },
    { title: "src.gSkills", items: [
      { title: t("src.tasksT"), by: "O*NET 30.0 · US Department of Labor", what: t("src.tasks"), url: "https://www.onetcenter.org/database.html" },
      { title: t("src.skillsT"), by: "Laluan", what: t("src.skills") },
      { title: t("src.evidenceT"), by: "Gemini + Google Search · named reviewer", what: t("src.evidence") },
      { title: t("em.title"), by: "Gemini + Google Search · named reviewer", what: t("src.emerging") },
      { title: t("day.title"), by: "Gemini · Laluan data", what: t("src.day") },
    ] },
    { title: "src.gCourses", items: [
      { title: t("src.coursesT"), by: "Laluan", what: t("src.courses") },
      { title: t("src.pricesT"), by: "Course providers · HRD Corp", what: t("src.prices") },
      { title: t("src.payT"), by: "DOSM · Salaries & Wages Survey Report 2025", what: `${t("src.pay1")} DOSM Salaries & Wages Survey Report 2025 ${t("src.pay2")}`, url: "https://storage.dosm.gov.my/labour/salaries_wages_2025.pdf" },
    ] },
    { title: "src.gAi", items: [
      { title: "Anthropic Economic Index", by: "Anthropic · CC BY", what: t("src.exposure"), url: "https://huggingface.co/datasets/Anthropic/EconomicIndex" },
      { title: "“GPTs are GPTs”", by: "OpenAI · MIT", what: t("src.exposure"), url: "https://github.com/openai/GPTs-are-GPTs" },
      { title: "Generative AI and jobs (WP 140)", by: "International Labour Organization · CC BY 4.0", what: t("src.exposure"), url: "https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure" },
    ] },
    { title: "src.gImpact", items: [
      { title: "SDGs", by: "United Nations", what: t("src.sdgs"), url: "https://sdgs.un.org/goals" },
    ] },
  ];
}

// S9: "Your data" as a privacy label, and every source behind the numbers: the forecast in use
// (older snapshots kept so any number can be traced back), the fairness check and a searchable list.
export function Sources({ profile, onDelete, onReviewKit, onAdmin }: {
  profile: Profile | null; onDelete: () => void; onReviewKit: () => void; onAdmin: () => void;
}) {
  const [tab, setTab] = useState<Tab>("data");
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [downloadFailed, setDownloadFailed] = useState(false);
  useEffect(() => { api.snapshots().then(setSnapshots).catch(() => setError(t("src.loadFailed"))); }, []);

  async function download() {
    if (!profile) return;
    setDownloadFailed(false);
    try { downloadMyData(profile.id, await api.exportData(profile.id)); } catch { setDownloadFailed(true); }
  }

  const query = q.trim().toLowerCase();
  const shown = groups().map((g) => ({ ...g, items: g.items.filter((i) => !query
    || `${t(g.title)} ${i.title} ${i.by} ${i.what}`.toLowerCase().includes(query)) })).filter((g) => g.items.length > 0);
  const [now, ...earlier] = snapshots ?? [];
  const status = (s: Snapshot) => s.illustrative ? <span className="badge risk">{t("src.illustrative")}</span>
    : monthsOld(s.imported) > 12 ? <span className="badge gold">{t("src.old")}</span>
    : <span className="badge good">{t("src.cited")}</span>;

  return (
    <section className="sources-page">
      <div className="page-head"><h1>{t("h.sources")}</h1>
        <p className="sources-promise">{t("priv.promise")}</p></div>
      <Tabs id="sources" label={t("h.sources")} tabs={[{ id: "data", label: t("priv.title") }, { id: "sources", label: t("src.tabSources") }]} value={tab} onChange={setTab}>
        {tab === "data" && (
          <PrivacyPanel actions={profile && (
            <>
              <div className="actions">
                <button className="btn" onClick={download}>⬇ {t("prof.download")}</button>
                <button className="btn danger-text" onClick={onDelete}>{t("prof.delete")}</button>
              </div>
              {downloadFailed && <p className="error" role="alert">{t("prof.downloadFailed")}</p>}
            </>
          )} />
        )}
        {tab === "sources" && (
          <>
            {error && <p className="error" role="alert">{error}</p>}
            {!snapshots && !error && <p className="muted">{t("a.loading")}</p>}
            {snapshots?.length === 0 && <div className="empty-state"><p>{t("src.none")}</p></div>}
            {now && (
              <div className="sources-now">
                <span className="sources-now-k">● {t("src.inUseNow")}</span>
                <h2>{now.source_url ? <a href={now.source_url} target="_blank" rel="noreferrer">{now.source}</a> : now.source}</h2>
                <p className="sources-facts">
                  <span>{tf("src.importedOn", { date: shortDate(now.imported) })}</span>
                  <span>{tf("src.forecastsTo", { year: now.horizon_year })}</span>
                  <span>{tf("src.rolesN", { n: now.signal_count })}</span>
                  {status(now)}
                  {now.reviewed_by && <span>{tf("src.reviewedBy", { name: now.reviewed_by })}</span>}
                </p>
                {earlier.length > 0 && (
                  <details>
                    <summary>{tf("src.earlier", { n: earlier.length })}</summary>
                    <div className="table-wrap">
                      <table className="sources-table">
                        <thead><tr><th>{t("src.snapshot")}</th><th>{t("src.published")}</th><th>{t("src.imported")}</th><th>{t("src.horizon")}</th><th>{t("src.roles")}</th><th>{t("src.status")}</th></tr></thead>
                        <tbody>{earlier.map((s) => (
                          <tr key={s.snapshot_id}><th scope="row">{s.snapshot_id}</th><td>{s.published}</td><td>{s.imported}</td><td>{s.horizon_year}</td><td>{s.signal_count}</td>
                            <td>{status(s)}{s.reviewed_by && <small className="source"> {tf("src.reviewedBy", { name: s.reviewed_by })}</small>}</td></tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )}
            <FairnessPanel />
            <input type="search" className="sources-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("src.search")} aria-label={t("src.search")} />
            {shown.map((g) => (
              <section key={g.title} className="sources-group" aria-label={t(g.title)}>
                <h3>{t(g.title)}</h3>
                <ul className="sources-list">
                  {g.items.map((i) => (
                    <li key={`${g.title}-${i.title}`}>
                      <strong>{i.title}</strong>
                      <span className="sources-what">{i.what.charAt(0).toUpperCase() + i.what.slice(1)}</span>
                      <span className="sources-by">{i.by}</span>
                      {i.url && <a href={i.url} target="_blank" rel="noreferrer">{t("src.open")} ↗</a>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {shown.length === 0 && <p className="muted">{tf("src.noMatch", { q: q.trim() })}</p>}
            <p className="sources-foot">{t("src.reviewers")}
              <button className="link" onClick={onReviewKit}>{t("src.kitShort")}</button> ·
              <button className="link" onClick={onAdmin}>Admin</button></p>
          </>
        )}
      </Tabs>
    </section>
  );
}
