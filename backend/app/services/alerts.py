"""Weekly digest and job alerts by email, for people who logged in with Google and ticked "Email me".

Job ads come from the Malaysian postings the role page already shows (freehire.me via
services/openings.py): ads whose title names the destination role, in the person's state (or with no
state given, or anywhere when they chose "Anywhere in Malaysia"). Each ad is emailed once.

Unsubscribe links carry an HMAC of the profile ID and what to stop, signed with CRON_SECRET, so
they work with one click and no login.
"""

import datetime as dt
import hashlib
import hmac
import html
import re
from urllib.parse import quote

from app import mailer, store
from app.config import get_settings
from app.reference import Reference
from app.services import openings, pathway, progress, replan
from app.services.emailtext import STATES, say, state_name
from app.services.scenario import outlook, signals_from_snapshot

MAX_JOBS = 8
DIGEST_GAP_DAYS = 6  # a re-run of the weekly job in the same week sends nothing twice

# Cities that name a state in job-ad locations. A location naming no state counts as "not stated".
_PLACES: dict[str, tuple[str, ...]] = {
    "johor": ("johor", "johor bahru", "iskandar", "batu pahat", "muar", "kluang", "pasir gudang"),
    "kedah": ("kedah", "alor setar", "sungai petani", "kulim", "langkawi"),
    "kelantan": ("kelantan", "kota bharu"),
    "melaka": ("melaka", "malacca"),
    "negeri_sembilan": ("negeri sembilan", "seremban", "nilai", "port dickson"),
    "pahang": ("pahang", "kuantan", "bentong", "genting"),
    "perak": ("perak", "ipoh", "taiping", "teluk intan"),
    "perlis": ("perlis", "kangar"),
    "pulau_pinang": ("penang", "pulau pinang", "george town", "georgetown", "bayan lepas", "butterworth", "bukit mertajam", "seberang perai"),
    "sabah": ("sabah", "kota kinabalu", "sandakan", "tawau"),
    "sarawak": ("sarawak", "kuching", "miri", "sibu", "bintulu"),
    "selangor": ("selangor", "petaling jaya", "shah alam", "subang", "klang", "cyberjaya", "puchong", "kajang", "bangi",
                 "sepang", "rawang", "seri kembangan", "damansara", "ampang", "cheras"),
    "terengganu": ("terengganu", "kuala terengganu", "kemaman"),
    "kuala_lumpur": ("kuala lumpur", "wilayah persekutuan kuala lumpur", "kl sentral", "bangsar", "mont kiara", "bukit bintang"),
    "labuan": ("labuan",),
    "putrajaya": ("putrajaya",),
}
_PATTERNS = {state: re.compile(r"\b(" + "|".join(re.escape(p) for p in places) + r")\b", re.I)
             for state, places in _PLACES.items()}
_KL = re.compile(r"\bKL\b")


def states_in(location: str | None) -> set[str]:
    text = location or ""
    found = {state for state, pattern in _PATTERNS.items() if pattern.search(text)}
    if _KL.search(text):
        found.add("kuala_lumpur")
    return found


def matches_state(location: str | None, state: str | None) -> bool:
    if not state or state == "anywhere":
        return True
    found = states_in(location)
    return not found or state in found


def job_key(posting: dict) -> str:
    return hashlib.sha256(posting["url"].encode()).hexdigest()[:24]


# --- one-click unsubscribe --------------------------------------------------------------------------

