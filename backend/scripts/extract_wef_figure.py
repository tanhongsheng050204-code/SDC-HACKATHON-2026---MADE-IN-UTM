"""Read net job growth 2025-2030 for every occupation in WEF Future of Jobs Report 2025, Figure 2.3.

The figure (page 21) prints no numbers: each occupation's net growth is a diamond marker on an
axis from -50% to +100%. This script reads the markers' positions from the PDF's vector drawing
and converts them to percentages using the chart's own gridlines (one every 25 points), so the
values are as exact as the chart allows (about +-0.5 points). It writes one CSV row per occupation.

Cross-check: press coverage quoting the report gives Data Entry Clerks -26%, Administrative
Assistants and Executive Secretaries -20%, Bank Tellers -31% and Postal Service Clerks -34%;
this script reads -25.9, -20.1, -31.0 and -33.7.

    pip install pymupdf      # only needed for this script
    python scripts/extract_wef_figure.py WEF_Future_of_Jobs_Report_2025.pdf data/raw/wef_foj2025_figure_2_3.csv

The PDF: https://reports.weforum.org/docs/WEF_Future_of_Jobs_Report_2025.pdf
"""

import collections
import csv
import sys
from pathlib import Path

import pymupdf

PAGE = 20          # zero-based: printed page 21
LABEL_TOP, LABEL_BOTTOM = 60, 700


def extract(pdf: Path) -> list[dict]:
    page = pymupdf.open(pdf)[PAGE]
    drawings = page.get_drawings()

    # Vertical gridlines: two columns of charts, each with a doubled zero line.
    grid = sorted({round((d["rect"].x0 + d["rect"].x1) / 2, 2) for d in drawings
                   if d["rect"].height > 600 and d["rect"].width < 1.5})
    columns = []
    for half in (lambda x: x < 340, lambda x: x >= 340):
        lines = [x for x in grid if half(x)]
        zero = max(lines, key=lambda x: sum(1 for d in drawings if d["rect"].height > 600
                                            and abs((d["rect"].x0 + d["rect"].x1) / 2 - x) < 0.05))
        step = (max(lines) - min(x for x in lines if x > zero - 20)) / 6  # gridlines from -25 to +125
        columns.append((zero, 25 / step))

    diamonds = [((d["rect"].x0 + d["rect"].x1) / 2, (d["rect"].y0 + d["rect"].y1) / 2) for d in drawings
                if 6 < d["rect"].width < 8 and 6 < d["rect"].height < 8 and len(d["items"]) == 4 and d["type"] == "f"]

    rows = []
    words = page.get_text("words")
    for (zero, unit), (lo, hi), side in zip(columns, [(0, 185), (260, 445)], (lambda x: x < 340, lambda x: x >= 340)):
        lines = collections.defaultdict(list)
        for w in words:
            if lo <= w[0] and w[2] <= hi and LABEL_TOP < w[1] < LABEL_BOTTOM:
                lines[round((w[1] + w[3]) / 2)].append(w)
        labels = [(y, " ".join(x[4] for x in sorted(ws, key=lambda x: x[0]))) for y, ws in lines.items()]
        for x, y in (p for p in diamonds if side(p[0])):
            _, label = min(labels, key=lambda line: abs(line[0] - y))
            label = label.lstrip("1234567").replace("ﬁ", "fi")  # footnote markers, ligatures
            rows.append({"occupation": label, "net_growth_pct": round((x - zero) * unit, 1)})
    return sorted(rows, key=lambda r: -r["net_growth_pct"])


if __name__ == "__main__":
    pdf, out = Path(sys.argv[1]), Path(sys.argv[2])
    rows = extract(pdf)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["occupation", "net_growth_pct"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"{len(rows)} occupations written to {out}")
