// Reports people can take to a meeting: a CSV for spreadsheets (with a BOM so Excel reads 中文 and
// BM correctly) and the browser's own print dialog for "Save as PDF". Nothing leaves the browser.
export type Cell = string | number | null | undefined;

export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    let s = v === null || v === undefined ? "" : String(v);
    // Text a person typed (a display name, a class name) must not run as a spreadsheet formula.
    if (typeof v === "string" && /^[=+@\t\r]|^-(?!\d+(\.\d+)?%?$)/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function downloadCsv(name: string, rows: Cell[][]) {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Everything stored about a profile, as one JSON file (data rights: Settings and My profile). */
export function downloadMyData(profileId: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = `laluan-my-data-${profileId.slice(0, 8)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
