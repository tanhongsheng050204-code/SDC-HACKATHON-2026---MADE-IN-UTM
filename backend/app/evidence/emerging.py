"""Emerging roles: new job titles that AI capabilities are creating, shown as a labelled prediction.

For each AI capability we track (data/capabilities.json), a grounded Gemini search looks for a new
or fast-growing job title in Malaysia that the capability is creating, with the sentences from the
pages that show it. Capabilities are taken fastest-accelerating first when an approved trend
refresh has measured research momentum; before that, all of them are searched and each card says
momentum has not been measured yet.

Each answer must name a stepping-stone role that is in our catalogue, skills from our catalogue,
and at least one source with a quote on a site Google actually read; otherwise it is refused. Source
links are Google's own addresses for those pages, never the address the model wrote, and each
records whether its quote was found on the page. A person approves each card before
anyone sees it (app/evidence/review.py), at most MAX_SHOWN are shown, and none is ranked: there is
no published growth figure for a job title this new, and the brief forbids inventing one.

The live "Search current job ads" button on a card reads real Malaysian job ads for its title
(app/evidence/ads.py), labelled "not yet reviewed", cached per title per day and limited per
profile, and never feeds any score. The role page's "Find current openings" (openings()) reads the
same way, with the same cache and limit, for catalogue roles.
"""

import datetime as dt
import html
import ipaddress
import re
import socket
import threading
import time
import urllib.parse

import httpx

from app.evidence import ads, search
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
Give up to 4 sources. For each "url", copy the source link exactly as your search results give it
(a vertexaisearch.cloud.google.com link is fine); never type a page address yourself.
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


def _google_link(url: str, chunks: list[dict], used: set[int], resolve) -> str | None:
    """The real address of a page Google read on the same site as the model's link, or None.

    Google lists its sources by site (title = domain) with a redirect to the page; the redirect is
    resolved, reading only its header. A model link that is itself such a redirect is resolved too."""
    if any(search._on(search._host(url), h) for h in search.REDIRECT_HOSTS):
        return resolve(url)
    host = search._host(url)
    for i, chunk in enumerate(chunks):
        domain = re.sub(r"^www\.", "", (chunk.get("title") or "").lower().strip())
        if i not in used and host and domain and search._on(host, domain):
            used.add(i)
            return resolve(chunk["uri"])
    return None


MAX_HOPS = 3


def _public_https(url: str) -> bool:
    """Only https pages on public addresses: the URL comes from a model's search results, so a page
    (or a redirect) must never make the server call itself, its network or a cloud metadata address."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        return False
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    except (socket.gaierror, UnicodeError, ValueError):
        return False
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if not ip.is_global or ip.is_multicast:
            return False
    return bool(infos)


def _page_text(url: str) -> str | None:
    for _ in range(MAX_HOPS + 1):
        if not _public_https(url):
            return None
        try:
            response = httpx.get(url, follow_redirects=False, timeout=10,
                                 headers={"User-Agent": "Mozilla/5.0 (Laluan source check)"})
        except httpx.HTTPError:
            return None
        if not response.is_redirect:
            return response.text if response.status_code == 200 else None
        url = urllib.parse.urljoin(url, response.headers.get("location", ""))
    return None


def _norm(text: str) -> str:
    return re.sub(r"\W+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).lower().strip()


def quote_on_page(url: str, quote: str, *, fetch=None) -> bool | None:
    """Whether the quoted sentence is on the page (its first 80 characters, ignoring markup and
    punctuation), or None when the page cannot be read (many job boards refuse automated visits)."""
    page = (fetch or _page_text)(url)
    return None if page is None else _norm(quote)[:80] in _norm(page)


def search_capability(cap: dict, momentum: float | None, ref, *, grounded=generate_grounded_json,
                      resolve=None, today: dt.date | None = None) -> dict:
    """One grounded search for one capability. Raises Unusable (or on any search failure)."""
    resolve = resolve or search.resolve_redirect  # looked up here, so tests can stand in for the network
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
    # Links come from Google's own sources, never from the address the model wrote: the model rebuilds
    # addresses from memory and most did not open (REVIEW_LOG). A source on a site Google did not
    # read is dropped; its link becomes Google's real address for that site's page.
    chunks = [c for c in google_sources if c.get("uri")]
    used: set[int] = set()
    sources = []
    for item in (raw.get("sources") or [])[:5]:
        if not isinstance(item, dict) or not str(item.get("quote") or "").strip():
            continue
        url = _google_link(str(item.get("url") or "").strip(), chunks, used, resolve)
        if not url or not url.startswith(("http://", "https://")):
            continue
        quote = str(item["quote"]).strip()[:400]
        sources.append({"url": url[:500], "title": str(item.get("title") or "")[:200], "kind": search.page_kind(url),
                        "grounded": True, "quote": quote, "quote_on_page": quote_on_page(url, quote)})
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
    role = {"id": card["capability_id"], "title": card["title"]["en"], "summary": card["summary"]["en"], "skills": []}
    return _live((card["capability_id"], str(dt.date.today())), role, profile_id, ref)


def openings(role_id: str, profile_id: str, ref) -> dict:
    """Current Malaysian job ads for a catalogue role, for "Find current openings" on the role page.
    The same unreviewed search, daily cache and per-profile limit as live_search; job ads first."""
    role = ref.roles[role_id]
    found = _live((f"role:{role_id}", str(dt.date.today())), {**role, "skills": []}, profile_id, ref)
    return {**found, "sources": sorted(found["sources"], key=lambda s: s["kind"] != "job_ad")}


def _live(key: tuple[str, str], role: dict, profile_id: str, ref) -> dict:
    with _live_lock:
        if key in _live_cache:
            return _live_cache[key]
        recent = [t for t in _live_calls.get(profile_id, []) if time.time() - t < 3600]
        if len(recent) >= LIVE_PER_HOUR:
            raise RateLimited()
        _live_calls[profile_id] = [*recent, time.time()]
    # Real ads (app/evidence/ads.py): a catalogue role by its usual search terms, an emerging title by its words.
    fetch = None if role["id"] in ref.roles else (lambda _id, n: ads.for_title(role["title"], n))
    found = search.search_role(role, ref.skills, **({"fetch": fetch} if fetch else {}))
    result = {"reviewed": False, "searched": str(dt.date.today()),
              "sources": [{k: p[k] for k in ("url", "title", "employer", "kind", "grounded")}
                          | {"quote": p["quotes"][0]["quote"] if p["quotes"] else ""} for p in found["sources"]]}
    with _live_lock:
        _live_cache[key] = result
    return result
