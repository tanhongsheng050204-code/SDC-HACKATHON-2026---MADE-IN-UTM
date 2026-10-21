"""Emerging roles: new job titles that AI capabilities are creating, shown as a labelled prediction.

For each AI capability we track (data/capabilities.json), a grounded Gemini search looks for a new
or fast-growing job title in Malaysia that the capability is creating, with the sentences from the
pages that show it. Capabilities are taken fastest-accelerating first when an approved trend
refresh has measured research momentum; before that, all of them are searched and each card says
momentum has not been measured yet.

Each answer must name a stepping-stone role that is in our catalogue, skills from our catalogue,
and at least one source with a quote; otherwise it is refused. A person approves each card before
anyone sees it (app/evidence/review.py), at most MAX_SHOWN are shown, and none is ranked: there is
no published growth figure for a job title this new, and the brief forbids inventing one.

The live "Search the web" button on a card runs the job-ad search for its title, labelled "not yet
reviewed", cached per title per day and limited per profile, and never feeds any score.
"""

import datetime as dt
import threading
import time

from app.evidence import search
from app.llm import generate_grounded_json

MAX_SHOWN = 6
LIVE_PER_HOUR = 5  # live searches per profile; each is a paid grounded call
LANGS = ("en", "ms", "zh")

PROMPT = """Search the web for new or fast-growing job titles in Malaysia (or Southeast Asia) that exist
because of this AI capability: {name}.
Pick ONE job title that employers are advertising or that reputable sources describe as emerging,
and that is not one of these existing roles: {roles}.

Return JSON only:
{{"title": {{"en": "...", "ms": "...", "zh": "..."}},
  "summary": {{"en": "one sentence on what the job does", "ms": "...", "zh": "..."}},
  "skills": ["skill ids from this list that the job needs"],
  "stepping_stone": "the id of the closest existing role from this list, the best place to start",
  "stepping_reason": {{"en": "one sentence on why it is the best place to start", "ms": "...", "zh": "..."}},
  "sdg": the number (1-17) of the UN Sustainable Development Goal the job serves most,
  "sdg_reason": {{"en": "one sentence on how it serves that goal", "ms": "...", "zh": "..."}},
  "sources": [{{"url": "...", "title": "...", "quote": "the exact sentence from the page naming or describing the job"}}]}}

Skill ids: {skills}
Role ids: {role_ids}
Use only pages and sentences that exist. Do not invent job titles, URLs or quotes."""


class Unusable(Exception):
    """The search answer cannot be shown: no source, no catalogue skill, or no valid stepping stone."""


def candidates(ref) -> list[tuple[dict, float | None]]:
    momentum = ref.latest_snapshot.get("capability_momentum")
    if not momentum:
        return [(c, None) for c in ref.capabilities]
    rising = [(c, momentum[c["id"]]) for c in ref.capabilities if momentum.get(c["id"], 0) > 0]
    return sorted(rising, key=lambda cm: -cm[1])


def _texts(raw, limit: int) -> dict[str, str]:
    raw = raw if isinstance(raw, dict) else {}
    return {lang: str(raw.get(lang) or "").strip()[:limit] for lang in LANGS}


def search_capability(cap: dict, momentum: float | None, ref, *, grounded=generate_grounded_json,
                      resolve=search.resolve_redirect, today: dt.date | None = None) -> dict:
    """One grounded search for one capability. Raises Unusable (or on any search failure)."""
    prompt = PROMPT.format(name=cap["name"], roles=", ".join(r["title"] for r in ref.roles.values()),
                           skills=", ".join(ref.skills), role_ids=", ".join(ref.roles))
    raw, google_sources = grounded(prompt)
    title = _texts(raw.get("title"), 80)
    if not title["en"]:
        raise Unusable("no title")
    if title["en"].casefold() in {r["title"].casefold() for r in ref.roles.values()}:
        raise Unusable("already a catalogue role")
    stone = str(raw.get("stepping_stone") or "")
    if stone not in ref.roles:
        raise Unusable("no valid stepping stone")
    skills = list(dict.fromkeys(s for s in (raw.get("skills") or []) if s in ref.skills))
    if not skills:
        raise Unusable("no catalogue skill")
    sources = []
    for item in (raw.get("sources") or [])[:5]:
        if not isinstance(item, dict) or not str(item.get("quote") or "").strip():
            continue
        url = str(item.get("url") or "").strip()
        via_google = any(search._on(search._host(url), h) for h in search.REDIRECT_HOSTS)
        if via_google:
            url = resolve(url) or ""
        if not url.startswith(("http://", "https://")):
            continue
        sources.append({"url": url[:500], "title": str(item.get("title") or "")[:200],
                        "kind": search.page_kind(url), "grounded": via_google or search._grounded(url, google_sources),
                        "quote": str(item["quote"]).strip()[:400]})
    if not sources:
        raise Unusable("no source with a quote")
    number = raw.get("sdg")
    sdg = ({"number": number, "reason": _texts(raw.get("sdg_reason"), 300)}
           if isinstance(number, int) and not isinstance(number, bool) and 1 <= number <= 17 else None)
    return {"capability_id": cap["id"], "capability_name": cap["name"], "momentum": momentum,
            "snapshot_id": ref.latest_snapshot["snapshot_id"], "searched": str(today or dt.date.today()),
            "title": title, "summary": _texts(raw.get("summary"), 300), "skills": skills,
            "stepping_stone": stone, "stepping_reason": _texts(raw.get("stepping_reason"), 300),
            "sdg": sdg, "sources": sources}


def shown(approved: dict[str, dict]) -> list[dict]:
    """Approved cards to show: fastest-accelerating capability first, at most MAX_SHOWN."""
    cards = sorted(approved.values(), key=lambda b: (-(b.get("momentum") or 0), b["capability_id"]))
    return cards[:MAX_SHOWN]


# --- live search (unreviewed) --------------------------------------------------------------------

_live_lock = threading.Lock()
_live_cache: dict[tuple[str, str], dict] = {}
_live_calls: dict[str, list[float]] = {}


def clear_live_cache() -> None:
    with _live_lock:
        _live_cache.clear()
        _live_calls.clear()


class RateLimited(Exception):
    pass


def live_search(card: dict, profile_id: str, ref) -> dict:
    """Current job ads for an emerging title. Cached per title per day; LIVE_PER_HOUR per profile."""
    key = (card["capability_id"], str(dt.date.today()))
    with _live_lock:
        if key in _live_cache:
            return _live_cache[key]
        recent = [t for t in _live_calls.get(profile_id, []) if time.time() - t < 3600]
        if len(recent) >= LIVE_PER_HOUR:
            raise RateLimited()
        _live_calls[profile_id] = [*recent, time.time()]
    role = {"id": card["capability_id"], "title": card["title"]["en"], "summary": card["summary"]["en"], "skills": []}
    found = search.search_role(role, ref.skills)
    result = {"reviewed": False, "searched": str(dt.date.today()),
              "sources": [{k: p[k] for k in ("url", "title", "employer", "kind", "grounded")}
                          | {"quote": p["quotes"][0]["quote"] if p["quotes"] else ""} for p in found["sources"]]}
    with _live_lock:
        _live_cache[key] = result
    return result
