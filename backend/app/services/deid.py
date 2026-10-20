"""
De-identification applied to every piece of text before it leaves this service for an LLM.
A CV is full of names, contact details, addresses, birth dates and employers; none of them is
needed to find skills.

Rules, not a named-entity model: a model such as spaCy or Presidio adds hundreds of megabytes to
a free-tier container and was trained on few Malaysian names or addresses. These patterns cover
the shapes Malaysian CVs use, and err on the side of removing too much (see DECISIONS.md #32).
"""
import re
from typing import Iterable

_IC = re.compile(r"(?<!\d)\d{6}-?\d{2}-?\d{4}(?!\d)")
_MOBILE = re.compile(r"(?<![\d+])(?:\+?60[\s-]?|0)1\d[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")
_LANDLINE = re.compile(r"(?<![\d+])(?:\+?60[\s-]?|0)[3-9][\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")

_MONTH = (r"(?:Jan(?:uary)?|Januari|Feb(?:ruary)?|Februari|Mac|Mar(?:ch)?|Apr(?:il)?|May|Mei|Jun(?:e)?|"
          r"Jul(?:y)?|Julai|Aug(?:ust)?|Ogos|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Okt(?:ober)?|Nov(?:ember)?|"
          r"Dec(?:ember)?|Dis(?:ember)?)")
_DATE = (rf"(?:\d{{1,2}}[/.\-]\d{{1,2}}[/.\-]\d{{2,4}}|\d{{4}}-\d{{2}}-\d{{2}}|"
         rf"\d{{1,2}}(?:st|nd|rd|th)?\s+{_MONTH}\.?,?\s+\d{{4}}|{_MONTH}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}})")
# A birth date or an age needs its label; employment dates in a CV are useful and stay.
_DOB = re.compile(rf"\b(?:date\s+of\s+birth|birth\s*date|d\.?\s?o\.?\s?b\.?|born(?:\s+on)?|tarikh\s+lahir)\s*[:\-]?\s*{_DATE}",
                  re.IGNORECASE)
_AGE = re.compile(r"\b(?:age|umur)\s*[:\-]\s*\d{1,3}(?:\s*(?:years?(?:\s+old)?|tahun))?", re.IGNORECASE)

_STREET = r"(?:Jalan|Jln\.?|Lorong|Lrg\.?|Persiaran|Lebuh|Lebuhraya|Lingkaran|Taman|Tmn\.?)"
# A labelled address line, a street (optionally after a house number), and a postcode with its town.
_ADDRESS_LINE = re.compile(r"^[ \t]*(?:home\s+)?(?:address|alamat)\s*[:\-].*$", re.IGNORECASE | re.MULTILINE)
_STREET_ADDRESS = re.compile(rf"(?:\b(?:No\.?|Lot|Unit|Blok|Block)\s*[\w/-]+,?\s*)?\b{_STREET}\s+[\w/.-]+(?:[ \t]+[A-Z0-9][\w/.-]*)*")
_POSTCODE_TOWN = re.compile(r"(?<![\d-])\d{5}[ \t]+[A-Z][A-Za-z]+(?:[ \t]+[A-Z][A-Za-z]+)*")

# Employers and schools: capitalised words ending in a company suffix, or around an institution word.
_CAP = r"[A-Z][\w&'.\-]*"
_COMPANY = re.compile(rf"(?:{_CAP}[ \t]+){{0,5}}{_CAP}[ \t]+(?:Sdn\.?[ \t]+Bhd\.?|Berhad|Bhd\.?|Ltd\.?|Limited|Inc\.?|LLC|PLC|"
                      rf"Corporation|Corp\.?|Holdings|Enterprise)(?![\w])")
_INSTITUTION = re.compile(rf"(?:{_CAP}[ \t]+){{0,4}}(?:University|Universiti|College|Kolej|Institute|Institut|Politeknik|"
                          rf"Polytechnic|Academy|Akademi|Sekolah|SMK|SMJK)(?:[ \t]+(?:of|for|&|{_CAP}))*(?<![ \t]of)(?<![ \t]for)")

# Connectors inside Malaysian names that are ordinary words on their own.
_NAME_CONNECTORS = {"bin", "binti", "bt", "bte", "b", "al", "ap", "a/l", "a/p", "s/o", "d/o", "anak", "mr", "mrs", "ms", "dr"}


def _name_patterns(names: Iterable[str]) -> list[re.Pattern]:
    patterns = []
    for name in names:
        name = name.strip()
        if not name:
            continue
        patterns.append(re.compile(rf"\b{re.escape(name)}\b", re.IGNORECASE))
        for part in name.split():
            if len(part) >= 3 and part.lower() not in _NAME_CONNECTORS:
                patterns.append(re.compile(rf"\b{re.escape(part)}\b", re.IGNORECASE))
    return patterns


_NAME_LINE = re.compile(r"^\s*(?:full\s+)?name\s*[:\-].*$", re.IGNORECASE | re.MULTILINE)
_NAME_WORD = re.compile(r"^(?:[A-Z][a-z'\-]+|[A-Z]{2,}|bin|binti|bt|a/l|a/p|s/o|d/o|anak|@)$")


_HEADLINE_SEP = re.compile(r"\s+[—–|·-]\s+|\s*,\s+")


def _split_headline(line: str) -> tuple[str, str, str]:
    match = _HEADLINE_SEP.search(line)
    return (line, "", "") if match is None else (line[:match.start()], match.group(), line[match.end():])


def _looks_like_name(line: str) -> bool:
    words = line.replace(",", " ").split()
    return 1 <= len(words) <= 6 and all(_NAME_WORD.match(w) for w in words)


def scrub_cv(text: str, names: Iterable[str] = ()) -> str:
    """scrub(), plus the two places a CV usually carries its owner's name: a "Name:" line and
    a first line made only of capitalised words. Errs on the side of removing too much."""
    text = _NAME_LINE.sub("[NAME]", text)
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.strip():
            # "Siti Aminah Rahman — Sustainability Manager": the name is the first part of a headline.
            head, sep, rest = _split_headline(line.strip())
            if _looks_like_name(head):
                lines[i] = "[NAME]" + sep + rest
            break
    return scrub("\n".join(lines), names)


def scrub(text: str, names: Iterable[str] = ()) -> str:
    """Replace IC numbers, phone numbers, emails, birth dates, ages, addresses, organisation
    names and known names with placeholders."""
    text = _DOB.sub("[DOB]", text)
    text = _AGE.sub("[AGE]", text)
    text = _ADDRESS_LINE.sub("[ADDRESS]", text)
    text = _COMPANY.sub("[ORG]", text)
    text = _INSTITUTION.sub("[ORG]", text)  # before streets, so "SMK Taman Desa" is one school
    text = _STREET_ADDRESS.sub("[ADDRESS]", text)
    text = _POSTCODE_TOWN.sub("[ADDRESS]", text)
    text = _IC.sub("[IC]", text)
    text = _MOBILE.sub("[PHONE]", text)
    text = _LANDLINE.sub("[PHONE]", text)
    text = _EMAIL.sub("[EMAIL]", text)
    for pattern in _name_patterns(names):
        text = pattern.sub("[NAME]", text)
    return text


PLACEHOLDERS = ("NAME", "EMAIL", "PHONE", "IC", "DOB", "AGE", "ADDRESS", "ORG")


def removed_counts(scrubbed: str) -> dict[str, int]:
    """How many of each kind of detail a scrub replaced, for the "what gets sent" preview."""
    counts = {kind: scrubbed.count(f"[{kind}]") for kind in PLACEHOLDERS}
    return {kind: n for kind, n in counts.items() if n}
