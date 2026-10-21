"""Find where a role's skills are asked for: Malaysian job ads, through Gemini's Google Search.

One grounded call per role asks for current Malaysian job ads and the exact sentences that ask for
each skill, tagged with our catalogue ids. When fewer than MIN_JOB_ADS usable ads come back, a
second call widens to any page (career guides, industry and government reports), labelled "web".

`aggregate` turns the pages into what a reviewer and the app need (`drop_sources` holds page URLs,
or "URL#skill_id" for one quote, that the reviewer unticked):
  status per skill   confirmed (2+ distinct pages), single (1), none (0)
  added              catalogue skills not in the role that 2+ distinct *job ads* ask for (weight 1);
                     web pages never add skills
  not_in_catalogue   skill names we have no entry for, with how many pages named them, for the team

Nothing here is personal: the prompt holds a role title and our skill names only. Every citation
keeps its quote and URL, and `grounded` says whether its site was among the sources Google
reported, so a reviewer can spot quotes the model may have invented.
"""

import datetime as dt
import re
from collections.abc import Callable
from urllib.parse import urlparse

import httpx

from app.llm import generate_grounded_json
from app.services.skills import _alias_index, normalize

MIN_JOB_ADS = 2       # usable ads before the search is widened, and ads needed to add a skill
MAX_PAGES = 8
MAX_QUOTES = 12       # per page
MAX_CITATIONS = 5     # per skill, as shown

# Job boards used in Malaysia, and the hiring systems employers post ads on. LinkedIn counts only
# for its job pages, not articles. Employer career sites (careers.x, jobs.x) count as job ads too.
JOB_BOARDS = ("jobstreet.com", "jobstreet.com.my", "hiredly.com", "myfuturejobs.gov.my", "indeed.com",
              "maukerja.my", "ricebowl.my", "glints.com", "jora.com", "jobsdb.com", "wobb.co", "kalibrr.com",
              "prosple.com", "jobleads.com", "workable.com", "greenhouse.io", "lever.co", "myworkdayjobs.com",
              "smartrecruiters.com", "successfactors.com", "recruitee.com")
CAREER_SUBDOMAINS = ("careers", "career", "jobs", "job", "apply", "recruit", "recruitment", "talent")
# Gemini sometimes copies Google's grounding redirect instead of the page address. Those links
# expire, so they are resolved to the real address (only the redirect header is read).
REDIRECT_HOSTS = ("vertexaisearch.cloud.google.com",)

ADS_PROMPT = """Search the web for current job ads in Malaysia (posted in the last 12 months) for the
role "{title}": {summary}
Prefer Malaysian job boards such as JobStreet, Hiredly, MyFutureJobs, LinkedIn Jobs, Indeed Malaysia
and Maukerja. Find up to {max_pages} different ads.

For each ad, copy the exact sentences that ask for skills, and tag each sentence with the closest
skill id from this list, or "other" with a short skill name when none fits:
{catalogue}

Use only sentences that appear in the ad. Do not invent ads, URLs or quotes.
Return JSON only:
{{"pages": [{{"url": "...", "title": "...", "employer": "...", "quotes": [{{"skill_id": "...", "skill_name": "...", "quote": "..."}}]}}]}}"""

WEB_PROMPT = """Search the web for pages that describe which skills the role "{title}" needs in
Malaysia ({summary}): career guides, industry or government reports, professional bodies, job ads.
Find up to {max_pages} different pages.

For each page, copy the exact sentences that name skills for this role, and tag each sentence with
the closest skill id from this list, or "other" with a short skill name when none fits:
{catalogue}

Use only sentences that appear on the page. Do not invent pages, URLs or quotes.
Return JSON only:
{{"pages": [{{"url": "...", "title": "...", "employer": "", "quotes": [{{"skill_id": "...", "skill_name": "...", "quote": "..."}}]}}]}}"""

Grounded = Callable[[str], tuple[dict, list[dict]]]


