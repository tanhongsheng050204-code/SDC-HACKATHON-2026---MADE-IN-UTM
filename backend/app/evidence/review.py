"""A person approves or rejects each role's evidence, and each emerging role, before anyone sees it.

Before approving, the reviewer can untick citations (a quote that is not on the page, an ad that
is not Malaysian) and proposed added skills; statuses are recomputed without them. The reviewer's
name, the date and what was unticked are stored with the evidence, so each decision can be traced.
"""

import datetime as dt
import re

from app import store
from app.evidence import day
from app.evidence.search import aggregate
from app.reference import get_reference, reload_reference

_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$")


class NotFound(Exception):
    pass


def _pending(evidence_id: str) -> dict:
    if not _ID.match(evidence_id):
        raise NotFound(evidence_id)
    item = store.get_evidence(evidence_id)
    if item is None or item["state"] != "pending":
        raise NotFound(evidence_id)
    return item


def list_pending(kind: str = "role") -> list[dict]:
    if kind == "day":
        roles = get_reference().roles
        return [{"id": i["id"], "kind": "day", "role_id": i["subject"], "title": roles[i["subject"]]["title"],
                 "drafted": i["body"]["drafted"], "basis": i["body"]["basis"]}
                for i in store.list_evidence("pending", "day") if i["subject"] in roles]
    if kind == "emerging":
        return [{"id": i["id"], "kind": "emerging", "subject": i["subject"], "title": i["body"]["title"]["en"],
                 "capability_name": i["body"]["capability_name"], "momentum": i["body"]["momentum"],
                 "searched": i["body"]["searched"], "sources": len(i["body"]["sources"])}
                for i in store.list_evidence("pending", "emerging")]
    skills = get_reference().skills
    out = []
    for item in store.list_evidence("pending", "role"):
        body = item["body"]
        out.append({"id": item["id"], "role_id": item["subject"], "title": body["title"],
                    "searched": body["searched"], "widened": body["widened"],
                    "job_ads": sum(p["kind"] == "job_ad" for p in body["sources"]),
                    "pages": len(body["sources"]), "added": [a["skill_id"] for a in body["summary"]["added"]],
                    "added_names": [skills[a["skill_id"]]["name"] for a in body["summary"]["added"]]})
    return out


def detail(evidence_id: str) -> dict:
    item = _pending(evidence_id)
    ref = get_reference()
    names = {sid: s["name"] for sid, s in ref.skills.items()}
    if item["kind"] == "day":
        return {"id": item["id"], "kind": "day", "role_id": item["subject"],
                "title": ref.roles[item["subject"]]["title"], **item["body"],
                "current": (ref.day_in_job.get(item["subject"]) or {}).get("text")}
    if item["kind"] == "emerging":
        return {"id": item["id"], "kind": "emerging", "subject": item["subject"], **item["body"], "skill_names": names,
                "stepping_stone_title": ref.roles[item["body"]["stepping_stone"]]["title"]}
    return {"id": item["id"], "role_id": item["subject"], **item["body"], "skill_names": names,
            "role_skills": [rs["skill_id"] for rs in ref.roles[item["subject"]]["skills"]
                            if rs.get("source") != "evidence"]}


def _stamp() -> str:
    return dt.datetime.now().replace(microsecond=0).isoformat()


def _base_role(role: dict) -> dict:
    """The catalogue role without skills added by earlier evidence: each approval stands alone."""
    return {**role, "skills": [rs for rs in role["skills"] if rs.get("source") != "evidence"]}


def approve(evidence_id: str, reviewer: str, drop_sources: list[str], drop_added: list[str]) -> dict:
    item = _pending(evidence_id)
    body = item["body"]
    if item["kind"] == "emerging":  # read live from the database; no ranking or reference data changes
        body.update(reviewed_by=reviewer, reviewed_at=_stamp())
        store.decide_evidence(evidence_id, "approved", reviewer, body)
        return {"id": evidence_id, "capability_id": item["subject"]}
    if item["kind"] == "day":  # replaces the file version for this role
        body.update(reviewed_by=reviewer, reviewed_at=_stamp())
        store.decide_evidence(evidence_id, "approved", reviewer, body)
        reload_reference()
        return {"id": evidence_id, "role_id": item["subject"]}
    ref = get_reference()
    body["summary"] = aggregate(_base_role(ref.roles[item["subject"]]), body["sources"], ref.skills,
                                set(drop_sources), set(drop_added))
    dropped = set(drop_sources)
    body["sources"] = [{**p, "quotes": [q for q in p["quotes"] if f"{p['url']}#{q['skill_id']}" not in dropped]}
                       for p in body["sources"] if p["url"] not in dropped]
    body.update(reviewed_by=reviewer, reviewed_at=_stamp(), dropped_sources=drop_sources, dropped_added=drop_added)
    store.decide_evidence(evidence_id, "approved", reviewer, body)
    reload_reference()
    day.queue_in_background(item["subject"], body)  # a richer "day in this job" draft, for review
    return {"id": evidence_id, "role_id": item["subject"], "added": [a["skill_id"] for a in body["summary"]["added"]]}


def reject(evidence_id: str, reviewer: str, reason: str) -> dict:
    item = _pending(evidence_id)
    body = {**item["body"], "rejected_by": reviewer, "rejected_at": _stamp(), "rejected_reason": reason}
    store.decide_evidence(evidence_id, "rejected", reviewer, body, reason)
    return {"id": evidence_id, "role_id": item["subject"]}
