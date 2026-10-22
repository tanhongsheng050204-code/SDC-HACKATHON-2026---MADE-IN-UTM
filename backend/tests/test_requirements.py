"""Entry requirements: skills are not the whole story. A licensed job is never a short next move."""

from app.reference import get_reference
from app.services import matching, pathway

CARE_WORKER = {"skills": ["patient_care", "empathy", "communication", "safety_compliance", "scheduling", "adaptability"],
               "current_role_id": "care_worker"}
SERVICE_REP = {"skills": ["customer_service", "communication", "empathy", "problem_solving", "genai_tools"],
               "current_role_id": "customer_service_rep"}


def _roles(profile: dict) -> dict:
    return {r["role_id"]: r for r in matching.match(get_reference(), profile, "baseline")["roles"]}


def test_every_role_has_a_sourced_usual_education_and_licences_are_sourced():
    ref = get_reference()
    data = ref.entry_requirements
    assert data["masco_source"]["url"].startswith("https://")
    for role in ref.roles.values():
        assert data["usual_by_group"][role["masco_major"]]["text"], role["id"]
    for role_id, licence in data["licences"].items():
        assert role_id in ref.roles, role_id
        assert licence["name"] and licence["route"] and licence["route_months"] > 0 and licence["law"]
        assert licence["sources"] and all(s["url"].startswith("https://") and s["title"] for s in licence["sources"])


def test_close_skills_do_not_make_a_licensed_job_a_next_move():
    nurse = _roles(CARE_WORKER)["registered_nurse"]
    assert nurse["fit"] > 0.8  # the skills really are close...
    assert nurse["long_shot"] and nurse["requirements"]["needs_licence"]  # ...but nursing needs LJM registration
    assert "Lembaga Jururawat" in nurse["requirements"]["licence"]["name"]
    assert _roles(SERVICE_REP)["tvet_instructor"]["long_shot"]


def test_shortest_route_never_points_to_a_licensed_job():
    ref = get_reference()
    for profile in (CARE_WORKER, SERVICE_REP):
        route = matching.match(ref, profile, "baseline")["shortest_route"]
        assert route is None or route not in ref.entry_requirements["licences"]


def test_a_licence_counts_as_held_only_in_your_own_job():
    ref = get_reference()
    nurse = {"skills": ["patient_care", "empathy", "communication", "safety_compliance", "critical_thinking"],
             "current_role_id": "registered_nurse"}
    result = matching.match(ref, nurse, "baseline")
    own = result["current_role"] or next(r for r in result["roles"] if r["role_id"] == "registered_nurse")
    assert own["requirements"]["needs_licence"] is False


def test_roles_without_a_licence_show_the_usual_education_only():
    clerk = _roles({"skills": ["excel", "data_entry"], "current_role_id": "data_entry_clerk"})["accounts_clerk"]
    assert clerk["requirements"]["licence"] is None and not clerk["requirements"]["needs_licence"]
    assert "SPM" in clerk["requirements"]["usual"]


def test_the_plan_puts_the_licence_route_first():
    plan = pathway.build(get_reference(), CARE_WORKER, "registered_nurse", summarize=False)
    licence = plan["requirements"]["licence"]
    assert plan["requirements"]["needs_licence"] and "Diploma in Nursing" in licence["route"]
    assert licence["route_months"] == 36


def test_requirement_texts_have_bm_and_chinese():
    ref = get_reference()
    data = ref.entry_requirements
    texts = [g["text"] for g in data["usual_by_group"].values()]
    texts += [x for lic in data["licences"].values() for x in (lic["name"], lic["route"])]
    assert all(ref.translations.get(x, {}).get("ms") and ref.translations.get(x, {}).get("zh") for x in texts)
