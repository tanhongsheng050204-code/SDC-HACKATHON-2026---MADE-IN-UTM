"""HTTP routes. Screens and the endpoints they call are listed in docs/03-APP_FLOW.md."""

import hmac

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError

from app import store
from app.auth import current_user
from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.schemas import (CardRequest, CheckAnswers, CheckStart, ClaimRequest, CoachRequest, CompleteRequest, ExtractRequest, IntakeTurnRequest, ProfileIn, ReviewDecision,
                         Scenario, SnapshotIn, WorkforceRequest)
from app.services.scenario import outlook, signals_from_snapshot
from app.services import (cards, coach, documents, intake, matching, pathway, proofcheck, skills, skilltree, tasks,
                          workforce)
from app.trends import refresh, review

router = APIRouter(prefix="/api")


def _profile_for(profile_id: str, user_id: str | None) -> dict:
    """The profile, if this caller may use it. A profile saved to an account answers only to
    that account; anonymous and demo profiles answer to anyone holding their random ID. Someone
    else's profile looks exactly like a missing one."""
    profile = store.get_profile(profile_id)
    if profile is None or (profile["user_id"] is not None and profile["user_id"] != user_id):
        raise HTTPException(404, "Profile not found")
    return profile


User = Depends(current_user)


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


@router.get("/eval/cvs")
def evaluation_cvs():
    """The five synthetic CVs for the human evaluation (all invented; see data/eval/README.md).
    Only the text: the app's own extraction is not sent, so the person marking is not led by it."""
    folder = get_settings().data_dir / "eval"
    return [{"name": p.name, "text": p.read_text(encoding="utf-8")} for p in sorted(folder.glob("cv*.txt"))]


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


@router.get("/signals/pending")
def pending_snapshots(x_admin_token: str = Header(default="")):
    """New snapshots waiting for an admin's decision."""
    _require_admin(x_admin_token)
    return review.list_pending()


@router.get("/signals/pending/{snapshot_id}")
def pending_preview(snapshot_id: str, x_admin_token: str = Header(default="")):
    """Which roles would move, and by how much, if this snapshot were approved."""
    _require_admin(x_admin_token)
    try:
        return review.preview(snapshot_id)
    except review.NotFound:
        raise HTTPException(404, "No snapshot waiting with that ID") from None


@router.post("/signals/pending/{snapshot_id}/approve")
def approve_snapshot(snapshot_id: str, body: ReviewDecision, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    try:
        return review.approve(snapshot_id, body.reviewer)
    except review.NotFound:
        raise HTTPException(404, "No snapshot waiting with that ID") from None


@router.post("/signals/pending/{snapshot_id}/reject")
def reject_snapshot(snapshot_id: str, body: ReviewDecision, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    try:
        return review.reject(snapshot_id, body.reviewer, body.reason or "")
    except review.NotFound:
        raise HTTPException(404, "No snapshot waiting with that ID") from None


@router.get("/radar")
def radar(profile_id: str | None = None, user: str | None = User):
    """Future Skills Radar: which skills and roles are rising or declining, with sources."""
    ref = get_reference()
    snapshot = ref.latest_snapshot
    mine = matching.effective_skills(ref, _profile_for(profile_id, user)) if profile_id else set()
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
    taken = {s["snapshot_id"] for s in ref.snapshots}
    if snapshot["snapshot_id"] in taken or store.get_snapshot(snapshot["snapshot_id"]):
        raise HTTPException(409, "Snapshot already exists")
    store.save_snapshot(snapshot, "approved")
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


# --- account ---------------------------------------------------------------------------------

def _require_user(user: str | None) -> str:
    if user is None:
        raise HTTPException(401, "Please log in")
    return user


@router.get("/me")
def me(user: str | None = User):
    owned = store.profile_for_user(_require_user(user))
    return {"user_id": user, "profile_id": owned["id"] if owned else None}


@router.post("/me/claim")
def claim_profile(body: ClaimRequest, user: str | None = User):
    """Save this browser's anonymous profile to the account. If the account already has a
    different one, nothing changes unless the person chose to replace it: never a silent loss."""
    user = _require_user(user)
    profile = store.get_profile(body.profile_id)
    owned = store.profile_for_user(user)
    if owned is not None and profile is not None and owned["id"] == profile["id"]:
        return {"profile_id": owned["id"]}
    if profile is None or profile["user_id"] is not None or profile["is_demo"]:
        raise HTTPException(404, "Profile not found")
    if owned is not None:
        if not body.replace:
            raise HTTPException(409, {"existing_profile_id": owned["id"]})
        store.delete_profile(owned["id"])
    store.attach_user(profile["id"], user)
    return {"profile_id": profile["id"]}


# --- profiles --------------------------------------------------------------------------------

@router.post("/profiles", status_code=201)
def create_profile(body: ProfileIn):
    return store.create_profile(body.display_name, body.current_role_id, body.skills, body.experience_years)


@router.post("/profiles/demo/{key}", status_code=201)
def create_demo_profile(key: str):
    demo = get_reference().demo_profiles.get(key)
    if demo is None:
        raise HTTPException(404, "Unknown demo profile")
    profile = store.create_profile(demo["display_name"], demo["current_role_id"],
                                   demo["skills"], demo.get("experience_years"),
                                   is_demo=True)
    return {**profile, "story": demo["story"]}


@router.get("/profiles/{profile_id}")
def get_profile(profile_id: str, user: str | None = User):
    return _profile_for(profile_id, user)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: str, body: ProfileIn, user: str | None = User):
    _profile_for(profile_id, user)
    profile = store.update_profile(profile_id, body.display_name, body.current_role_id,
                                   body.skills, body.experience_years)
    if profile is None:
        raise HTTPException(404, "Profile not found")
    return profile


@router.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: str, user: str | None = User):
    _profile_for(profile_id, user)
    if not store.delete_profile(profile_id):
        raise HTTPException(404, "Profile not found")


