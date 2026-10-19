"""Text embeddings: Gemini when a key is set, a deterministic offline fallback otherwise.

Used only for skill names the alias dictionary does not know ("pandas dataframes" → Python).
Callers must scrub() text first; skill phrases carry no personal data.
"""

import hashlib
import math
import re
from functools import lru_cache

from app.config import get_settings
from app.llm import gemini_client

EMBEDDING_DIMENSIONS = 768


def _offline_embedding(text: str, dimensions: int = EMBEDDING_DIMENSIONS) -> list[float]:
    """Deterministic feature-hashing fallback for local demonstrations."""
    vector = [0.0] * dimensions
    for word in re.findall(r"[A-Za-z0-9_]+", text.casefold()):
        digest = hashlib.sha256(word.encode()).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        vector[index] += -1.0 if digest[4] & 1 else 1.0
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


@lru_cache(maxsize=1024)
def embed_text(text: str) -> tuple[tuple[float, ...], str]:
    settings = get_settings()
    if settings.gemini_api_key:
        try:
            result = gemini_client().models.embed_content(
                model=settings.gemini_embedding_model,
                contents=text,
                config={"output_dimensionality": EMBEDDING_DIMENSIONS},
            )
            return tuple(result.embeddings[0].values), "gemini"
        except Exception:
            pass  # fall through to the offline embedding
    return tuple(_offline_embedding(text)), "offline"


def cosine(left, right) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0
