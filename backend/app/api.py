"""HTTP routes. Screens and the endpoints they call are listed in docs/03-APP_FLOW.md."""

import hmac
import json

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError

from app import store
from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.schemas import (CardRequest, CompleteRequest, ExtractRequest, IntakeTurnRequest, ProfileIn, Scenario,
                         SnapshotIn, WorkforceRequest)
from app.services.scenario import outlook, signals_from_snapshot
from app.services import cards, documents, intake, matching, pathway, skills, tasks, workforce
from app.trends import refresh

router = APIRouter(prefix="/api")


def _profile_or_404(profile_id: str) -> dict:
    profile = store.get_profile(profile_id)
    if profile is None:
        raise HTTPException(404, "Profile not found")
    return profile


@router.get("/health")
def health():
    ref = get_reference()
    return {
        "status": "ok",
        "llm_mode": get_settings().llm_mode,
        "llm_model": get_settings().llm_model_label,
        "snapshot": ref.latest_snapshot["snapshot_id"],
        "snapshot_imported": ref.latest_snapshot["imported"],
    }


# --- reference data -------------------------------------------------------------------------

@router.get("/skills")
def list_skills():
    return sorted(get_reference().skills.values(), key=lambda s: (s["category"], s["name"]))


@router.get("/roles")
def list_roles():
    return list(get_reference().roles.values())


@router.get("/roles/{role_id}")
def role_detail(role_id: str):
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    role = ref.roles[role_id]
    return {
        **role,
        "sdgs": [{**ref.sdgs[t["sdg"]], "reason": t["reason"]} for t in ref.role_sdgs(role_id)],
        "skill_sdgs": {
            rs["skill_id"]: [{**ref.sdgs[t["sdg"]], "reason": t["reason"]}
                             for t in ref.skill_sdgs(rs["skill_id"])]
            for rs in role["skills"] if ref.skill_sdgs(rs["skill_id"])
        },
    }