def _sign(profile_id: str, kind: str) -> str:
    key = hashlib.sha256(("laluan-unsubscribe:" + get_settings().cron_secret).encode()).digest()
    return hmac.new(key, f"{profile_id}:{kind}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_token(profile_id: str, kind: str) -> str:
    return f"{profile_id}.{kind}.{_sign(profile_id, kind)}"


def read_token(token: str) -> tuple[str, str] | None:
    """(profile_id, kind) for a genuine token, else None. kind is "all" or "alerts"."""
    parts = token.split(".")
    if len(parts) != 3 or parts[1] not in ("all", "alerts") or not get_settings().cron_secret:
        return None
    profile_id, kind, signature = parts
    return (profile_id, kind) if hmac.compare_digest(signature, _sign(profile_id, kind)) else None


def links(profile_id: str, kind: str) -> tuple[str, str]:
    """(page link for the email body, one-click POST link for the List-Unsubscribe header)."""
    settings = get_settings()
    token = quote(unsubscribe_token(profile_id, kind))
    return f"{settings.app_url}/?unsubscribe={token}", f"{settings.public_api_url}/api/email/unsubscribe?token={token}"


# --- content ----------------------------------------------------------------------------------------

def new_jobs(ref: Reference, settings: dict, role_id: str) -> list[dict] | None:
    postings = openings.all_titled(role_id) if role_id in openings.lookups() else []
    if postings is None:
        return None  # freehire unavailable: try again next run, nothing marked as sent
    sent = store.sent_job_keys(settings["profile_id"])
    fresh = [p for p in postings if job_key(p) not in sent and matches_state(p.get("location"), settings.get("state"))]
    return fresh[:MAX_JOBS]


def forecast_change(ref: Reference, role_id: str, since_days: int = 7) -> dict | None:
    """The destination's Baseline outlook if the latest forecast moved it within the last week."""
    adoption = float(ref.scenarios["baseline"]["adoption"])
    points = []
    for snap in ref.snapshots:
        signal = signals_from_snapshot(snap).get(role_id)
        if signal is not None:
            points.append((snap["imported"], outlook(signal, "baseline", adoption).index))
    if len(points) < 2 or points[-1][1] == points[-2][1]:
        return None
    imported = points[-1][0]
    if (progress.today() - dt.date.fromisoformat(imported[:10])).days > since_days:
        return None
    return {"date": imported[:10], "before": points[-2][1], "after": points[-1][1]}


def _signed(x: float) -> str:
    return f"{'+' if x > 0 else ''}{x:g}"


def _job_line(posting: dict, lang: str) -> tuple[str, str]:
    where = posting.get("location") or say("no_state", lang)
    company = f" · {posting['company']}" if posting.get("company") else ""
    text = f"- {posting['title']}{company} · {where}\n  {posting['url']}"
    item = (f'<li><a href="{html.escape(posting["url"])}">{html.escape(posting["title"])}</a>'
            f"{html.escape(company)} · {html.escape(where)}</li>")
    return text, item


def _wrap(lang: str, title: str, paragraphs: list[str], html_blocks: list[str], footer: str, unsubscribe: tuple[str, str]) -> tuple[str, str]:
    app = get_settings().app_url
    text = "\n\n".join([title, *paragraphs, f"{say('open', lang)}: {app}", footer, f"{unsubscribe[0]}: {unsubscribe[1]}"])
    body = "".join(html_blocks)
    page = (f'<!doctype html><html lang="{lang}"><body style="margin:0;background:#F7F5EF;font-family:Arial,sans-serif;color:#10241F">'
            f'<div style="max-width:560px;margin:0 auto;padding:24px">'
            f'<div style="background:#fff;border-radius:24px;padding:24px">'
            f'<h1 style="font-size:22px;margin:0 0 12px">{html.escape(title)}</h1>{body}'
            f'<p style="margin:20px 0 0"><a href="{html.escape(app)}" style="display:inline-block;background:#0B5B4F;color:#fff;'
            f'padding:12px 20px;border-radius:14px;text-decoration:none;font-weight:bold">{html.escape(say("open", lang))}</a></p>'
            f'</div><p style="font-size:12px;color:#5A6B66;margin:16px 8px">{html.escape(footer)}<br>'
            f'<a href="{html.escape(unsubscribe[1])}" style="color:#5A6B66">{html.escape(unsubscribe[0])}</a></p>'
            f"</div></body></html>")
    return text, page


def build_digest(ref: Reference, settings: dict, profile: dict) -> tuple[str, str, str, list[str]]:
    """(subject, text, html, job keys to mark as sent)."""
    lang = settings["language"]
    name = (profile.get("display_name") or "").replace("(demo)", "").strip()
    hello = say("hello_name", lang, name=name) if name else say("hello", lang)
    paragraphs, blocks, keys = [hello], [f"<p>{html.escape(hello)}</p>"], []

    def add(line: str):
        paragraphs.append(line)
        blocks.append(f"<p>{html.escape(line)}</p>")

    role_id = profile.get("target_role_id")
    if not role_id or role_id not in ref.roles:
        add(say("no_destination", lang))
    else:
        role = ref.roles[role_id]["title"]
        summary = progress.summary(ref, profile)
        add(say("ready", lang, n=round((summary["readiness"] or 0) * 100), role=role))
        if summary["status"] and summary["target_date"]:
            add(say("status", lang, status=say(summary["status"], lang), date=summary["target_date"]))
        week = summary["week"]
        add(say("week", lang, done=week["hours_done"], target=week["target"]) if week["target"]
            else say("week_no_target", lang, done=week["hours_done"]))
        plan = pathway.build(ref, profile, role_id, summarize=False)
        upcoming = next((s for s in plan["steps"] if not s["done"]), None)
        if upcoming:
            course = upcoming["course"]
            line = say("next_course", lang, course=course["title"], provider=course["provider"], hours=course["hours"])
            paragraphs.append(f"{line}\n{course['url']}")
            blocks.append(f'<p>{html.escape(line)} <a href="{html.escape(course["url"])}">↗</a></p>')
        moved = replan.compare(ref, profile)
        fresh = moved["changed"] and (progress.today() - dt.date.fromisoformat(moved["to_snapshot"]["imported"])).days <= 7
        if fresh:  # automatic re-planning: say what the new forecast changed, suggest, never switch
            if moved["moves"]:
                add(say("replan", lang, moves=", ".join(f"{m['title']} #{m['before']} → #{m['after']}" for m in moved["moves"][:3])))
            d = moved["destination"]
            if d and d["rank_before"] != d["rank_after"]:
                add(say("replan_dest", lang, role=d["title"], before=d["rank_before"], after=d["rank_after"]))
            if moved["new_top"]:
                add(say("replan_top", lang, role=moved["new_top"]["title"]))
        change = forecast_change(ref, role_id)
        if change:
            add(say("forecast", lang, date=change["date"], role=role, before=_signed(change["before"]), after=_signed(change["after"])))
        if settings["alerts"] != "off":
            jobs = new_jobs(ref, settings, role_id)  # None: the job-ad source is down, so say nothing this week
            where = "" if settings.get("state") in (None, "anywhere") else say("where", lang, state=state_name(settings["state"], lang))
            if jobs:
                lines = [_job_line(j, lang) for j in jobs]
                title = say("jobs_title", lang, role=role, where=where)
                paragraphs.append(title + "\n" + "\n".join(t for t, _ in lines) + "\n" + say("jobs_source", lang))
                blocks.append(f"<p><strong>{html.escape(title)}</strong></p><ul>{''.join(i for _, i in lines)}</ul>"
                              f'<p style="font-size:12px;color:#5A6B66">{html.escape(say("jobs_source", lang))}</p>')
                keys = [job_key(j) for j in jobs]
            elif jobs is not None:
                add(say("no_jobs", lang, role=role))
    text, page = _wrap(lang, say("digest_subject", lang), paragraphs, blocks, say("footer", lang),
                       (say("unsubscribe", lang), links(profile["id"], "all")[0]))
    return say("digest_subject", lang), text, page, keys


def build_alert(ref: Reference, settings: dict, profile: dict, jobs: list[dict]) -> tuple[str, str, str]:
    lang = settings["language"]
    role = ref.roles[profile["target_role_id"]]["title"]
    where = "" if settings.get("state") in (None, "anywhere") else say("where", lang, state=state_name(settings["state"], lang))
    intro = say("alerts_intro", lang, n=len(jobs), role=role, where=where)
    lines = [_job_line(j, lang) for j in jobs]
    paragraphs = [intro, "\n".join(t for t, _ in lines), say("jobs_source", lang)]
    blocks = [f"<p>{html.escape(intro)}</p><ul>{''.join(i for _, i in lines)}</ul>",
              f'<p style="font-size:12px;color:#5A6B66">{html.escape(say("jobs_source", lang))}</p>']
    subject = say("alerts_subject", lang, role=role)
    text, page = _wrap(lang, subject, paragraphs, blocks, say("alerts_footer", lang),
                       (say("stop_alerts", lang), links(profile["id"], "alerts")[0]))
    return subject, text, page


# --- the scheduled runs ----------------------------------------------------------------------------

def _recent(stamp: str | None, days: float) -> bool:
    if not stamp:
        return False
    then = dt.datetime.fromisoformat(stamp)
    return (dt.datetime.now(dt.UTC) - then).total_seconds() < days * 86400


def _owned(settings: dict) -> dict | None:
    """The profile, only while it still belongs to the account that opted in."""
    profile = store.get_profile(settings["profile_id"])
    return profile if profile and profile["user_id"] == settings["user_id"] else None


def run_weekly(ref: Reference) -> dict:
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    for settings in store.list_email_settings():
        profile = _owned(settings)
        if not settings["digest"] or profile is None or _recent(settings["last_digest_at"], DIGEST_GAP_DAYS):
            counts["skipped"] += 1
            continue
        try:
            subject, text, page, keys = build_digest(ref, settings, profile)
            mailer.send(mailer.build(settings["email"], subject, text, page, links(profile["id"], "all")[1]))
        except Exception:
            counts["failed"] += 1
            continue
        store.add_sent_jobs(profile["id"], keys)
        store.mark_emailed(profile["id"], "last_digest_at")
        counts["sent"] += 1
    return counts


def run_alerts(ref: Reference) -> dict:
    counts = {"sent": 0, "skipped": 0, "failed": 0}
    for settings in store.list_email_settings():
        profile = _owned(settings)
        role_id = profile.get("target_role_id") if profile else None
        if settings["alerts"] != "instant" or not role_id or role_id not in ref.roles:
            counts["skipped"] += 1
            continue
        jobs = new_jobs(ref, settings, role_id)
        if not jobs:
            counts["skipped"] += 1
            continue
        try:
            subject, text, page = build_alert(ref, settings, profile, jobs)
            mailer.send(mailer.build(settings["email"], subject, text, page, links(profile["id"], "alerts")[1]))
        except Exception:
            counts["failed"] += 1
            continue
        store.add_sent_jobs(profile["id"], [job_key(j) for j in jobs])
        store.mark_emailed(profile["id"], "last_alert_at")
        counts["sent"] += 1
    return counts


STATE_IDS = tuple(STATES)
