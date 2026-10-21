"""HTTP routes. Screens and the endpoints they call are listed in docs/03-APP_FLOW.md."""

import datetime as dt
import hmac

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError

from app import runpod, store
from app.auth import current_user
from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.schemas import (CardRequest, CheckAnswers, CheckStart, ClaimRequest, InterpretRequest, SurveyIn, CoachRequest, CompleteRequest, ExtractRequest, IntakeTurnRequest, ProfileIn, ReviewDecision, EvidenceDecision, LiveSearchRequest,
                         Scenario, SnapshotIn, WorkforceRequest)
from app.services.scenario import outlook, signals_from_snapshot
from app.services.deid import removed_counts, scrub, scrub_cv
from app.services import (cards, classview, coach, documents, intake, matching, pathway, proofcheck, rolecase, skills, upgrade,
                          skilltree, survey, tasks, tipping, workforce, xray)
from app.trends import refresh, review
from app.evidence import emerging, refresh as evidence_refresh, review as evidence_review

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
        "voice": runpod.voice_available(),
    }


# --- reference data -------------------------------------------------------------------------

@router.get("/skills")
def list_skills():
    return sorted(get_reference().skills.values(), key=lambda s: (s["category"], s["name"]))


@router.get("/programmes")
def programmes():
    """Common Malaysian programmes and the skills they usually teach: a graduate's starting point,
    which they confirm (team-reviewed data)."""
    return [{k: p[k] for k in ("id", "name", "skills")} for p in get_reference().programmes]


@router.get("/translations")
def translations():
    """BM / 中文 for the text in our reference data, keyed by its English wording (AI-drafted)."""
    return get_reference().translations


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
        "sdgs": ref.sdg_view(ref.role_sdgs(role_id)),
        "skill_sdgs": {
            rs["skill_id"]: ref.sdg_view(ref.skill_sdgs(rs["skill_id"]))
            for rs in role["skills"] if ref.skill_sdgs(rs["skill_id"])
        },
    }


@router.get("/roles/{role_id}/day")
def role_day(role_id: str):
    """A day in this job: the reviewed or committed description, in EN / BM / 中文."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    entry = ref.day_in_job.get(role_id)
    if entry is None:
        raise HTTPException(404, "No description for this role yet")
    return {k: entry.get(k) for k in ("role_id", "text", "basis", "drafted", "reviewed_by")}


@router.get("/roles/{role_id}/history")
def role_history(role_id: str, scenario: Scenario = "baseline"):
    """This role's outlook in every forecast Laluan has used, oldest first: how the number moved as
    trend refreshes were approved. Each point names its snapshot, so it can be traced."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    adoption = float(ref.scenarios[scenario]["adoption"])
    points = []
    for snap in ref.snapshots:
        signal = signals_from_snapshot(snap).get(role_id)
        if signal is None:  # a snapshot from before this role was added
            continue
        o = outlook(signal, scenario, adoption)
        points.append({"snapshot_id": snap["snapshot_id"], "imported": snap["imported"], "source": snap["source"],
                       "illustrative": bool(snap.get("illustrative")), "reviewed_by": snap.get("reviewed_by"),
                       "horizon_year": snap["horizon_year"], "index": o.index, "label": o.label})
    return {"role_id": role_id, "scenario": scenario, "points": points}


