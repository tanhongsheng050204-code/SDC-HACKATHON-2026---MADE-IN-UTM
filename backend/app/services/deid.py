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


def scrub(text: str, names: Iterable[str] = ()) -> str:
    """Replace IC numbers, phone numbers, emails and known names with placeholders."""
    text = _IC.sub("[IC]", text)
    text = _MOBILE.sub("[PHONE]", text)
    text = _LANDLINE.sub("[PHONE]", text)
    text = _EMAIL.sub("[EMAIL]", text)
    for pattern in _name_patterns(names):
        text = pattern.sub("[NAME]", text)
    return text
