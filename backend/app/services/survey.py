"""The work-preference survey: concrete cards about real tasks and settings, from the roles a
person already matches, and the hidden preferences their answers reveal.

Deterministic on purpose: a Like or Dislike moves the card's dimensions (data/work_dimensions.json),
so the same answers always give the same preferences, and the person can see why. A free-text
"Other" answer counts only after the person confirms how it was read; otherwise it stays a note.
Preferences then add a small, visible boost in matching (matching.PREFERENCE_BOOST).
"""

from app.config import get_settings
from app.llm import generate_json
from app.reference import Reference
from app.services import matching
from app.services.deid import scrub

PREFERENCE_BOOST = matching.PREFERENCE_BOOST
TOP_ROLES = 8
MIN_CARDS, MAX_CARDS = 8, 10
STRONG = 0.5  # a preference worth naming

SENTENCE = {"en": "You seem to prefer {label}.", "ms": "Anda nampaknya lebih suka {label}.", "zh": "您似乎更喜欢{label}。"}
READING = {"en": "You prefer {label}", "ms": "Anda lebih suka {label}", "zh": "您更喜欢{label}"}

# Offline reading of an "Other" answer: plain words that point one way on a dimension.
KEYWORDS = {
    ("team", 1): ("team", "together", "colleagues", "group", "pasukan", "bersama", "团队", "一起"),
    ("team", -1): ("alone", "on my own", "by myself", "independent", "sendiri", "独立", "一个人"),
    ("people", 1): ("people", "customers", "talking", "helping", "orang", "pelanggan", "与人", "客户"),
    ("people", -1): ("numbers", "data", "computer", "angka", "komputer", "数据", "电脑"),
    ("field", 1): ("outdoor", "outside", "on site", "travel", "luar", "lapangan", "户外", "现场"),
    ("field", -1): ("desk", "office", "indoors", "pejabat", "办公室", "室内"),
    ("shifts", 1): ("shift", "flexible", "night", "syif", "anjal", "轮班", "弹性"),
    ("shifts", -1): ("fixed hours", "office hours", "9 to 5", "nine to five", "waktu tetap", "固定"),
    ("structured", 1): ("routine", "predictable", "clear steps", "rutin", "规律", "固定流程"),
    ("structured", -1): ("variety", "creative", "new things", "pelbagai", "kreatif", "创意", "多样"),
}

PROMPT = """A person answered a question about the kind of work they like. Decide which of these work
preferences their answer clearly states, and in which direction. Only include a dimension if the
answer is clear about it; otherwise leave it out.
Dimensions (+1 means the first option, -1 the second):
{dimensions}
Return JSON: {{"dims": {{"<dimension id>": 1 or -1}}}}

Answer: {text}"""


def _llm_available() -> bool:
    return bool(get_settings().gemini_api_key)


def _dimension(ref: Reference, dim_id: str) -> dict:
    return next(d for d in ref.work_dimensions if d["id"] == dim_id)


def pole_label(ref: Reference, dim_id: str, value: float, language: str = "en") -> str:
    pole = "plus" if value > 0 else "minus"
    return _dimension(ref, dim_id)[pole].get(language) or _dimension(ref, dim_id)[pole]["en"]


def pick_cards(ref: Reference, profile: dict, n: int = MAX_CARDS) -> list[dict]:
    """8-10 cards from the person's best-matching roles, covering every dimension and as many
    different roles as possible, so the answers can tell those roles apart."""
    top = [r["role_id"] for r in matching.match(ref, profile, "baseline")["roles"][:TOP_ROLES]]
    ordered = sorted(ref.survey_cards.values(), key=lambda c: c["id"])
    candidates = [c for c in ordered if set(c["role_ids"]) & set(top)]
    chosen: list[dict] = []

    def take(card: dict) -> None:
        if card not in chosen:
            chosen.append(card)

    for d in ref.work_dimensions:  # every dimension at least once (from anywhere if need be)
        if not any(d["id"] in c["dims"] for c in chosen):
            pool = [c for c in candidates if d["id"] in c["dims"]] or [c for c in ordered if d["id"] in c["dims"]]
            take(pool[0])
    while len(chosen) < n:
        represented = {r for c in chosen for r in c["role_ids"]}
        rest = [c for c in candidates if c not in chosen]
        if not rest:
            rest = [c for c in ordered if c not in chosen]
        fresh = [c for c in rest if not set(c["role_ids"]) <= represented]
        take((fresh or rest)[0])
    return chosen


def preferences(ref: Reference, answers: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for a in answers:
        card = ref.survey_cards[a["card_id"]]
        if a["answer"] == "like":
            dims = card["dims"]
        elif a["answer"] == "dislike":
            dims = {d: -v for d, v in card["dims"].items()}
        else:
            dims = a.get("dims") or {}  # sent only once the person confirmed the reading
        for d, v in dims.items():
            totals[d] = totals.get(d, 0.0) + v
            counts[d] = counts.get(d, 0) + 1
    return {d: round(max(-1.0, min(1.0, totals[d] / counts[d])), 3) for d in totals if totals[d] != 0}


def summary(ref: Reference, prefs: dict[str, float], language: str = "en") -> list[str]:
    template = SENTENCE.get(language, SENTENCE["en"])
    strong = sorted((d for d, v in prefs.items() if abs(v) >= STRONG), key=lambda d: -abs(prefs[d]))
    return [template.format(label=pole_label(ref, d, prefs[d], language)) for d in strong]


def _valid_dims(ref: Reference, raw) -> dict[str, int]:
    known = {d["id"] for d in ref.work_dimensions}
    if not isinstance(raw, dict):
        return {}
    return {d: int(v) for d, v in raw.items() if d in known and v in (1, -1) and not isinstance(v, bool)}


def interpret(ref: Reference, text: str, language: str = "en") -> dict:
    """Read a free-text answer as preference directions. The person confirms before it counts."""
    clean = scrub(text)
    dims: dict[str, int] = {}
    if _llm_available():
        described = "\n".join(f"- {d['id']}: {d['plus']['en']} (+1) or {d['minus']['en']} (-1)" for d in ref.work_dimensions)
        try:
            dims = _valid_dims(ref, (generate_json(PROMPT.format(dimensions=described, text=clean)) or {}).get("dims"))
        except Exception:
            dims = {}
    if not dims:
        lowered = clean.casefold()
        for (d, v), words in KEYWORDS.items():
            if d not in dims and any(w in lowered for w in words):
                dims[d] = v
    if not dims:
        return {"dims": {}, "reading": None}
    labels = [pole_label(ref, d, v, language) for d, v in dims.items()]
    return {"dims": dims, "reading": READING.get(language, READING["en"]).format(label=", ".join(labels))}
