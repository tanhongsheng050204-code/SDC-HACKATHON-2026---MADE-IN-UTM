"""HTTP routes. Screens and the endpoints they call are listed in docs/03-APP_FLOW.md."""

import hmac
import json

from fastapi import APIRouter, Header, HTTPException, Query

from app import store
from app.config import get_settings
from app.reference import get_reference, reload_reference
from app.schemas import ExtractRequest, IntakeTurnRequest, ProfileIn, Scenario
from app.services import intake, matching, pathway, skills

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


@router.post("/signals/import", status_code=201)
def import_snapshot(snapshot: dict, x_admin_token: str = Header(default="")):
    settings = get_settings()
    if not settings.admin_token or not hmac.compare_digest(x_admin_token, settings.admin_token):
        raise HTTPException(401, "Admin token required")
    ref = get_reference()
    required = {"snapshot_id", "source", "source_url", "published", "imported", "horizon_year",
                "illustrative", "signals"}
    if missing := required - snapshot.keys():
        raise HTTPException(422, f"Missing fields: {', '.join(sorted(missing))}")
    if snapshot["imported"] <= ref.latest_snapshot["imported"]:
        raise HTTPException(422, "imported date must be later than the latest snapshot")
    for s in snapshot["signals"]:
        if s.get("role_id") not in ref.roles:
            raise HTTPException(422, f"Unknown role in signals: {s.get('role_id')}")
    path = settings.data_dir / "signals" / f"{snapshot['snapshot_id']}.json"
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
def profile_matches(profile_id: str, scenario: Scenario = "baseline"):
    return matching.match(get_reference(), _profile_or_404(profile_id), scenario)


@router.get("/profiles/{profile_id}/pathway")
def profile_pathway(profile_id: str, role: str = Query(...)):
    ref = get_reference()
    if role not in ref.roles:
        raise HTTPException(404, "Role not found")
    return pathway.build(ref, _profile_or_404(profile_id), role)
