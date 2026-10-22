import { Cell, downloadCsv } from "../lib/exportFile";
import { t } from "../lib/i18n";

// "Download CSV" and "Print or save as PDF" for a report. The rows are built only when clicked.
export function ExportBar({ name, rows, print = true }: { name: string; rows: () => Cell[][]; print?: boolean }) {
  return (
    <div className="export-bar">
      <button className="btn quiet sm" onClick={() => downloadCsv(name, rows())}>{t("exp.csv")}</button>
      {print && <button className="btn quiet sm" onClick={() => window.print()}>{t("exp.print")}</button>}
    </div>
  );
}
