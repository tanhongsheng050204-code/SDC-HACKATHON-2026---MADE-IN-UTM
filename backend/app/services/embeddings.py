"""Text embeddings: Gemini when a key is set, a deterministic offline fallback otherwise.

Used only for skill names the alias dictionary does not know ("pandas dataframes" → Python).
Callers must scrub() text first; skill phrases carry no personal data.
"""

import hashlib
import math
import re

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


BATCH = 100  # the Gemini API's limit on texts per embedding request

_cache: dict[str, tuple[float, ...]] = {}  # Gemini vectors only; offline ones are cheap to rebuild


def clear_cache() -> None:
    _cache.clear()


def embed_many(texts: list[str]) -> tuple[list[tuple[float, ...]], str]:
    """Vectors for every text, all from the same source so they can be compared.

    Texts not yet cached go to Gemini in batches of BATCH: matching one unknown phrase compares it
    with the whole skill catalogue (about 200 names), which one request per name made take a
    minute and a half on the first CV after a restart. If any batch fails, every text gets an
    offline vector instead, because Gemini and offline vectors cannot be compared with each other.
    """
    settings = get_settings()
    if settings.gemini_api_key:
        missing = [t for t in dict.fromkeys(texts) if t not in _cache]
        try:
            for i in range(0, len(missing), BATCH):
                chunk = missing[i:i + BATCH]
                result = gemini_client().models.embed_content(
                    model=settings.gemini_embedding_model,
                    contents=chunk,
                    config={"output_dimensionality": EMBEDDING_DIMENSIONS},
                )
                for text, embedding in zip(chunk, result.embeddings, strict=True):
                    _cache[text] = tuple(embedding.values)
            return [_cache[t] for t in texts], "gemini"
        except Exception:
            pass  # fall through to offline embeddings for every text
    return [tuple(_offline_embedding(t)) for t in texts], "offline"


def embed_text(text: str) -> tuple[tuple[float, ...], str]:
    vectors, source = embed_many([text])
    return vectors[0], source


def cosine(left, right) -> float:
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0
