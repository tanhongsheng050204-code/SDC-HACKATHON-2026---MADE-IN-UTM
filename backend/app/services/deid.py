"""
De-identification applied to every piece of text before it leaves this service for an LLM.
A CV is full of names, emails and phone numbers; none of them is needed to find skills.
"""
import re
from typing import Iterable

_IC = re.compile(r"(?<!\d)\d{6}-?\d{2}-?\d{4}(?!\d)")
_MOBILE = re.compile(r"(?<![\d+])(?:\+?60[\s-]?|0)1\d[\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")
_LANDLINE = re.compile(r"(?<![\d+])(?:\+?60[\s-]?|0)[3-9][\s-]?\d{3,4}[\s-]?\d{4}(?!\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")

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
            if _looks_like_name(line.strip()):
                lines[i] = "[NAME]"
            break
    return scrub("\n".join(lines), names)


def scrub(text: str, names: Iterable[str] = ()) -> str:
    """Replace IC numbers, phone numbers, emails and known names with placeholders."""
    text = _IC.sub("[IC]", text)
    text = _MOBILE.sub("[PHONE]", text)
    text = _LANDLINE.sub("[PHONE]", text)
    text = _EMAIL.sub("[EMAIL]", text)
    for pattern in _name_patterns(names):
        text = pattern.sub("[NAME]", text)
    return text