@router.get("/roles/{role_id}/xray")
def role_xray(role_id: str, scenario: Scenario = "baseline", year: int | None = None,
              adoption: float | None = Query(default=None, ge=0.5, le=2.0)):
    """How this role's outlook number is built, step by step, with sources."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    return xray.explain(ref, role_id, scenario, year, adoption)


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



# --- emerging roles (a prediction; public) -------------------------------------------------------

def _emerging_card(ref, body: dict, have: set[str]) -> dict:
    name = lambda sid: ref.skills[sid]["name"]
    sdg = body.get("sdg")
    return {
        **{k: body[k] for k in ("capability_id", "capability_name", "momentum", "snapshot_id", "searched",
                                "title", "summary", "sources")},
        "reviewed_by": body.get("reviewed_by"), "reviewed_at": body.get("reviewed_at"),
        "carry_over": [{"skill_id": s, "name": name(s)} for s in body["skills"] if s in have],
        "to_learn": [{"skill_id": s, "name": name(s)} for s in body["skills"] if s not in have],
        "stepping_stone": {"role_id": body["stepping_stone"], "title": ref.roles[body["stepping_stone"]]["title"],
                           "reason": body["stepping_reason"]},
        "sdg": {**ref.sdgs[sdg["number"]], "number": sdg["number"], "reason": sdg["reason"]} if sdg else None,
    }


@router.get("/emerging")
def emerging_roles(profile_id: str | None = None, user: str | None = User):
    """Approved emerging-role cards, with the person's carry-over skills when a profile is given."""
    ref = get_reference()
    have = matching.effective_skills(ref, _profile_for(profile_id, user)) if profile_id else set()
    cards = emerging.shown(store.latest_approved_evidence("emerging"))
    return {"label": "prediction", "roles": [_emerging_card(ref, b, have) for b in cards if b["stepping_stone"] in ref.roles]}


@router.post("/emerging/{capability_id}/search")
def emerging_live_search(capability_id: str, body: LiveSearchRequest, user: str | None = User):
    """Current job ads for an emerging title: not reviewed, never scored, limited per profile."""
    _profile_for(body.profile_id, user)
    card = store.latest_approved_evidence("emerging").get(capability_id)
    if card is None:
        raise HTTPException(404, "No emerging role with that ID")
    try:
        return emerging.live_search(card, body.profile_id, get_reference())
    except emerging.RateLimited:
        raise HTTPException(429, "You have searched a lot this hour. Try again later.") from None
    except Exception:
        raise HTTPException(503, "The web search is unavailable right now.") from None

# --- cited skill evidence (admin) ---------------------------------------------------------------

@router.post("/evidence/refresh", status_code=202)
def start_evidence_refresh(mode: str = Query("roles", pattern="^(roles|emerging)$"), x_admin_token: str = Header(default="")):
    """Search Malaysian job ads for every role's skills (mode=roles), or search for emerging roles
    (mode=emerging), in the background, for review."""
    _require_admin(x_admin_token)
    if not evidence_refresh.start(mode):
        raise HTTPException(409, "An evidence search is already running")
    return evidence_refresh.status()


@router.post("/evidence/refresh/stop")
def stop_evidence_refresh(x_admin_token: str = Header(default="")):
    """Cancel the searches not started yet; the ones running finish and are kept for review."""
    _require_admin(x_admin_token)
    if not evidence_refresh.stop():
        raise HTTPException(409, "No evidence search is running")
    return evidence_refresh.status()