def _host(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def _on(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


def page_kind(url: str) -> str:
    host = _host(url)
    if _on(host, "linkedin.com"):
        return "job_ad" if urlparse(url).path.startswith("/jobs") else "web"
    if any(_on(host, board) for board in JOB_BOARDS) or host.split(".")[0] in CAREER_SUBDOMAINS:
        return "job_ad"
    return "web"


def resolve_redirect(url: str) -> str | None:
    """The address a Google grounding redirect points to, or None if it has expired."""
    try:
        response = httpx.get(url, follow_redirects=False, timeout=10)
    except httpx.HTTPError:
        return None
    location = response.headers.get("location", "")
    return location if response.is_redirect and location.startswith(("http://", "https://")) else None


def _grounded(url: str, sources: list[dict]) -> bool:
    host = _host(url)
    domains = {re.sub(r"^www\.", "", (s.get("title") or "").lower().strip()) for s in sources}
    return any(d and _on(host, d) for d in domains)


Resolve = Callable[[str], str | None]


def _clean_pages(raw: dict, sources: list[dict], skills: dict, resolve: Resolve) -> list[dict]:
    """Keep well-formed pages with an http(s) URL; tag ids are validated against the catalogue."""
    aliases = _alias_index()
    pages = []
    for page in (raw.get("pages") or [])[:MAX_PAGES]:
        if not isinstance(page, dict):
            continue
        url = str(page.get("url") or "").strip()
        via_google = any(_on(_host(url), h) for h in REDIRECT_HOSTS)
        if via_google:
            url = resolve(url) or ""
        if not url.startswith(("http://", "https://")):
            continue
        quotes = []
        for q in (page.get("quotes") or [])[:MAX_QUOTES]:
            if not isinstance(q, dict) or not str(q.get("quote") or "").strip():
                continue
            name = str(q.get("skill_name") or "").strip()[:60]
            skill_id = str(q.get("skill_id") or "")
            if skill_id not in skills:  # "other", or an id the model made up: try our own names
                skill_id = aliases.get(normalize(name))
            quotes.append({"skill_id": skill_id, "skill_name": name, "quote": str(q["quote"]).strip()[:400]})
        if quotes:
            pages.append({"url": url[:500], "title": str(page.get("title") or "")[:200],
                          "employer": str(page.get("employer") or "")[:120], "kind": page_kind(url),
                          "grounded": via_google or _grounded(url, sources), "quotes": quotes})
    return pages


def _dedupe(pages: list[dict]) -> list[dict]:
    """One entry per address: two redirects can lead to the same ad."""
    out: dict[str, dict] = {}
    for page in pages:
        if page["url"] in out:
            out[page["url"]]["quotes"] += page["quotes"]
        else:
            out[page["url"]] = page
    return list(out.values())


def aggregate(role: dict, pages: list[dict], skills: dict, drop_sources: set[str] = frozenset(),
              drop_added: set[str] = frozenset()) -> dict:
    cited: dict[str, dict[str, dict]] = {}  # skill id -> url -> citation (one per page)
    other: dict[str, set[str]] = {}
    for page in pages:
        if page["url"] in drop_sources:
            continue
        for q in page["quotes"]:
            if f"{page['url']}#{q['skill_id']}" in drop_sources:  # one quote unticked by the reviewer
                continue
            if q["skill_id"] is None:
                if q["skill_name"]:
                    other.setdefault(q["skill_name"], set()).add(page["url"])
                continue
            cited.setdefault(q["skill_id"], {}).setdefault(page["url"], {
                "url": page["url"], "title": page["title"], "employer": page["employer"],
                "kind": page["kind"], "grounded": page["grounded"], "quote": q["quote"]})
    own = [rs["skill_id"] for rs in role["skills"]]
    out = {}
    for skill_id in [*own, *(s for s in cited if s not in own)]:
        cites = list(cited.get(skill_id, {}).values())
        cites.sort(key=lambda c: (c["kind"] != "job_ad", not c["grounded"]))
        status = "confirmed" if len(cites) >= 2 else "single" if cites else "none"
        out[skill_id] = {"status": status, "sources": len(cites),
                         "job_ads": sum(c["kind"] == "job_ad" for c in cites), "citations": cites[:MAX_CITATIONS]}
    added = [{"skill_id": s, "job_ads": out[s]["job_ads"]} for s in out
             if s not in own and s not in drop_added and out[s]["job_ads"] >= MIN_JOB_ADS]
    names = sorted(({"name": n, "count": len(urls)} for n, urls in other.items()), key=lambda x: (-x["count"], x["name"]))
    return {"skills": out, "added": added, "not_in_catalogue": names}


def search_role(role: dict, skills: dict, *, grounded: Grounded = generate_grounded_json,
                resolve: Resolve = resolve_redirect, today: dt.date | None = None) -> dict:
    """Search, widen if needed, aggregate. Raises if the search itself fails."""
    catalogue = "\n".join(f"- {sid}: {s['name']}" for sid, s in skills.items())
    fill = {"title": role["title"], "summary": role.get("summary", ""), "catalogue": catalogue, "max_pages": MAX_PAGES}
    raw, sources = grounded(ADS_PROMPT.format(**fill))
    pages = _dedupe(_clean_pages(raw, sources, skills, resolve))
    widened = sum(p["kind"] == "job_ad" for p in pages) < MIN_JOB_ADS
    if widened:
        raw, more = grounded(WEB_PROMPT.format(**fill))
        sources = sources + more
        seen = {p["url"] for p in pages}
        pages += [p for p in _dedupe(_clean_pages(raw, sources, skills, resolve)) if p["url"] not in seen]
    return {"role_id": role["id"], "title": role["title"], "searched": str(today or dt.date.today()),
            "widened": widened, "sources": pages, "summary": aggregate(role, pages, skills)}
