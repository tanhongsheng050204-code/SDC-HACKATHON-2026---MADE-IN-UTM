"""HTTP routes. Screens and the endpoints they call are listed in docs/03-APP_FLOW.md."""

import datetime as dt
import hmac
from typing import Literal

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import ValidationError

from app import ratelimit, runpod, store
from app.auth import current_claims, current_user
from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.schemas import (ActionAnswer, ActionIn, CardRequest, DecisionReasonsIn, ClassIn, CounsellorDecision, CounsellorRequest, EmailSettingsIn, JoinRequest, FeedbackIn, PlanRequest, ProblemIn, UsageIn, CheckAnswers, CheckStart, ClaimRequest, InterpretRequest, SurveyIn, CoachRequest, CompleteRequest, ExtractRequest, IntakeTurnRequest, InterviewRequest, ProfileIn, TargetRequest, ReviewDecision, EvidenceDecision, LiveSearchRequest,
                         Scenario, SnapshotIn, WorkforceRequest)
from app.services.scenario import outlook, signals_from_snapshot
from app.services.deid import removed_counts, scrub, scrub_cv
from app.services import (alerts, cards, checkins, classes, decisions, plancheck, fairness, region, replan, classview, coach, documents, exposure, identity, intake, interview, journey, matching,
                          openings, pathway, progress, proofcheck, rolecase, skills, skilltree, survey, tasks, tipping, upgrade,
                          workforce, xray)
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
        "being_checked": matching.being_checked(role),
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


@router.get("/roles/{role_id}/exposure")
def role_exposure(role_id: str):
    """Published AI-exposure estimates for this role next to Laluan's own, and Malaysian AI use."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    return exposure.for_role(ref, role_id)


@router.get("/exposure/map")
def exposure_map(scenario: Scenario = "baseline"):
    """Every role's published AI exposure against its 2030 outlook."""
    return exposure.map_points(get_reference(), scenario)


@router.get("/malaysia/ai-use")
def malaysia_ai_use():
    """What people in Malaysia use AI for (Anthropic Economic Index, latest month)."""
    return exposure.malaysia_overview(get_reference())


@router.get("/roles/{role_id}/malaysia-programmes")
def role_malaysia_programmes(role_id: str):
    """Malaysian public programmes for this role: MyCOL, MyMahir and Jelajah AI MyMahir (links only)."""
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    p = ref.malaysia_programmes
    mycol = {k: p["mycol"][k] for k in ("name", "publisher", "about", "url", "report_url", "checked")}
    return {"role_id": role_id, "mycol": {**mycol, "entry": p["mycol"]["roles"].get(role_id)},
            "mymahir": p["mymahir"], "jelajah_ai": p["jelajah_ai"]}


@router.get("/roles/{role_id}/postings")
def role_postings(role_id: str):
    """Open jobs in Malaysia for this role (freehire.me), newest first, each linking to the original."""
    if role_id not in get_reference().roles or role_id not in openings.lookups():
        raise HTTPException(404, "Role not found")
    return openings.for_role(role_id)


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
def emerging_live_search(capability_id: str, body: LiveSearchRequest, request: Request, user: str | None = User):
    """Current job ads for an emerging title: not reviewed, never scored, limited per profile."""
    ratelimit.check(request, "search")
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