@router.get("/profiles/{profile_id}/matches")
def profile_matches(profile_id: str, scenario: Scenario = "baseline", year: int | None = None,
                    user: str | None = User):
    return matching.match(get_reference(), _profile_for(profile_id, user), scenario, year)


@router.post("/profiles/{profile_id}/complete")
def complete_course(profile_id: str, body: CompleteRequest, user: str | None = User):
    """Mark a pathway course finished (or not). Its skills then count as covered."""
    profile = _profile_for(profile_id, user)
    if body.course_id not in {c["id"] for c in get_reference().courses}:
        raise HTTPException(422, "Unknown course")
    done = [c for c in profile["completed_courses"] if c != body.course_id]
    if body.done:
        done.append(body.course_id)
    return store.set_completed(profile_id, done)


@router.post("/profiles/{profile_id}/cards", status_code=201)
def create_card(profile_id: str, body: CardRequest, user: str | None = User):
    """A Future Card: a read-only link to a summary of this person's move to one role."""
    _profile_for(profile_id, user)
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


@router.post("/coach")
def ask_coach(body: CoachRequest, user: str | None = User):
    """A cited answer about the person's own results, plus at most one change they can apply."""
    ref = get_reference()
    if body.role_id is not None and body.role_id not in ref.roles:
        raise HTTPException(422, "Unknown role")
    return coach.answer(ref, _profile_for(body.profile_id, user), body.question, body.scenario, body.role_id)


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


@router.get("/profiles/{profile_id}/tree")
def profile_tree(profile_id: str, role: str = Query(...), user: str | None = User):
    """The skill tree toward one role: prerequisites below, proven levels on each node."""
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return skilltree.build(ref, _profile_for(profile_id, user), role)


@router.post("/profiles/{profile_id}/skills/{skill_id}/checks", status_code=201)
def start_check(profile_id: str, skill_id: str, body: CheckStart, user: str | None = User):
    """Three fresh questions for the next level of one skill. The answers stay on the server."""
    ref = get_reference()
    profile = _profile_for(profile_id, user)
    if skill_id not in ref.skills:
        raise HTTPException(404, "Skill not found")
    level = (profile["skill_levels"].get(skill_id) or 0) + 1
    if level > len(ref.skill_levels):
        raise HTTPException(409, "Already at Advanced")
    if not skilltree.is_unlocked(ref, profile, skill_id):
        raise HTTPException(409, "Unlock the skills below first")
    if not profile["is_demo"] and store.attempted_today(profile_id, skill_id, level):
        raise HTTPException(429, "You can try this level again tomorrow")
    try:
        questions = proofcheck.generate(ref, skill_id, level, body.language)
    except proofcheck.Unavailable as error:  # nothing stored, so today's attempt is not used up
        raise HTTPException(503, str(error)) from None
    check_id = store.create_check(profile_id, skill_id, level, questions)
    return {"check_id": check_id, "skill_id": skill_id, "level": level,
            "level_name": ref.skill_levels[level - 1]["name"],
            "questions": [{"prompt": q["prompt"], "options": q["options"]} for q in questions]}


@router.post("/checks/{check_id}")
def submit_check(check_id: str, body: CheckAnswers, user: str | None = User):
    ref = get_reference()
    profile = _profile_for(body.profile_id, user)
    check = store.get_check(check_id)
    if check is None or check["profile_id"] != profile["id"]:
        raise HTTPException(404, "Check not found")
    correct, passed = proofcheck.grade(check["questions"], body.answers)
    if not store.submit_check(check_id, correct, passed):
        raise HTTPException(409, "This check was already marked")
    if passed:
        store.set_skill_level(profile["id"], check["skill_id"], check["level"])
    return {"passed": passed, "correct": correct, "level": check["level"],
            "level_name": ref.skill_levels[check["level"] - 1]["name"],
            "answers": [q["answer"] for q in check["questions"]],
            "explanations": [q["explanation"] for q in check["questions"]],
            "course": None if passed else skilltree.course_for(ref, check["skill_id"])}


@router.get("/profiles/{profile_id}/pathway")
def profile_pathway(profile_id: str, role: str = Query(...), user: str | None = User):
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return pathway.build(ref, _profile_for(profile_id, user), role)
