"""Find where a role's skills are asked for in real Malaysian job ads.

The ads come from freehire.me (app/evidence/ads.py: the same postings as a role page's openings,
each with its original link, mostly JobStreet). Every sentence of every ad is matched against our
skill names and aliases (skills_in: the CV dictionary minus GENERIC_IN_ADS); a sentence that names a skill
becomes that skill's quote, word for word, with the ad's own link. No language model is involved,
so no link, ad or quote can be invented. (Until 22 Oct 2026 a Gemini search found the ads; most of
the links it wrote did not open, because the model rebuilt ad addresses from memory: REVIEW_LOG.)

`aggregate` turns the pages into what a reviewer and the app need (`drop_sources` holds page URLs,
or "URL#skill_id" for one quote, that the reviewer unticked):
  status per skill   confirmed (2+ ads), single (1), none (0)
  added              catalogue skills not in the role that ADD_MIN_ADS+ ads and ADD_SHARE of the ads
                     read ask for, added at weight 1 once approved
  not_in_catalogue   freehire's own skill tags on the ads that we have no entry for, with how many
                     ads carry them, for the team

The page-kind and redirect helpers below are also used by the emerging-roles search (emerging.py).
"""

import datetime as dt
import math
import re
from collections.abc import Callable
from functools import lru_cache
from urllib.parse import urlparse

import httpx

from app.evidence import ads
from app.services.skills import _alias_index, normalize

MAX_ADS = 40          # newest ads read per role
MAX_SENTENCE = 300    # longer "sentences" are usually whole paragraphs that lost their breaks
MAX_CITATIONS = 5     # per skill, as shown
ADD_MIN_ADS = 3       # a catalogue skill joins the role only if at least this many ads ask for it...
ADD_SHARE = 0.2       # ...and at least this share of the ads read (generic skills appear in a few ads)

# Job boards used in Malaysia, and the hiring systems employers post ads on. LinkedIn counts only
# for its job pages, not articles. Employer career sites (careers.x, jobs.x) count as job ads too.
JOB_BOARDS = ("jobstreet.com", "jobstreet.com.my", "hiredly.com", "myfuturejobs.gov.my", "indeed.com",
              "maukerja.my", "ricebowl.my", "glints.com", "jora.com", "jobsdb.com", "wobb.co", "kalibrr.com",
              "prosple.com", "jobleads.com", "workable.com", "greenhouse.io", "lever.co", "myworkdayjobs.com",
              "smartrecruiters.com", "successfactors.com", "recruitee.com",
              # recruitment agencies advertising Malaysian jobs
              "michaelpage.com.my", "hays.com.my", "randstad.com.my", "robertwalters.com.my", "adecco.com",
              "kellyservices.com.my", "manpower.com.my", "pagepersonnel.com.my")
JOB_PATHS = ("/job/", "/jobs/", "/job-detail", "/job-details/", "/vacancy/", "/vacancies/")  # an ad on any site
CAREER_SUBDOMAINS = ("careers", "career", "jobs", "job", "apply", "recruit", "recruitment", "talent")
# Gemini sometimes copies Google's grounding redirect instead of the page address. Those links
# expire, so they are resolved to the real address (only the redirect header is read).
REDIRECT_HOSTS = ("vertexaisearch.cloud.google.com",)

Fetch = Callable[[str, int], list[dict]]


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
    if any(part in urlparse(url).path.lower() for part in JOB_PATHS):
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


# One-word aliases that help read a CV but are too common in job ads to show an ad asks for the skill:
# "ensure compliance with cash-handling procedures" is not risk assessment, "proficient in writing
# English" is not content writing, and "5 ml" in a nursing ad is not machine learning.
GENERIC_IN_ADS = {"compliance", "audit", "writing", "coordination", "ml", "flexibility"}


@lru_cache(maxsize=1)
def _ad_terms() -> list[tuple[re.Pattern, str]]:
    terms = [(t, s) for t, s in _alias_index().items() if len(t) >= 2 and t not in GENERIC_IN_ADS]
    return [(re.compile(rf"(?<![\w]){re.escape(t)}(?![\w])"), s) for t, s in sorted(terms, key=lambda ts: -len(ts[0]))]


def skills_in(sentence: str) -> list[str]:
    """Catalogue skills a job-ad sentence names, by name or alias (as dictionary_extract, minus GENERIC_IN_ADS)."""
    haystack = f" {normalize(sentence)} "
    found: list[str] = []
    for pattern, skill_id in _ad_terms():
        if skill_id not in found and pattern.search(haystack):
            found.append(skill_id)
    return found


def pages_from_ads(jobs: list[dict], skills: dict) -> list[dict]:
    """One page per ad: the first sentence that names each catalogue skill, word for word, and the
    ad's own skill tags that are not in our catalogue (no quote: they only list names for the team).
    An ad posted again (same title and employer, a new link) counts once."""
    aliases = _alias_index()
    pages, posted = [], set()
    for job in jobs:
        key = (job["title"].casefold().strip(), (job.get("company") or "").casefold().strip())
        if key in posted:
            continue
        posted.add(key)
        quotes, seen = [], set()
        for sentence in ads.sentences(job["description"]):
            if len(sentence) > MAX_SENTENCE:
                continue
            for skill_id in skills_in(sentence):
                if skill_id in skills and skill_id not in seen:
                    seen.add(skill_id)
                    quotes.append({"skill_id": skill_id, "skill_name": skills[skill_id]["name"], "quote": sentence})
        for tag in job.get("tags", []):
            known = aliases.get(normalize(tag))
            if known is None:
                quotes.append({"skill_id": None, "skill_name": tag.strip().lower()[:60], "quote": ""})
            elif known in skills and known not in seen:  # tagged by the site but not written in a sentence
                seen.add(known)
                quotes.append({"skill_id": known, "skill_name": skills[known]["name"], "quote": f"Skill listed on the ad: {tag}"})
        if quotes:
            pages.append({"url": job["url"][:500], "title": job["title"][:200], "employer": (job.get("company") or "")[:120],
                          "kind": "job_ad", "grounded": True, "posted": job.get("posted"), "quotes": quotes})
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
              drop_added: set[str] = frozenset(), ads_read: int | None = None) -> dict:
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
    read = ads_read if ads_read is not None else len({p["url"] for p in pages})
    needed = max(ADD_MIN_ADS, math.ceil(ADD_SHARE * read))
    added = [{"skill_id": s, "job_ads": out[s]["job_ads"]} for s in out
             if s not in own and s not in drop_added and out[s]["job_ads"] >= needed]
    names = sorted(({"name": n, "count": len(urls)} for n, urls in other.items()), key=lambda x: (-x["count"], x["name"]))
    return {"skills": out, "added": added, "not_in_catalogue": names}


def search_role(role: dict, skills: dict, *, fetch: Fetch = ads.for_role, today: dt.date | None = None) -> dict:
    """Read the role's newest real ads and aggregate. Raises if the ads cannot be fetched."""
    jobs = fetch(role["id"], MAX_ADS)
    pages = _dedupe(pages_from_ads(jobs, skills))
    read = len({(j["title"].casefold().strip(), (j.get("company") or "").casefold().strip()) for j in jobs})  # reposts once
    return {"role_id": role["id"], "title": role["title"], "searched": str(today or dt.date.today()),
            "widened": False, "ads_read": read, "sources": pages,
            "summary": aggregate(role, pages, skills, ads_read=read)}