@router.post("/roles/{role_id}/openings")
def role_openings(role_id: str, body: LiveSearchRequest, request: Request, user: str | None = User):
    """Current Malaysian job ads for this role: found by a live web search, not reviewed, never
    scored; cached per role per day and limited per profile (shared with the emerging-role search)."""
    ratelimit.check(request, "search")
    _profile_for(body.profile_id, user)
    if role_id not in get_reference().roles:
        raise HTTPException(404, "Role not found")
    try:
        return emerging.openings(role_id, body.profile_id, get_reference())
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
    rows = {s["role_id"]: s for s in snapshot["signals"]}
    roles = sorted(({"role_id": rid, "title": ref.roles[rid]["title"],
                    **vars(outlook(sig, "baseline", float(baseline["adoption"]))),
                    "scenarios": {sid: {"index": o.index, "label": o.label}
                                  for sid, s in ref.scenarios.items()
                                  for o in [outlook(sig, sid, float(s["adoption"]))]},
                    "malaysia": rows[rid].get("malaysia_forecast")}
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
        "forecast": snapshot.get("forecast"),
        "scenarios": [{"id": s["id"], "label": s["label"]} for s in ref.scenarios.values()],
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
def extract_skills(body: ExtractRequest, request: Request):
    """CV text in, skill IDs out. The text is scrubbed and never stored."""
    ratelimit.check(request, "cv")
    return skills.extract(body.text)


@router.post("/intake/upload")
async def upload_cv(request: Request, file: UploadFile = File(...)):
    """A CV file in, skill IDs out. Read in memory, scrubbed before any LLM call, never stored."""
    ratelimit.check(request, "cv")
    data = await file.read(documents.MAX_BYTES + 1)
    try:  # OCR of a scan takes seconds of CPU: off the event loop
        text, from_scan = await run_in_threadpool(documents.read, file.filename or "", data)
    except documents.UnreadableDocument as error:
        raise HTTPException(422, str(error)) from error
    return {**skills.extract(text), "characters": len(text), "from_scan": from_scan}


def _preview(text: str, from_scan: bool = False) -> dict:
    clean = scrub_cv(text)
    return {"text": clean, "removed": removed_counts(clean), "characters": len(clean), "from_scan": from_scan}


@router.post("/intake/preview")
def preview_cv(body: ExtractRequest):
    """What gets sent: the scrubbed text, for the person to check (and edit) before extraction."""
    return _preview(body.text)


@router.post("/intake/upload/preview")
async def preview_upload(request: Request, file: UploadFile = File(...)):
    """A CV file in, its scrubbed text out. Read in memory, never stored."""
    ratelimit.check(request, "cv")
    data = await file.read(documents.MAX_BYTES + 1)
    try:  # OCR of a scan takes seconds of CPU: off the event loop
        return _preview(*await run_in_threadpool(documents.read, file.filename or "", data))
    except documents.UnreadableDocument as error:
        raise HTTPException(422, str(error)) from error


VOICE_MAX_BYTES = 5 * 1024 * 1024  # about five minutes of compressed speech


@router.post("/voice/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...), language: str | None = Query(None, pattern="^(en|ms|zh)$")):
    """Speech in, scrubbed text out. The audio is held in memory for one call and never stored or
    logged. 503 when voice is not set up or the worker is cold, so the app falls back to the
    browser's speech recognition, then typing."""
    ratelimit.check(request, "voice")
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
def intake_turn(body: IntakeTurnRequest, request: Request):
    ratelimit.check(request, "intake_turn")
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

PRIVACY_VERSION = "2026-10-22"  # the "Your data" notice a new profile agrees to; bump when it changes


@router.post("/profiles", status_code=201)
def create_profile(body: ProfileIn):
    profile = store.create_profile(body.display_name, body.current_role_id, body.skills, body.experience_years,
                                   audience=body.audience)
    store.add_consent(profile["id"], "profile_storage", PRIVACY_VERSION)
    store.count_usage("onboarding_finished")
    return profile


@router.post("/profiles/demo/{key}", status_code=201)
def create_demo_profile(key: str):
    demo = get_reference().demo_profiles.get(key)
    if demo is None:
        raise HTTPException(404, "Unknown demo profile")
    profile = store.create_profile(demo["display_name"], demo["current_role_id"],
                                   demo["skills"], demo.get("experience_years"),
                                   is_demo=True, audience=demo.get("audience"))
    store.add_consent(profile["id"], "profile_storage", PRIVACY_VERSION)
    store.count_usage("demo_opened")
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


@router.get("/profiles/{profile_id}/export")
def export_profile(profile_id: str, user: str | None = User):
    """Everything stored about this profile, as one JSON file (data rights: access and portability)."""
    profile = _profile_for(profile_id, user)
    body = {"exported_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
            "about": "Everything Laluan stores about this profile. CV text, chats, voice and interview answers "
                     "are never stored, so they are not here.",
            "profile": profile, **store.export_rows(profile_id)}
    return JSONResponse(body, headers={"Content-Disposition": f'attachment; filename="laluan-my-data-{profile_id[:8]}.json"'})


@router.put("/profiles/{profile_id}/target")
def set_target(profile_id: str, body: TargetRequest, user: str | None = User):
    """Choose the role you are aiming for (or clear it). Pathway and practice follow it."""
    before = _profile_for(profile_id, user)
    if body.role_id is not None and body.role_id not in get_reference().roles:
        raise HTTPException(422, "Unknown role")
    profile = store.set_target(profile_id, body.role_id)
    if body.role_id is not None and body.role_id != before.get("target_role_id"):  # the same choice again is not a restart
        progress.record(get_reference(), profile_id, "destination_set", body.role_id)
        decisions.record(get_reference(), profile_id, body.role_id)
        store.count_usage("destination_set")
    return profile


@router.get("/profiles/{profile_id}/decision")
def profile_decision(profile_id: str, user: str | None = User):
    """Why the destination was chosen (the facts shown then and the reasons ticked), and the same
    facts under the newest forecast. Null before a destination is chosen."""
    return decisions.compare(get_reference(), _profile_for(profile_id, user))


@router.put("/profiles/{profile_id}/decision/reasons")
def set_decision_reasons(profile_id: str, body: DecisionReasonsIn, user: str | None = User):
    profile = _profile_for(profile_id, user)
    if any(r not in decisions.REASONS for r in body.reasons):
        raise HTTPException(422, "Unknown reason")
    latest = decisions.latest(profile)
    if latest is None:
        raise HTTPException(404, "No destination chosen yet")
    store.set_decision_reasons(latest["id"], list(dict.fromkeys(body.reasons)))
    return decisions.compare(get_reference(), profile)


@router.get("/profiles/{profile_id}/plan-check")
def profile_plan_check(profile_id: str, user: str | None = User):
    """Rules that spot a plan that cannot work as set (hours, dates, outlook, licence). No AI."""
    return plancheck.check(get_reference(), _profile_for(profile_id, user))


@router.put("/profiles/{profile_id}/plan")
def set_plan(profile_id: str, body: PlanRequest, user: str | None = User):
    """A target date and weekly study hours for the destination. Starts the on-track line from today."""
    before = _profile_for(profile_id, user)
    new_date = body.target_date.isoformat() if body.target_date else None
    if body.target_date is not None and body.target_date <= progress.today() and new_date != before.get("target_date"):
        raise HTTPException(422, "Choose a date after today")
    profile = store.set_plan(profile_id, new_date, body.weekly_hours)
    # Only a new date restarts the on-track line; changing the weekly hours keeps where you started.
    if new_date is not None and new_date != before.get("target_date"):
        progress.record(get_reference(), profile_id, "plan_set", body.target_date.isoformat())
    return profile


@router.get("/profiles/{profile_id}/replan")
def profile_replan(profile_id: str, scenario: Scenario = "baseline", user: str | None = User):
    """What the newest forecast changed in this person's recommendations (automatic re-planning)."""
    return replan.compare(get_reference(), _profile_for(profile_id, user), scenario)


@router.get("/fairness")
def fairness_check():
    """Rankings, scores, pathways and CV reading compared across names from Malaysia's communities."""
    return fairness.cached(get_reference())


@router.get("/sdg/region")
def sdg_region():
    """SDG contribution across Malaysia: counts of people heading for roles that serve each goal."""
    return region.view(get_reference())


@router.get("/profiles/{profile_id}/progress")
def profile_progress(profile_id: str, user: str | None = User):
    """Readiness over time toward the destination, and on track / ahead / behind a target date."""
    return progress.summary(get_reference(), _profile_for(profile_id, user))


@router.get("/profiles/{profile_id}/journey")
def profile_journey(profile_id: str, user: str | None = User):
    """Which of the four journey steps are done, and which comes next."""
    return journey.progress(get_reference(), _profile_for(profile_id, user))


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
    updated = store.set_completed(profile_id, done)
    if body.done != (body.course_id in profile["completed_courses"]):  # only real changes are events
        progress.record(get_reference(), profile_id, "course_finished" if body.done else "course_unfinished", body.course_id)
        if body.done:
            store.count_usage("course_finished")
    return updated


@router.post("/profiles/{profile_id}/cards", status_code=201)
def create_card(profile_id: str, body: CardRequest, user: str | None = User):
    """A Future Card: a read-only link to a summary of this person's move to one role."""
    _profile_for(profile_id, user)
    if body.role_id not in get_reference().roles:
        raise HTTPException(422, "Unknown role")
    card_id = store.create_card(profile_id, body.role_id)
    store.count_usage("card_created")
    return {"card_id": card_id}


@router.get("/cards/{card_id}")
def get_card(card_id: str):
    card = store.get_card(card_id)
    profile = store.get_profile(card["profile_id"]) if card else None
    if card is None or profile is None or card["role_id"] not in get_reference().roles:
        raise HTTPException(404, "Card not found")
    return cards.view(get_reference(), profile, card)


@router.get("/profiles/{profile_id}/roles/{role_id}/identity")
def role_identity(profile_id: str, role_id: str, request: Request, language: Literal["en", "ms", "zh"] = "en",
                  user: str | None = User):
    """A one- or two-sentence career identity statement for this role, from your transferable skills."""
    ratelimit.check(request, "identity", profile_id)
    ref = get_reference()
    if role_id not in ref.roles:
        raise HTTPException(404, "Role not found")
    return identity.statement(ref, _profile_for(profile_id, user), role_id, language)


@router.post("/interview")
def practise_interview(body: InterviewRequest, request: Request, user: str | None = User):
    """Interview practice for one role: feedback on the last answer and the next question."""
    ratelimit.check(request, "interview", body.profile_id)
    ref = get_reference()
    if body.role_id not in ref.roles:
        raise HTTPException(422, "Unknown role")
    turns = [t.model_dump() for t in body.turns]
    reply = interview.next_turn(ref, _profile_for(body.profile_id, user), body.role_id, turns, body.language)
    if reply["done"]:
        store.mark_practised(body.profile_id)  # journey step 4
    return reply


@router.post("/coach")
def ask_coach(body: CoachRequest, request: Request, user: str | None = User):
    """A cited answer about the person's own results, plus at most one change they can apply."""
    ratelimit.check(request, "coach", body.profile_id)
    store.count_usage("coach_asked")
    ref = get_reference()
    if body.role_id is not None and body.role_id not in ref.roles:
        raise HTTPException(422, "Unknown role")
    return coach.answer(ref, _profile_for(body.profile_id, user), body.question, body.scenario, body.role_id)


# --- feedback and usage counts --------------------------------------------------------------------

@router.post("/feedback", status_code=204)
def give_feedback(body: FeedbackIn, request: Request):
    """"Was this helpful?" No profile ID; the optional note is scrubbed of personal details first."""
    ratelimit.check(request, "feedback")
    if body.target == "role_advice" and body.subject not in get_reference().roles:
        raise HTTPException(422, "Unknown role")
    note = scrub(body.note.strip())[:500] if body.note and body.note.strip() else None
    store.add_feedback(body.target, body.subject if body.target == "role_advice" else None, body.helpful,
                       body.reason, note, None, body.language)


@router.post("/feedback/problem", status_code=204)
def report_problem(body: ProblemIn, request: Request):
    """"Report a problem": the screen it happened on and a scrubbed description. No profile ID."""
    ratelimit.check(request, "feedback")
    store.add_feedback("problem", None, None, None, scrub(body.note.strip())[:1000], body.screen, body.language)


@router.post("/usage", status_code=204)
def count_event(body: UsageIn, request: Request):
    """Add one to today's anonymous count for an event the app reports (the rest are counted here)."""
    ratelimit.check(request, "usage")
    store.count_usage(body.event)


@router.get("/admin/feedback")
def admin_feedback(x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    return {"totals": store.feedback_totals(), "recent": store.list_feedback(100)}


@router.get("/admin/usage")
def admin_usage(days: int = Query(30, ge=1, le=365), x_admin_token: str = Header(default="")):
    """Anonymous counts per event per day, with totals for the period."""
    _require_admin(x_admin_token)
    since = (dt.date.fromisoformat(store.malaysia_day()) - dt.timedelta(days=days - 1)).isoformat()
    rows = store.usage_since(since)
    totals: dict[str, int] = {}
    for r in rows:
        totals[r["event"]] = totals.get(r["event"], 0) + r["count"]
    return {"since": since, "days": rows, "totals": totals}


# --- email: weekly digest and job alerts -----------------------------------------------------------

EMAIL_VERSION = "2026-10-22"  # the wording of the email opt-in a consent row refers to
Claims = Depends(current_claims)


def _owned_by(profile_id: str, claims: dict | None) -> dict:
    """Email is only for a profile saved to the caller's Google account."""
    if not claims:
        raise HTTPException(401, "Log in with Google to get emails")
    profile = _profile_for(profile_id, str(claims["sub"]))
    if profile["user_id"] != str(claims["sub"]):
        raise HTTPException(403, "Save this profile to your account first")
    return profile


@router.get("/profiles/{profile_id}/email")
def email_settings(profile_id: str, claims: dict | None = Claims):
    """Whether email works on this server, and this person's choices (if logged in)."""
    available = get_settings().email_available
    if not claims:
        return {"available": available, "logged_in": False, "email": None, "settings": None}
    profile = _owned_by(profile_id, claims)
    saved = store.get_email_settings(profile["id"])
    return {"available": available, "logged_in": True, "email": (saved or {}).get("email") or claims.get("email"),
            "settings": {k: saved[k] for k in ("digest", "alerts", "state", "language")} if saved else None}


@router.put("/profiles/{profile_id}/email")
def save_email_settings(profile_id: str, body: EmailSettingsIn, claims: dict | None = Claims):
    profile = _owned_by(profile_id, claims)
    before = store.get_email_settings(profile["id"]) or {"digest": False, "alerts": "off"}
    if body.digest or body.alerts != "off":
        if not get_settings().email_available:
            raise HTTPException(503, "Email is not set up on this server yet")
        email = claims.get("email")
        if not email:
            raise HTTPException(422, "Your Google account has no email address")
        store.save_email_settings(profile["id"], str(claims["sub"]), email, body.digest, body.alerts, body.state, body.language)
    else:
        store.delete_email_settings(profile["id"])
    if body.digest != before["digest"]:
        store.add_consent(profile["id"], "email_digest", EMAIL_VERSION, body.digest)
    if body.alerts != before["alerts"]:  # job_alerts_weekly / job_alerts_instant given, or job_alerts withdrawn
        kind = "job_alerts" if body.alerts == "off" else f"job_alerts_{body.alerts}"
        store.add_consent(profile["id"], kind, EMAIL_VERSION, body.alerts != "off")
    return email_settings(profile_id, claims)


@router.post("/email/unsubscribe")
def unsubscribe(request: Request, token: str = Query(..., max_length=200)):
    """One click from an email, no login: "all" stops every email, "alerts" stops job alerts."""
    ratelimit.check(request, "feedback")
    found = alerts.read_token(token)
    if found is None:
        raise HTTPException(400, "This unsubscribe link is not valid")
    profile_id, kind = found
    saved = store.get_email_settings(profile_id)
    if saved is None:
        return {"done": kind}  # already unsubscribed: a second click changes nothing
    if saved["alerts"] != "off":
        store.add_consent(profile_id, "job_alerts", EMAIL_VERSION, False)
    if kind == "all" or not saved["digest"]:  # nothing left to send: forget the address
        store.delete_email_settings(profile_id)
        if saved["digest"]:
            store.add_consent(profile_id, "email_digest", EMAIL_VERSION, False)
    else:
        store.save_email_settings(profile_id, saved["user_id"], saved["email"], True, "off", saved["state"], saved["language"])
    return {"done": kind}


def _require_cron(secret: str) -> None:
    expected = get_settings().cron_secret
    if not expected or not hmac.compare_digest(secret, expected):
        raise HTTPException(401, "Cron secret required")


@router.post("/cron/weekly")
def cron_weekly(x_cron_secret: str = Header(default="")):
    """Monday 08:00 Malaysia time (GitHub Actions): the weekly digest to everyone who opted in."""
    _require_cron(x_cron_secret)
    if not get_settings().email_available:
        return {"email": "not set up", "sent": 0, "skipped": 0, "failed": 0}
    return {"email": "ok", **alerts.run_weekly(get_reference())}


@router.post("/cron/alerts")
def cron_alerts(x_cron_secret: str = Header(default="")):
    """Daily (GitHub Actions): new job ads to people who chose instant job alerts."""
    _require_cron(x_cron_secret)
    if not get_settings().email_available:
        return {"email": "not set up", "sent": 0, "skipped": 0, "failed": 0}
    return {"email": "ok", **alerts.run_alerts(get_reference())}


# --- career-centre classes ------------------------------------------------------------------------

CLASS_VERSION = "2026-10-22"  # the "what your counsellor will see" wording a join consent refers to


def _logged_in(claims: dict | None) -> str:
    if not claims:
        raise HTTPException(401, "Log in with Google first")
    return str(claims["sub"])


def _approved_counsellor(claims: dict | None) -> str:
    user = _logged_in(claims)
    counsellor = store.get_counsellor(user)
    if counsellor is None or counsellor["status"] != "approved":
        raise HTTPException(403, "Only approved counsellors can do this")
    return user


def _own_class(class_id: str, user: str) -> dict:
    klass = store.get_class(class_id)
    if klass is None or klass["counsellor_user_id"] != user:
        raise HTTPException(404, "Class not found")
    return klass


@router.get("/counsellor/me")
def counsellor_me(claims: dict | None = Claims):
    """Am I a counsellor, and my classes (approved counsellors only)."""
    user = _logged_in(claims)
    counsellor = store.get_counsellor(user)
    status = counsellor["status"] if counsellor else None
    return {"status": status, "name": counsellor and counsellor["name"], "organisation": counsellor and counsellor["organisation"],
            "classes": store.classes_for(user) if status == "approved" else []}


@router.post("/counsellor/request")
def counsellor_request(body: CounsellorRequest, claims: dict | None = Claims):
    """Ask to be a counsellor. An admin approves it on the Admin page."""
    user = _logged_in(claims)
    store.request_counsellor(user, claims.get("email"), body.name.strip(), body.organisation.strip())
    return counsellor_me(claims)


@router.get("/admin/counsellors")
def admin_counsellors(x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    return store.list_counsellors()


@router.post("/admin/counsellors/{user_id}")
def admin_decide_counsellor(user_id: str, body: CounsellorDecision, x_admin_token: str = Header(default="")):
    """Approve or revoke. Revoking stops dashboards at once; the classes and memberships stay."""
    _require_admin(x_admin_token)
    if not store.decide_counsellor(user_id, "approved" if body.approve else "revoked", body.decided_by.strip()):
        raise HTTPException(404, "No such counsellor request")
    return store.get_counsellor(user_id)


@router.post("/classes", status_code=201)
def create_class(body: ClassIn, claims: dict | None = Claims):
    user = _approved_counsellor(claims)
    return store.create_class(user, body.name.strip())


@router.get("/classes/{class_id}")
def class_dashboard(class_id: str, claims: dict | None = Claims):
    """Per student, only: name, destination, readiness, courses finished, skills proven, last active,
    target date and on-track status."""
    user = _approved_counsellor(claims)
    return classes.dashboard(get_reference(), _own_class(class_id, user))


@router.delete("/classes/{class_id}", status_code=204)
def delete_class(class_id: str, claims: dict | None = Claims):
    user = _approved_counsellor(claims)
    _own_class(class_id, user)
    store.delete_class(class_id)


@router.get("/class-codes/{code}")
def class_preview(code: str, request: Request, claims: dict | None = Claims):
    """Before joining: the class, who runs it, and exactly what they will see."""
    ratelimit.check(request, "join")
    _logged_in(claims)
    klass = store.class_by_code(code)
    counsellor = store.get_counsellor(klass["counsellor_user_id"]) if klass else None
    if klass is None or counsellor is None or counsellor["status"] != "approved":
        raise HTTPException(404, "No class with that code")
    return {"name": klass["name"], "counsellor": counsellor["name"], "organisation": counsellor["organisation"],
            "shared": list(classes.SHARED)}


@router.post("/classes/join")
def join_class(body: JoinRequest, request: Request, claims: dict | None = Claims):
    ratelimit.check(request, "join")
    user = _logged_in(claims)
    profile = _owned_by(body.profile_id, claims)
    klass = store.class_by_code(body.code)
    counsellor = store.get_counsellor(klass["counsellor_user_id"]) if klass else None
    if klass is None or counsellor is None or counsellor["status"] != "approved":
        raise HTTPException(404, "No class with that code")
    if klass["counsellor_user_id"] == user:
        raise HTTPException(422, "You run this class")
    store.join_class(klass["id"], profile["id"])
    store.add_consent(profile["id"], "class_share", CLASS_VERSION, True)
    return store.memberships(profile["id"])


@router.get("/profiles/{profile_id}/classes")
def my_classes(profile_id: str, user: str | None = User):
    return store.memberships(_profile_for(profile_id, user)["id"])


@router.delete("/profiles/{profile_id}/classes/{class_id}")
def leave_class(profile_id: str, class_id: str, user: str | None = User):
    """Leave a class: the counsellor loses access at once."""
    profile = _profile_for(profile_id, user)
    if store.leave_class(class_id, profile["id"]):
        store.add_consent(profile["id"], "class_share", CLASS_VERSION, False)
    return store.memberships(profile["id"])


def _own_student(class_id: str, member_key: str, user: str) -> tuple[dict, dict]:
    klass = _own_class(class_id, user)
    profile = checkins.member(class_id, member_key)
    if profile is None:
        raise HTTPException(404, "Student not found")
    return klass, profile


@router.get("/classes/{class_id}/students/{member_key}/checkin")
def checkin_agenda(class_id: str, member_key: str, claims: dict | None = Claims):
    """A check-in agenda from what the student shares: progress since the last check-in, the next
    course, plan checks, and the actions already proposed. Nothing about the talk is stored."""
    user = _approved_counsellor(claims)
    klass, profile = _own_student(class_id, member_key, user)
    return checkins.agenda(get_reference(), klass, profile)


@router.post("/classes/{class_id}/students/{member_key}/actions", status_code=201)
def propose_action(class_id: str, member_key: str, body: ActionIn, claims: dict | None = Claims):
    """Propose a change; the student accepts or declines it on their Today screen."""
    user = _approved_counsellor(claims)
    klass, profile = _own_student(class_id, member_key, user)
    try:
        value = checkins.validate(get_reference(), profile, body.kind, body.value)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if checkins.open_count(class_id, profile["id"]) >= checkins.MAX_OPEN:
        raise HTTPException(422, "The student has 10 proposals waiting. Let them answer those first")
    store.add_action(klass["id"], profile["id"], body.kind, value)
    return checkins.agenda(get_reference(), klass, profile)


@router.delete("/classes/{class_id}/students/{member_key}/actions/{action_id}")
def withdraw_action(class_id: str, member_key: str, action_id: str, claims: dict | None = Claims):
    user = _approved_counsellor(claims)
    klass, profile = _own_student(class_id, member_key, user)
    action = store.get_action(action_id)
    if action is None or action["class_id"] != klass["id"] or action["profile_id"] != profile["id"]:
        raise HTTPException(404, "Action not found")
    if action["status"] != "proposed":
        raise HTTPException(422, "The student has already answered this")
    store.delete_action(action_id)
    return checkins.agenda(get_reference(), klass, profile)


@router.get("/profiles/{profile_id}/actions")
def my_actions(profile_id: str, user: str | None = User):
    """What counsellors proposed to this student, and the answers."""
    return checkins.for_student(get_reference(), _profile_for(profile_id, user)["id"])


@router.post("/profiles/{profile_id}/actions/{action_id}")
def answer_action(profile_id: str, action_id: str, body: ActionAnswer, user: str | None = User):
    """Accept (a date or weekly hours change the plan at once), decline, or mark a to-do done."""
    profile = _profile_for(profile_id, user)
    action = store.get_action(action_id)
    if action is None or action["profile_id"] != profile["id"]:
        raise HTTPException(404, "Action not found")
    allowed = {"proposed": ("accept", "decline"), "accepted": ("done",)}.get(action["status"], ())
    if body.answer not in allowed:
        raise HTTPException(422, "This proposal has already been answered")
    if body.answer == "accept" and action["kind"] in ("target_date", "weekly_hours"):
        date = action["value"] if action["kind"] == "target_date" else profile.get("target_date")
        hours = int(action["value"]) if action["kind"] == "weekly_hours" else profile.get("weekly_hours")
        if action["kind"] == "target_date" and dt.date.fromisoformat(date) <= progress.today():
            raise HTTPException(422, "That date has passed. Ask your counsellor for a new one")
        store.set_plan(profile["id"], date, hours)
        if action["kind"] == "target_date" and date != profile.get("target_date"):
            progress.record(get_reference(), profile["id"], "plan_set", date)
        store.decide_action(action_id, "done")  # applied: nothing left to do
    else:
        store.decide_action(action_id, {"accept": "accepted", "decline": "declined", "done": "done"}[body.answer])
    return checkins.for_student(get_reference(), profile["id"])


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
def start_check(profile_id: str, skill_id: str, body: CheckStart, request: Request, user: str | None = User):
    """Three fresh questions for the next level of one skill. The answers stay on the server."""
    ratelimit.check(request, "checks")
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
        progress.record(ref, profile["id"], "skill_proven", check["skill_id"], check["level"])
        store.count_usage("skill_proven")
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
def survey_interpret(body: InterpretRequest, request: Request):
    """How we read a free-text answer. Nothing is saved; the person confirms before it counts."""
    ratelimit.check(request, "survey")
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
def profile_pathway(profile_id: str, role: str = Query(...), free_only: bool = Query(False), user: str | None = User):
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return pathway.build(ref, _profile_for(profile_id, user), role, free_only=free_only)
