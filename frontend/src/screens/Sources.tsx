import { useEffect, useState } from "react";
import { api, Snapshot } from "../lib/api";
import { monthsOld } from "../lib/format";
import { t, tf } from "../lib/i18n";
import { PrivacyPanel } from "../components/PrivacyPanel";

// S9: every forecast snapshot the app has used, newest first, so anyone can trace a number back.
export function Sources({ onReviewKit, onAdmin }: { onReviewKit: () => void; onAdmin: () => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.snapshots().then(setSnapshots).catch(() => setError(t("src.loadFailed"))); }, []);

  return (
    <section>
      <div className="page-head"><h1>{t("h.sources")}</h1>
        <p className="muted">{t("note.sources")}</p></div>
      <PrivacyPanel />
      {error && <p className="error" role="alert">{error}</p>}
      {!snapshots && !error && <p className="muted">{t("a.loading")}</p>}
      {snapshots?.length === 0 && <div className="empty-state"><p>{t("src.none")}</p></div>}
      {snapshots && snapshots.length > 0 && (
        <div className="table-wrap card">
          <table className="heatmap sources-table">
            <thead><tr><th>{t("src.snapshot")}</th><th>{t("src.source")}</th><th>{t("src.published")}</th><th>{t("src.imported")}</th><th>{t("src.horizon")}</th><th>{t("src.roles")}</th><th>{t("src.status")}</th></tr></thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={s.snapshot_id}>
                  <th scope="row">{s.snapshot_id}{i === 0 && <> <span className="badge good">{t("src.inUse")}</span></>}</th>
                  <td>{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">{s.source}</a> : s.source}</td>
                  <td>{s.published}</td>
                  <td>{s.imported}</td>
                  <td>{s.horizon_year}</td>
                  <td>{s.signal_count}</td>
                  <td>
                    {s.illustrative ? <span className="badge risk">{t("src.illustrative")}</span>
                      : monthsOld(s.imported) > 12 ? <span className="badge gold">{t("src.old")}</span>
                      : <span className="badge good">{t("src.cited")}</span>}
                    {s.reviewed_by && <small className="source"> {tf("src.reviewedBy", { name: s.reviewed_by })}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2>{t("src.other")}</h2>
        <ul className="plain-list">
          <li><strong>{t("src.tasksT")}:</strong> {t("src.tasks")}</li>
          <li><strong>{t("src.skillsT")}:</strong> {t("src.skills")}</li>
          <li><strong>{t("src.coursesT")}:</strong> {t("src.courses")}</li>
          <li><strong>SDGs:</strong> {t("src.sdgs")}</li>
          <li><strong>{t("src.pricesT")}:</strong> {t("src.prices")}</li>
          <li><strong>{t("src.trendT")}:</strong> {t("src.trend1")} <a href="https://open.dosm.gov.my/data-catalogue/wages_occupation" target="_blank" rel="noreferrer">{t("src.opendosm")}</a> {t("src.trend2")} <code>backend/data/raw/</code>.</li>
          <li><strong>{t("src.evidenceT")}:</strong> {t("src.evidence")}</li>
          <li><strong>{t("em.title")}:</strong> {t("src.emerging")}</li>
          <li><strong>{t("day.title")}:</strong> {t("src.day")}</li>
          <li><strong>{t("src.exposureT")}:</strong> <a href="https://huggingface.co/datasets/Anthropic/EconomicIndex" target="_blank" rel="noreferrer">Anthropic Economic Index</a> (CC BY), OpenAI <a href="https://github.com/openai/GPTs-are-GPTs" target="_blank" rel="noreferrer">“GPTs are GPTs”</a> (MIT), <a href="https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure" target="_blank" rel="noreferrer">ILO Working Paper 140</a> (CC BY 4.0). {t("src.exposure")}</li>
          <li><strong>{t("src.mycolT")}:</strong> <a href="https://www.talentcorp.com.my/mycol/" target="_blank" rel="noreferrer">MyCOL 2024/2025</a> (TalentCorp). {t("src.mycol")}</li>
          <li><strong>{t("src.postingsT")}:</strong> <a href="https://freehire.me" target="_blank" rel="noreferrer">freehire.me</a>. {t("src.postings")}</li>
          <li><strong>{t("src.payT")}:</strong> {t("src.pay1")} <a href="https://storage.dosm.gov.my/labour/salaries_wages_2025.pdf" target="_blank" rel="noreferrer">DOSM Salaries &amp; Wages Survey Report 2025</a> {t("src.pay2")}</li>
        </ul>
      </div>
      <div className="card">
        <h2>{t("src.help")}</h2>
        <p className="muted">{t("src.helpSub")}</p>
        <button onClick={onReviewKit}>{t("src.openKit")}</button>
        <button className="btn quiet" onClick={onAdmin}>Admin: review new data</button>
      </div>
    </section>
  );
}
