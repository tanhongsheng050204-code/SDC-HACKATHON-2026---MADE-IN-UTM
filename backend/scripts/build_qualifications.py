"""Find what Malaysian employers ask for in each role beyond skills: qualification level, field of study
and certifications, read from real job ads (DECISIONS #44).

    python scripts/build_qualifications.py           # every role -> data/raw/qualifications_draft.json
    python scripts/build_qualifications.py --apply   # draft -> data/entry_requirements.json "roles"

Ads come from freehire.me through app/evidence/ads.py (the same source and search terms as a role
page's openings and the skill evidence): the newest MAX_ADS Malaysian postings whose title names the role, each with
its original link (mostly JobStreet). No language model is used: the education sentence and known
certificate names are found in each ad's own text by fixed rules (extract() below), so every quote
and link is real. A first attempt asked Gemini with Google Search for ads; none of its 8 links opened
or came from Google's sources (REVIEW_LOG), which is why this reads the ads directly.

Per role, from the ads that state an education level:
  level           the minimum level at least half of them ask for (SPM, SKM, certificate, diploma, degree)
  fields          fields of study named by MIN_MENTIONS+ ads
  certifications  certificates from CERTS named by MIN_MENTIONS+ ads and MIN_CERT_SHARE of the ads read
A role with fewer than MIN_ADS such ads keeps its MASCO 2020 group default. A licensed role shows its
licence route as the qualification (entry_requirements.json "licences"); its ads stay as evidence.
"""

import argparse
import datetime as dt
import json
import re
import sys
from collections import Counter
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.evidence import ads  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "data"
DRAFT = DATA / "raw" / "qualifications_draft.json"
REQS = DATA / "entry_requirements.json"
MAX_ADS = 60
MIN_ADS = 5        # ads stating a level before a role gets its own qualification line
MIN_MENTIONS = 2   # ads that must name a field or certificate before it is shown
MIN_CERT_SHARE = 0.1  # ...and a certificate at least this share of the ads read
MAJORITY = 0.5     # the top level must be asked for by at least half the ads that state one
# Lowest first: an ad asking for "Diploma/Degree" asks for at least a diploma.
LEVELS = [("SPM", r"\b(spm|stpm|svm|o[- ]?levels?|form (5|five))\b"),
          ("SKM", r"\b(skm|sijil kemahiran malaysia|malaysian skills? certificate)\b"),
          ("certificate", r"\bcertificate (in|of) [a-z]"),
          ("diploma", r"\b(diploma|dkm)\b"),
          ("degree", r"\b(degree|bachelor'?s?|ijazah|b\.?sc|bba)\b"),
          ("master's", r"\b(master'?s?|msc|mba)\b")]
FIELD_AFTER = re.compile(r"\b(?:diploma|degree|bachelor'?s?(?: degree)?|ijazah|certificate)\s+(?:holder\s+)?(?:in|of)\s+"
                         r"([a-z&/,'\- ]{3,90}?)(?=[.;:()]|\bor equivalent\b|\bor related\b|\bwith\b|\bfrom\b|\bis\b|\bwill\b|$)")
FIELD_DROP = {"any field", "related field", "related fields", "equivalent", "relevant field", "a related field",
              "any discipline", "related discipline", "field", "the field", "a relevant field"}

# Certificates employers name in Malaysian ads, with how they are written. Only these are counted.
CERTS = {
    "LCCI": r"\blcci\b", "ACCA": r"\bacca\b", "CAT (ACCA)": r"\bcat\b(?= |/|,|\))", "CIMA": r"\bcima\b",
    "MIA membership": r"\bmia\b", "CPA": r"certified public accountant|\bcpa (australia|qualif|member|certif)|\bcpa,? acca|acca,? cpa",
    "CompTIA Security+": r"security\+", "CompTIA A+ / Network+": r"\b(a\+|network\+)",
    "CCNA": r"\bccna\b", "CEH": r"\bceh\b", "CISSP": r"\bcissp\b", "CISA / CISM": r"\b(cisa|cism)\b",
    "AWS certification": r"\baws certified\b|\baws certification", "Microsoft Azure certification": r"\bazure (certification|certified)|\baz-\d{3}\b",
    "Google Cloud certification": r"google cloud (certification|certified)", "ITIL": r"\bitil\b", "PMP": r"\bpmp\b",
    "Google Analytics / Ads certification": r"google (analytics|ads) (certification|certified)",
    "CIDB Green Card": r"\bcidb\b|green card|kad hijau", "NIOSH safety passport": r"\bniosh\b",
    "Wireman certificate (PW2/PW4)": r"\bpw ?[24]\b|\bwireman\b|\bpendawai\b",
    "Chargeman certificate": r"\bchargeman\b|penjaga jentera", "IPC-A-610 / J-STD-001": r"\bipc-?a-?610\b|j-std-001",
    "Six Sigma": r"\bsix sigma\b|\blean six\b", "Forklift licence": r"\bforklift licen[cs]e\b|\blesen forklift\b",
    "Driving licence": r"\b(driving licen[cs]e|lesen memandu|class d licen[cs]e|gdl)\b",
    "Food handler certificate / typhoid injection": r"\bfood handl|\btyphoid\b|suntikan tifoid",
    "Annual Practising Certificate (APC)": r"\bannual practi[cs]ing certificate\b|\bapc\b",
    "Post-basic nursing certificate": r"\bpost[- ]basic\b", "BLS / CPR": r"\bbls\b|\bcpr\b|basic life support",
    "Autodesk certification (AutoCAD / Revit)": r"autodesk certified|autocad certif|revit certif",
    "IBBM / AICB banking certificate": r"\b(ibbm|aicb)\b", "FIMM": r"\bfimm\b",
    "VTO / PPL instructor certificate": r"\bvto\b|\bppl\b|vocational training officer|pegawai latihan vokasional",
    "First aid certificate": r"\bfirst aid\b",
}


