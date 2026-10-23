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
# A link to someone's own profile names them as surely as their name does.
_PROFILE_LINK = re.compile(r"(?:https?://)?(?:[\w-]+\.)?(?:linkedin\.com/(?:in|pub)|github\.com|gitlab\.com|facebook\.com|fb\.com|"
                           r"instagram\.com|twitter\.com|x\.com|tiktok\.com/@|behance\.net|dribbble\.com|medium\.com)"
                           r"/[\w.@%~/-]*", re.IGNORECASE)
# A title before capitalised words is a person ("Dr. Tan Wei Ming", "Puan Siti Aminah"), wherever it appears.
_TITLED_NAME = re.compile(r"\b(?:Dr|Prof|Professor|Assoc\.?[ \t]+Prof|Ir|Ts|Encik|En|Puan|Pn|Cik|Tuan|Mr|Mrs|Ms|Mdm|Madam|"
                          r"Dato'?|Datuk|Datin|Tan[ \t]+Sri|Puan[ \t]+Sri)"
                          # "Dr. Tan", "Dr Tan" and, as OCR sometimes reads it, "Dr.Tan"
                          r"(?:\.[ \t]*|[ \t]+)[A-Z][\w'\-]*\.?(?:[ \t]+[A-Z][\w'\-]*\.?){0,4}")

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
# The words after the institution word stop at a full stop: "Universiti Malaya. Python, SQL" keeps Python.
_INSTITUTION = re.compile(rf"(?:{_CAP}[ \t]+){{0,4}}(?:University|Universiti|College|Kolej|Institute|Institut|Politeknik|"
                          rf"Polytechnic|Academy|Akademi|Sekolah|SMK|SMJK)(?:[ \t]+(?:of|for|&|[A-Z][\w&'\-]*))*(?<![ \t]of)(?<![ \t]for)")

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
_SENTENCE_END = re.compile(r"\.\s+")
# "My name is Tan Wei Jie", "Nama saya Siti Aminah": a name the person gives in a sentence.
SELF_NAMED = re.compile(r"(?i:\bmy name is|\bnama saya(?:\s+ialah|\s+adalah)?|\bcall me|我叫|我的名字是)\s*"
                        r"([A-Z\u4e00-\u9fff][\w'\u4e00-\u9fff-]*(?:\s+(?:binti|bin|bt|a/l|a/p|[A-Z][\w'-]*)){0,4})")


def _split_headline(line: str) -> tuple[str, str, str]:
    match = _HEADLINE_SEP.search(line)
    # "Nur Aisyah binti Ahmad. Email ..., phone ...": a full stop ends the name before any comma does.
    # Two words at least, so "Dr. Tan Wei Ming" is left whole for the titled-name rule.
    stop = _SENTENCE_END.search(line)
    if stop and (match is None or stop.start() < match.start()) and len(line[:stop.start()].split()) >= 2:
        match = stop
    return (line, "", "") if match is None else (line[:match.start()], match.group(), line[match.end():])


def _looks_like_name(line: str) -> bool:
    words = line.replace(",", " ").split()
    return 1 <= len(words) <= 6 and all(_NAME_WORD.match(w) for w in words)


# Section headings a CV may start with or list referees under; never a person's name.
_HEADINGS = {"profile", "summary", "professional summary", "career summary", "about", "about me", "objective",
             "career objective", "curriculum vitae", "resume", "résumé", "cv", "contact", "contact details",
             "personal details", "personal information", "education", "experience", "work experience",
             "employment", "skills", "key skills", "languages", "projects", "certifications", "certificates",
             "achievements", "awards", "activities", "interests", "referee", "referees", "references", "reference",
             "rujukan", "profil", "pendidikan", "pengalaman", "kemahiran", "bahasa"}
_REFEREE_HEADING = re.compile(r"^\s*(?:referees?|references?|rujukan)\s*:?\s*$", re.IGNORECASE)
_CONNECTOR_START = re.compile(r"^(?:bin|binti|bt|bte|a/l|a/p|s/o|d/o|anak|@)(?:\s|$)", re.IGNORECASE)
HEAD_LINES = 6  # how far down the first lines are searched for the owner's name


def _is_heading(line: str) -> bool:
    return line.strip().rstrip(":").lower() in _HEADINGS


def scrub_cv(text: str, names: Iterable[str] = ()) -> str:
    """scrub(), plus the places a CV carries people's names: a "Name:" line; the owner's name in the
    first lines (ended by a dash, comma or full stop), after any heading such as "PROFILE" or "RESUME",
    including a next line that starts "bin", "binti", "a/l" and so on (a sidebar breaks the name in
    two); a name given as "My name is ..." or "Nama saya ..."; and whoever is listed under "Referees".
    The words of the owner's name are then removed everywhere else too. Errs on the side of removing
    too much."""
    text = _NAME_LINE.sub("[NAME]", text)
    lines = text.splitlines()
    found = list(names) + [m.group(1) for m in SELF_NAMED.finditer(text)]
    seen = 0
    for i, line in enumerate(lines):
        if not line.strip() or _is_heading(line):
            continue
        seen += 1
        # "Siti Aminah Rahman — Sustainability Manager": the name is the first part of a headline.
        head, sep, rest = _split_headline(line.strip())
        if seen > HEAD_LINES or not _looks_like_name(head):
            break
        lines[i] = "[NAME]" + sep + rest
        found.append(head)
        after = next((j for j in range(i + 1, len(lines)) if lines[j].strip()), None)
        if after is not None and _CONNECTOR_START.match(lines[after].strip()) and _looks_like_name(lines[after]):
            found.append(lines[after].strip())
            lines[after] = "[NAME]"
        break
    referees = False
    for i, line in enumerate(lines):
        if _REFEREE_HEADING.match(line):
            referees = True
        elif _is_heading(line):
            referees = False
        elif referees and line.strip() and _looks_like_name(_split_headline(line.strip())[0]):
            lines[i] = "[NAME]"
    return scrub("\n".join(lines), found)


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
    text = _PROFILE_LINK.sub("[LINK]", text)
    text = _TITLED_NAME.sub("[NAME]", text)
    for pattern in _name_patterns(names):
        text = pattern.sub("[NAME]", text)
    return text


PLACEHOLDERS = ("NAME", "EMAIL", "PHONE", "IC", "DOB", "AGE", "ADDRESS", "ORG", "LINK")


def removed_counts(scrubbed: str) -> dict[str, int]:
    """How many of each kind of detail a scrub replaced, for the "what gets sent" preview."""
    counts = {kind: scrubbed.count(f"[{kind}]") for kind in PLACEHOLDERS}
    return {kind: n for kind, n in counts.items() if n}
