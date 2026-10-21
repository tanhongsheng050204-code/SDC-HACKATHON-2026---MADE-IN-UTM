"""Read the ILO's exposure score for every ISCO-08 occupation from Working Paper 140.

    pip install pypdf
    python scripts/extract_ilo_exposure.py path/to/WP140_web.pdf

Source: Gmyrek et al. (2025), "Generative AI and Jobs: A Refined Global Index of Occupational
Exposure", ILO Working Paper 140, Annex Table A1 (CC BY 4.0). The table lists each 4-digit
occupation with its exposure gradient, mean score and standard deviation; this script writes it to
data/raw/ilo_wp140_table_a1.csv so build_ai_exposure.py can use it without the PDF.
"""

import csv
import re
import sys
from pathlib import Path

from pypdf import PdfReader

DATA = Path(__file__).resolve().parents[1] / "data"
LABEL = r"Gradient [1-4]|Minimal\s+Exposure|Not Exposed"
ROW = re.compile(rf"({LABEL})\s+(\d{{4}})\s+(.+?)\s*(0(?:\.\d+)?|1(?:\.0+)?)\s+(0(?:\.\d+)?)(?=\s+(?:{LABEL})|\s*$)", re.S)


def rows(text: str) -> list[dict]:
    # Running page headers and the repeated column titles would otherwise glue onto a row.
    text = re.sub(r"\d+\s+ILO Working Paper 140", " ", text)
    text = re.sub(r"Exposure\s+4-digit code\s+Occupation Name\s+Mean\s+SD", " ", text)
    out = []
    for gradient, code, name, mean, sd in ROW.findall(text):
        out.append({"isco08": code, "occupation": " ".join(name.split()), "gradient": " ".join(gradient.split()),
                    "mean": float(mean), "sd": float(sd)})
    return out


def main(pdf_path: str) -> None:
    reader = PdfReader(pdf_path)
    pages = [p.extract_text() or "" for p in reader.pages]
    start = next(i for i, t in enumerate(pages) if "Table A1. ISCO-08 occupations by exposure gradient" in t)
    table = rows("\n".join(pages[start:]))
    codes = [r["isco08"] for r in table]
    if len(codes) != len(set(codes)) or len(table) < 400:
        raise SystemExit(f"Expected over 400 unique occupations, found {len(set(codes))} of {len(table)} rows")
    out = DATA / "raw" / "ilo_wp140_table_a1.csv"
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(table[0]))
        writer.writeheader()
        writer.writerows(table)
    print(f"Wrote {len(table)} occupations to {out}")


if __name__ == "__main__":
    main(sys.argv[1])