def extract(description: str) -> dict:
    """The education sentence, its minimum level and fields, and the certificates the ad names."""
    sentences = ads.sentences(description)
    level, quote, fields = None, None, []
    for s in sentences:
        low = s.lower()
        found = [i for i, (_, rx) in enumerate(LEVELS) if re.search(rx, low)]
        if not found or len(s) > 300:
            continue
        level, quote = LEVELS[min(found)][0], s
        for m in FIELD_AFTER.finditer(low):
            for f in re.split(r"/|,|\bor\b|\band\b|&", m.group(1)):
                f = re.sub(r"^(the|a|an)\s+", "", f.strip(" '-"))
                if 3 <= len(f) <= 40 and f not in FIELD_DROP:
                    fields.append(f)
        break  # the first education sentence is the requirement; later ones are usually "preferred"
    certs = {}
    for name, rx in CERTS.items():
        hit = next((s for s in sentences if re.search(rx, s.lower()) and len(s) <= 300), None)
        if hit:
            certs[name] = hit
    return {"level": level, "quote": quote, "fields": sorted(set(fields)), "certifications": certs}


def search() -> None:
    out = {"source": "freehire.me (Malaysian job postings, mostly JobStreet), read on " + dt.date.today().isoformat(),
           "roles": {}}
    with httpx.Client(timeout=30) as client:
        for role_id in ads.lookups():
            read = []
            for job in ads.for_role(role_id, MAX_ADS, client=client):
                read.append({"title": job["title"], "company": job["company"], "url": job["url"],
                             "posted": job["posted"], **extract(job["description"])})
            out["roles"][role_id] = {"searched": dt.date.today().isoformat(), "ads": read}
            print(f"{role_id}: {len(read)} ads, {sum(1 for a in read if a['level'])} state a level")
    DRAFT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def summarise(entry: dict) -> dict:
    ads = entry["ads"]
    stated = [a for a in ads if a["level"]]
    cite = lambda a, quote: {"title": a["title"], "company": a.get("company"), "url": a["url"], "quote": quote}  # noqa: E731
    levels = Counter(a["level"] for a in stated)
    level, n = levels.most_common(1)[0] if levels else (None, 0)
    fields = Counter(f for a in stated for f in a["fields"])
    certs = Counter(c for a in ads for c in a["certifications"])
    enough = len(stated) >= MIN_ADS and n >= MAJORITY * len(stated)
    return {
        "level": level if enough else None,
        "level_ads": n, "ads_with_level": len(stated), "ads_read": len(ads),
        "fields": [f for f, k in fields.most_common() if k >= MIN_MENTIONS][:4] if enough else [],
        "sources": [cite(a, a["quote"]) for a in stated if a["level"] == level][:3],
        "certifications": [{"name": c, "ads": k, "sources": [cite(a, a["certifications"][c]) for a in ads if c in a["certifications"]][:3]}
                           for c, k in certs.most_common() if k >= max(MIN_MENTIONS, MIN_CERT_SHARE * len(ads))][:4],
        "searched": entry["searched"],
    }


def apply() -> None:
    draft = json.loads(DRAFT.read_text(encoding="utf-8"))
    reqs = json.loads(REQS.read_text(encoding="utf-8"))
    old = reqs.get("roles", {})
    reqs["ads_source"] = {"title": draft["source"], "url": "https://freehire.me/jobs"}
    reqs["roles"] = {}
    for role_id, entry in draft["roles"].items():
        found = summarise(entry)
        unchanged = old.get(role_id, {}).get("level") == found["level"]
        reqs["roles"][role_id] = {**found, "reviewed_by": old.get(role_id, {}).get("reviewed_by") if unchanged else None}
        print(f"{role_id}: {found['level']} ({found['level_ads']}/{found['ads_with_level']} of {found['ads_read']} ads), "
              f"fields {found['fields']}, certs {[(c['name'], c['ads']) for c in found['certifications']]}")
    REQS.write_text(json.dumps(reqs, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write the reviewed draft into entry_requirements.json")
    args = parser.parse_args()
    apply() if args.apply else search()


if __name__ == "__main__":
    main()