@router.get("/evidence/refresh")
def evidence_refresh_status(x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    return evidence_refresh.status()


@router.get("/evidence/pending")
def pending_evidence(kind: str = Query("role", pattern="^(role|emerging|day)$"), x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    return evidence_review.list_pending(kind)


@router.get("/evidence/pending/{evidence_id}")
def pending_evidence_detail(evidence_id: str, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    try:
        return evidence_review.detail(evidence_id)
    except evidence_review.NotFound:
        raise HTTPException(404, "No evidence waiting with that ID") from None


@router.post("/evidence/pending/{evidence_id}/approve")
def approve_evidence(evidence_id: str, body: EvidenceDecision, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    try:
        return evidence_review.approve(evidence_id, body.reviewer, body.drop_sources, body.drop_added)
    except evidence_review.NotFound:
        raise HTTPException(404, "No evidence waiting with that ID") from None


@router.post("/evidence/pending/{evidence_id}/reject")
def reject_evidence(evidence_id: str, body: EvidenceDecision, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    try:
        return evidence_review.reject(evidence_id, body.reviewer, body.reason or "")
    except evidence_review.NotFound:
        raise HTTPException(404, "No evidence waiting with that ID") from None


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


def _preview(text: str) -> dict:
    clean = scrub_cv(text)
    return {"text": clean, "removed": removed_counts(clean), "characters": len(clean)}


@router.post("/intake/preview")
def preview_cv(body: ExtractRequest):
    """What gets sent: the scrubbed text, for the person to check (and edit) before extraction."""
    return _preview(body.text)


@router.post("/intake/upload/preview")
async def preview_upload(file: UploadFile = File(...)):
    """A CV file in, its scrubbed text out. Read in memory, never stored."""
    data = await file.read(documents.MAX_BYTES + 1)
    try:
        return _preview(documents.read_text(file.filename or "", data))
    except documents.UnreadableDocument as error:
        raise HTTPException(422, str(error)) from error


VOICE_MAX_BYTES = 5 * 1024 * 1024  # about five minutes of compressed speech


@router.post("/voice/transcribe")
async def transcribe(audio: UploadFile = File(...), language: str | None = Query(None, pattern="^(en|ms|zh)$")):
    """Speech in, scrubbed text out. The audio is held in memory for one call and never stored or
    logged. 503 when voice is not set up or the worker is cold, so the app falls back to the
    browser's speech recognition, then typing."""
    if not runpod.voice_available():
        raise HTTPException(503, "Voice input is not set up on this server")
    data = await audio.read(VOICE_MAX_BYTES + 1)
    if len(data) > VOICE_MAX_BYTES:
        raise HTTPException(413, "Recording is too long")
    if not data:
        raise HTTPException(422, "Recording is empty")
    try:
        text = runpod.transcribe(data, language)
    except Exception as error:
        raise HTTPException(503, "Voice input is unavailable right now") from error
    return {"text": scrub(text)}


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
        store.replace_owned_profile(owned["id"], profile["id"], user)
        return {"profile_id": profile["id"]}
    try:
        store.attach_user(profile["id"], user)
    except Exception as error:  # another tab claimed for this account a moment earlier
        if "unique" in str(error).lower() or "duplicate" in str(error).lower():
            raise HTTPException(409, {"existing_profile_id": store.profile_for_user(user)["id"]}) from None
        raise
    return {"profile_id": profile["id"]}


# --- profiles --------------------------------------------------------------------------------

@router.post("/profiles", status_code=201)
def create_profile(body: ProfileIn):
    return store.create_profile(body.display_name, body.current_role_id, body.skills, body.experience_years,
                                audience=body.audience)


@router.post("/profiles/demo/{key}", status_code=201)
def create_demo_profile(key: str):
    demo = get_reference().demo_profiles.get(key)
    if demo is None:
        raise HTTPException(404, "Unknown demo profile")
    profile = store.create_profile(demo["display_name"], demo["current_role_id"],
                                   demo["skills"], demo.get("experience_years"),
                                   is_demo=True, audience=demo.get("audience"))
    answers = demo.get("survey_answers") or []
    if answers:  # demos arrive with the survey done, so the preference line shows for judges
        store.save_survey(profile["id"], answers)
        store.set_preferences(profile["id"], survey.preferences(get_reference(), answers))
        profile = store.get_profile(profile["id"])
    return {**profile, "story": demo["story"]}


@router.get("/profiles/{profile_id}")
def get_profile(profile_id: str, user: str | None = User):
    return _profile_for(profile_id, user)


@router.put("/profiles/{profile_id}")
def update_profile(profile_id: str, body: ProfileIn, user: str | None = User):
    _profile_for(profile_id, user)
    profile = store.update_profile(profile_id, body.display_name, body.current_role_id,
                                   body.skills, body.experience_years, body.audience)
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
                    adoption: float | None = Query(default=None, ge=0.5, le=2.0),
                    extra: str = Query(default="", max_length=600), user: str | None = User):
    """`extra`: skills to try on ("What if I learn...?"), comma-separated, at most 10. Not saved."""
    ref = get_reference()
    tried = [s for s in dict.fromkeys(extra.split(",")) if s]
    if len(tried) > 10 or any(s not in ref.skills for s in tried):
        raise HTTPException(422, "Choose up to 10 known skills to try")
    return matching.match(ref, _profile_for(profile_id, user), scenario, year, adoption, frozenset(tried))


@router.get("/profiles/{profile_id}/tipping")
def profile_tipping(profile_id: str, year: int | None = None, user: str | None = User):
    """Where, on the AI-adoption slider, this person's picture changes."""
    return tipping.find(get_reference(), _profile_for(profile_id, user), year)


@router.get("/profiles/{profile_id}/ai-assisted")
def ai_assisted(profile_id: str, user: str | None = User):
    """Your job, with AI: the person's current role with AI skills added, before any move. 404 when
    they have no current role, or it is an AI job already."""
    ref = get_reference()
    result = upgrade.for_profile(ref, _profile_for(profile_id, user))
    if result is None:
        raise HTTPException(404, "No AI-assisted version for this profile")
    return result


@router.get("/profiles/{profile_id}/roles/{role_id}/case")
def profile_role_case(profile_id: str, role_id: str, user: str | None = User):
    """What speaks for this role and what could go wrong for this person, each with its source."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    return rolecase.case(ref, _profile_for(profile_id, user), role_id)


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
    hour_ago = (dt.datetime.now(dt.UTC) - dt.timedelta(hours=1)).isoformat(timespec="seconds")
    if store.checks_started_since(profile_id, hour_ago) >= proofcheck.STARTS_PER_HOUR:
        raise HTTPException(429, "That's a lot of checks in one hour. Take a break and try again later.")
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
            "course": None if passed else skilltree.course_for(ref, check["skill_id"]),
            # A pass shows how the proven skill serves the Sustainable Development Goals.
            "sdgs": ref.sdg_view(ref.skill_sdgs(check["skill_id"])) if passed else []}


@router.get("/profiles/{profile_id}/survey")
def survey_cards(profile_id: str, user: str | None = User):
    """8-10 cards about real tasks and settings from the roles this person matches."""
    ref = get_reference()
    cards_ = survey.pick_cards(ref, _profile_for(profile_id, user))
    return {"cards": [{"id": c["id"], "text": c["text"], "role_ids": c["role_ids"]} for c in cards_],
            "dimensions": ref.work_dimensions}


@router.get("/survey/bank")
def survey_bank():
    """Every survey card and dimension label, for the review kit's translation check."""
    ref = get_reference()
    return {"cards": list(ref.survey_cards.values()), "dimensions": ref.work_dimensions}


@router.post("/survey/interpret")
def survey_interpret(body: InterpretRequest):
    """How we read a free-text answer. Nothing is saved; the person confirms before it counts."""
    return survey.interpret(get_reference(), body.text, body.language)


@router.post("/profiles/{profile_id}/survey")
def survey_submit(profile_id: str, body: SurveyIn, user: str | None = User):
    ref = get_reference()
    profile = _profile_for(profile_id, user)
    answers = [{**a.model_dump(exclude_none=True), **({"note": scrub(a.note)} if a.note else {})} for a in body.answers]
    prefs = survey.preferences(ref, answers)
    store.save_survey(profile_id, answers)
    store.set_preferences(profile_id, prefs)
    result = matching.match(ref, {**profile, "preferences": prefs}, "baseline")
    return {"preferences": prefs, "summary": survey.summary(ref, prefs, body.language, len(answers)), "also_like": result["also_like"]}


@router.get("/class/sample", response_class=PlainTextResponse)
def class_sample():
    """A synthetic class of 40 students in three programmes, for trying the career-centre view."""
    return classview.sample_path().read_text(encoding="utf-8")


@router.post("/class/analyse")
def class_analyse(body: WorkforceRequest):
    try:
        return classview.analyse(get_reference(), body.csv, body.scenario)
    except workforce.WorkforceError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/profiles/{profile_id}/pathway")
def profile_pathway(profile_id: str, role: str = Query(...), user: str | None = User):
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return pathway.build(ref, _profile_for(profile_id, user), role)