@router.get("/roles/{role_id}/tasks")
def role_tasks(role_id: str, done: str = Query(default="", max_length=2_000)):
    """The role's O*NET tasks with automate / assist / human labels; `done` = ticked task IDs."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    return tasks.for_role(ref, role_id, {d for d in done.split(",") if d})


@router.get("/scenarios")
def list_scenarios():
    return list(get_reference().scenarios.values())


@router.get("/sdgs")
def list_sdgs():
    return list(get_reference().sdgs.values())


@router.get("/signals")
def list_snapshots():
    """Every snapshot, newest first, without the per-role rows."""
    return [{k: v for k, v in s.items() if k != "signals"} | {"signal_count": len(s["signals"])}
            for s in reversed(get_reference().snapshots)]


def _require_admin(token: str) -> None:
    settings = get_settings()
    if not settings.admin_token or not hmac.compare_digest(token, settings.admin_token):
        raise HTTPException(401, "Admin token required")


@router.post("/signals/refresh", status_code=202)
def start_refresh(force: bool = False, x_admin_token: str = Header(default="")):
    """Collect research and job-posting counts and build a new dated snapshot, in the background."""
    _require_admin(x_admin_token)
    if not refresh.start(force):
        raise HTTPException(409, "A refresh is already running")
    return refresh.status()


@router.get("/signals/refresh")
def refresh_status(x_admin_token: str = Header(default="")):
    """Progress and errors of the running refresh: admin only, like starting one."""
    _require_admin(x_admin_token)
    return refresh.status()


@router.get("/radar")
def radar(profile_id: str | None = None):
    """Future Skills Radar: which skills and roles are rising or declining, with sources."""
    ref = get_reference()
    snapshot = ref.latest_snapshot
    mine = matching.effective_skills(ref, _profile_or_404(profile_id)) if profile_id else set()
    baseline = ref.scenarios["baseline"]
    signals = signals_from_snapshot(snapshot)
    roles = sorted(({"role_id": rid, "title": ref.roles[rid]["title"],
                    **vars(outlook(sig, "baseline", float(baseline["adoption"])))}
                   for rid, sig in signals.items()), key=lambda r: -r["index"])
    skills_out = sorted(({**s, "name": ref.skills[s["skill_id"]]["name"], "mine": s["skill_id"] in mine}
                         for s in snapshot.get("skill_signals", [])),
                        key=lambda s: -(s["trend"] if s["trend"] is not None else -9))
    return {
        "snapshot_id": snapshot["snapshot_id"], "imported": snapshot["imported"],
        "source": snapshot["source"], "illustrative": snapshot["illustrative"],
        "inputs": snapshot.get("inputs", []),
        "capability_momentum": [{"id": c["id"], "name": c["name"],
                                 "momentum": snapshot.get("capability_momentum", {}).get(c["id"])}
                                for c in ref.capabilities],
        "skills": skills_out,
        "roles": roles,
    }


@router.post("/signals/import", status_code=201)
def import_snapshot(body: dict, x_admin_token: str = Header(default="")):
    settings = get_settings()
    _require_admin(x_admin_token)  # before validation, so strangers learn nothing about the format
    try:
        snapshot = SnapshotIn.model_validate(body).model_dump(exclude_none=True)
    except ValidationError as error:
        raise HTTPException(422, error.errors(include_url=False, include_input=False)) from error
    ref = get_reference()
    if snapshot["imported"] <= ref.latest_snapshot["imported"]:
        raise HTTPException(422, "imported date must be later than the latest snapshot")
    for s in snapshot["signals"]:
        if s["role_id"] not in ref.roles:
            raise HTTPException(422, f"Unknown role in signals: {s['role_id']}")
    folder = (settings.data_dir / "signals").resolve()
    path = (folder / f"{snapshot['snapshot_id']}.json").resolve()
    if path.parent != folder:  # belt and braces: the ID pattern already rules this out
        raise HTTPException(422, "Invalid snapshot_id")
    if path.exists():
        raise HTTPException(409, "Snapshot already exists")
    path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    reload_reference()
    return {"snapshot_id": snapshot["snapshot_id"]}


# --- intake ----------------------------------------------------------------------------------

@router.post("/intake/extract")
def extract_skills(body: ExtractRequest):
    """CV text in, skill IDs out. The text is scrubbed and never stored."""
    return skills.extract(body.text)


@router.post("/intake/upload")
async def upload_cv(file: UploadFile = File(...)):
    """A CV file in, skill IDs out. Read in memory, scrubbed before any LLM call, never stored."""
    data = await file.read(documents.MAX_BYTES + 1)
    try:
        text = documents.read_text(file.filename or "", data)
    except documents.UnreadableDocument as error:
        raise HTTPException(422, str(error)) from error
    return {**skills.extract(text), "characters": len(text)}


@router.post("/intake/turn")
def intake_turn(body: IntakeTurnRequest):
    return intake.turn([m.model_dump() for m in body.messages], body.language)


# --- profiles --------------------------------------------------------------------------------

@router.post("/profiles", status_code=201)
def create_profile(body: ProfileIn):
    return store.create_profile(body.display_name, body.current_role_id, body.skills, body.interests,
                                body.experience_years)


@router.post("/profiles/demo/{key}", status_code=201)
def create_demo_profile(key: str):
    demo = get_reference().demo_profiles.get(key)
    if demo is None:
        raise HTTPException(404, "Unknown demo profile")
    profile = store.create_profile(demo["display_name"], demo["current_role_id"],
                                   demo["skills"], demo["interests"], demo.get("experience_years"))
    return {**profile, "story": demo["story"]}


@router.get("/profiles/{profile_id}")
def get_profile(profile_id: str):
    return _profile_or_404(profile_id)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: str, body: ProfileIn):
    profile = store.update_profile(profile_id, body.display_name, body.current_role_id,
                                   body.skills, body.interests, body.experience_years)
    if profile is None:
        raise HTTPException(404, "Profile not found")
    return profile


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: str):
    if not store.delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")


@router.get("/profiles/{profile_id}/matches")
def profile_matches(profile_id: str, scenario: Scenario = "baseline", year: int | None = None):
    return matching.match(get_reference(), _profile_or_404(profile_id), scenario, year)


@router.post("/profiles/{profile_id}/complete")
def complete_course(profile_id: str, body: CompleteRequest):
    """Mark a pathway course finished (or not). Its skills then count as covered."""
    profile = _profile_or_404(profile_id)
    if body.course_id not in {c["id"] for c in get_reference().courses}:
        raise HTTPException(422, "Unknown course")
    done = [c for c in profile["completed_courses"] if c != body.course_id]
    if body.done:
        done.append(body.course_id)
    return store.set_completed(profile_id, done)


@router.post("/profiles/{profile_id}/cards", status_code=201)
def create_card(profile_id: str, body: CardRequest):
    """A Future Card: a read-only link to a summary of this person's move to one role."""
    _profile_or_404(profile_id)
    if body.role_id not in get_reference().roles:
        raise HTTPException(422, "Unknown role")
    return {"card_id": store.create_card(profile_id, body.role_id)}


@router.get("/cards/{card_id}")
def get_card(card_id: str):
    card = store.get_card(card_id)
    profile = store.get_profile(card["profile_id"]) if card else None
    if card is None or profile is None or card["role_id"] not in get_reference().roles:
        raise HTTPException(404, "Card not found")
    return cards.view(get_reference(), profile, card)


@router.get("/workforce/sample", response_class=PlainTextResponse)
def workforce_sample():
    """A synthetic company of 160 people, for trying the HR view."""
    return (get_settings().data_dir / "sample_workforce.csv").read_text(encoding="utf-8")


@router.post("/workforce/analyse")
def workforce_analyse(body: WorkforceRequest):
    try:
        return workforce.analyse(get_reference(), body.csv, body.scenario)
    except workforce.WorkforceError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/profiles/{profile_id}/pathway")
def profile_pathway(profile_id: str, role: str = Query(...)):
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return pathway.build(ref, _profile_or_404(profile_id), role)
