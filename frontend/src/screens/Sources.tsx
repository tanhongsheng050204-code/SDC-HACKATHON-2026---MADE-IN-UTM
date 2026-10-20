import { useEffect, useState } from "react";
import { api, Snapshot } from "../lib/api";
import { monthsOld } from "../lib/format";
import { t } from "../lib/i18n";

// S9: every forecast snapshot the app has used, newest first, so anyone can trace a number back.
export function Sources({ onReviewKit }: { onReviewKit: () => void }) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api.snapshots().then(setSnapshots).catch(() => setError("Couldn't load the list of sources.")); }, []);

  return (
    <section>
      <div className="page-head"><h1>{t("h.sources")}</h1>
        <p className="muted">{t("note.sources")}</p></div>
      {error && <p className="error" role="alert">{error}</p>}
      {!snapshots && !error && <p className="muted">Loading…</p>}
      {snapshots?.length === 0 && <div className="empty-state"><p>No forecast has been imported yet.</p></div>}
      {snapshots && snapshots.length > 0 && (
        <div className="table-wrap card">
          <table className="heatmap sources-table">
            <thead><tr><th>Snapshot</th><th>Source</th><th>Published</th><th>Imported</th><th>Horizon</th><th>Roles</th><th>Status</th></tr></thead>
            <tbody>
              {snapshots.map((s, i) => (
                <tr key={s.snapshot_id}>
                  <th scope="row">{s.snapshot_id}{i === 0 && <> <span className="badge good">In use</span></>}</th>
                  <td>{s.source_url ? <a href={s.source_url} target="_blank" rel="noreferrer">{s.source}</a> : s.source}</td>
                  <td>{s.published}</td>
                  <td>{s.imported}</td>
                  <td>{s.horizon_year}</td>
                  <td>{s.signal_count}</td>
                  <td>
                    {s.illustrative ? <span className="badge risk">Illustrative</span>
                      : monthsOld(s.imported) > 12 ? <span className="badge gold">Over a year old</span>
                      : <span className="badge good">Cited</span>}
                    {s.reviewed_by && <small className="source"> Reviewed by {s.reviewed_by}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="card">
        <h2>Other data in Laluan</h2>
        <ul className="plain-list">
          <li><strong>Tasks:</strong> O*NET 30.0 task statements (US Department of Labor), labelled automate / assist / human by our team with AI help.</li>
          <li><strong>Skills per role:</strong> the Laluan team's list, checked against O*NET occupations where one exists.</li>
          <li><strong>Courses:</strong> the Laluan catalogue; each link shows the date we last opened it.</li>
          <li><strong>SDGs:</strong> UN Sustainable Development Goals and targets, with a written reason for every link.</li>
          <li><strong>Courses' prices and HRD Corp status:</strong> from each provider's own page, with the date we checked; ask the provider before enrolling.</li>
          <li><strong>Trend refresh:</strong> arXiv (or OpenAlex) paper counts and Hacker News “Who is hiring?” posts. Raw counts are kept in <code>backend/data/raw/</code>.</li>
        </ul>
      </div>
      <div className="card">
        <h2>Help us check it</h2>
        <p className="muted">Native speakers, teammates and career counsellors can check our translations, mark the test CVs and review the demo pathways in the review kit.</p>
        <button onClick={onReviewKit}>Open the review kit</button>
      </div>
    </section>
  );
}
