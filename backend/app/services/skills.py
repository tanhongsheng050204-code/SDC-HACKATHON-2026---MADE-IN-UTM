"""Skill extraction and normalisation.

Text → skill IDs in our standard list. Three layers, cheapest first:
1. Alias dictionary (deterministic, offline): whole-phrase matches of names and aliases.
2. A language model reads the scrubbed CV and returns skill phrases: the open model on RunPod when
   configured (so CV text never reaches Google), else Gemini when a key is set.
3. Embeddings: map a phrase the dictionary does not know to the nearest skill, above a threshold.
"""

import re

from app import runpod
from app.llm import generate_json
from app.reference import get_reference
from app.services import guardrails
from app.services.deid import scrub_cv
from app.services.embeddings import cosine, embed_many

EMBEDDING_MATCH_THRESHOLD = 0.75


def normalize(phrase: str) -> str:
    phrase = phrase.casefold().strip()
    phrase = re.sub(r"[^\w+#./ -]", " ", phrase)
    return re.sub(r"\s+", " ", phrase).strip(" .-")


def _alias_index() -> dict[str, str]:
    index: dict[str, str] = {}
    for skill in get_reference().skills.values():
        for term in [skill["name"], skill["id"].replace("_", " "), *skill.get("aliases", [])]:
            index.setdefault(normalize(term), skill["id"])
    return index


def match_phrase(phrase: str) -> str | None:
    """One phrase → one skill ID, via the dictionary, then embeddings."""
    norm = normalize(phrase)
    if not norm:
        return None
    index = _alias_index()
    if norm in index:
        return index[norm]
    terms = list(index)
    vectors, _ = embed_many([norm, *terms])  # one source, batched, cached after the first CV
    vector = vectors[0]
    best_id, best_score = None, 0.0
    for term, term_vector in zip(terms, vectors[1:], strict=True):
        score, skill_id = cosine(vector, term_vector), index[term]
        if score > best_score:
            best_id, best_score = skill_id, score
    return best_id if best_score >= EMBEDDING_MATCH_THRESHOLD else None


def dictionary_extract(text: str) -> list[str]:
    """Every skill whose name or alias appears as a whole phrase in the text."""
    haystack = f" {normalize(text)} "
    found: list[str] = []
    for term, skill_id in sorted(_alias_index().items(), key=lambda kv: -len(kv[0])):
        if len(term) < 2 or skill_id in found:
            continue
        if re.search(rf"(?<![\w]){re.escape(term)}(?![\w])", haystack):
            found.append(skill_id)
    return found


EXTRACT_PROMPT = """You read a CV or a short self-description and list the person's skills.
Return JSON: {{"skills": ["short skill phrase", ...]}}. Include tools, technical skills and
people skills that the text gives evidence for. Do not invent skills. At most 25 phrases.

Text:
\"\"\"{text}\"\"\""""


def extract(text: str, names: list[str] | None = None) -> dict:
    """Scrub, then extract. Returns skill IDs, phrases we could not map, and the mode used."""
    clean = scrub_cv(text, names or [])
    skill_ids = dictionary_extract(text)  # local, so it may read what the scrubber removed ("Data Science Academy")
    unmatched: list[str] = []
    mode = "dictionary"
    if not guardrails.check(clean).safe:
        # A CV that tries to instruct the model is read by the dictionary only.
        return {"skills": skill_ids, "unmatched": [], "mode": "dictionary (AI skipped: instructions found in text)"}
    prompt = EXTRACT_PROMPT.format(text=clean[:20_000])
    result = None
    if runpod.cv_model_available():
        try:
            result, mode = runpod.generate_json(prompt), "open-model+dictionary"
        except Exception:
            pass  # cold start or outage: fall through to Gemini
    try:
        if result is None:
            result, mode = generate_json(prompt), "gemini+dictionary"
        for phrase in result.get("skills", [])[:25]:
            skill_id = match_phrase(str(phrase))
            if skill_id is None:
                unmatched.append(str(phrase))
            elif skill_id not in skill_ids:
                skill_ids.append(skill_id)
    except Exception:
        pass  # no model or the call failed: the dictionary result stands
    return {"skills": skill_ids, "unmatched": unmatched, "mode": mode}
