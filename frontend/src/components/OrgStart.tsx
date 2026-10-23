import { useId, useState, type ReactNode } from "react";
import type { Scenario } from "../lib/api";
import { downloadCsv } from "../lib/exportFile";
import { t, tf, type StringKey } from "../lib/i18n";
import { SCENARIOS } from "../lib/labels";

// The first view of Company and Class: the sample as the main choice, your own CSV beside it with a
// tiny example table, the template and the privacy rule in one line. The full format text is one tap down.
export function OrgStart({ title, example, format, template, busy, error, onSample, onCsv }: {
  title: string; example: string[][]; format: string; template: string; busy: boolean; error: string | null;
  onSample: () => void; onCsv: (text: string) => void;
}) {
  const [paste, setPaste] = useState(false);
  const [csv, setCsv] = useState("");
  const id = useId();
  async function readFile(file: File | undefined) { if (file) onCsv(await file.text()); }
  return (
    <>
      <div className="org-start">
        <div className="org-sample">
          <h2>{title}</h2>
          <p>{t("org.sampleNote")}</p>
          <button className="btn" onClick={onSample} disabled={busy}>{busy ? t("wf.analysing") : t("org.show")}</button>
        </div>
        <div className="org-own">
          <h2>{t("org.own")}</h2>
          <table className="org-example">
            <thead><tr>{example[0].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{example.slice(1).map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
          </table>
          <div className="actions">
            <label className="btn ink file-btn">{t("wf.upload")}<input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} /></label>
            <button className="btn quiet" aria-expanded={paste} onClick={() => setPaste(!paste)}>{t("org.paste")}</button>
          </div>
          {paste && (
            <>
              <label className="sr-only" htmlFor={id}>{t("wf.csv")}</label>
              <textarea id={id} rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={example.map((r) => r.join(",")).join("\n")} />
              <button className="btn ink" disabled={busy || csv.trim().length < 10} onClick={() => onCsv(csv)}>{busy ? t("wf.analysing") : t("wf.analyse")}</button>
            </>
          )}
          <button className="link org-template" onClick={() => downloadCsv(template, example)}>⬇ {t("org.template")}</button>
          <p className="org-lock">🔒 {t("org.lock")}</p>
          <details className="org-format"><summary>{t("org.format")}</summary><p>{format}</p></details>
        </div>
      </div>
      {busy && <div className="progress" role="progressbar" aria-label={t("wf.analysing")}><span /></div>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

export const SPEEDS: Record<Scenario, StringKey> = { slow: "roles.speedSlow", baseline: "roles.speedBase", accelerated: "roles.speedFast" };

// One bar above a result: AI speed on the left, the actions on the right.
export function OrgBar({ scenario, onScenario, children }: { scenario: Scenario; onScenario?: (s: Scenario) => void; children: ReactNode }) {
  return (
    <div className="org-bar">
      {onScenario && (
        <>
          <span className="roles-label">{t("roles.speed")}</span>
          <div className="segmented roles-speed" role="radiogroup" aria-label={t("roles.speed")}>
            {SCENARIOS.map((s) => <button key={s.id} role="radio" aria-checked={scenario === s.id} onClick={() => onScenario(s.id)}>{t(SPEEDS[s.id])}</button>)}
          </div>
        </>
      )}
      <span className="org-spacer" />
      {children}
    </div>
  );
}

// A small menu from a button (no script needed to open or close it).
export function OrgMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="org-menu">
      <summary className="btn quiet sm">{label} ▾</summary>
      <div className="org-pop">{children}</div>
    </details>
  );
}

// "✓ 190 rows read · 2 skipped", with the skipped rows one tap down.
export function OrgChecked({ n, problems }: { n: number | string; problems: string[] }) {
  if (!problems.length) return <p className="org-checked">{tf("org.read", { n })}</p>;
  return (
    <details className="org-checked">
      <summary>{tf("org.read", { n })} · {tf("org.skippedN", { n: problems.length })}</summary>
      <p>{problems.join(" · ")}</p>
    </details>
  );
}
