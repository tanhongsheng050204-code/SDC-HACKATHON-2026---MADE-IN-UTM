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
    texts += [x for lic in data["licences"].values() for x in (lic["name"], lic["route"], lic["qualification"])]
    texts += [f for entry in data.get("roles", {}).values() for f in entry.get("fields", [])]
    assert all(ref.translations.get(x, {}).get("ms") and ref.translations.get(x, {}).get("zh") for x in texts)


def _script():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[1] / "scripts" / "build_qualifications.py"
    spec = importlib.util.spec_from_file_location("build_qualifications", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_licensed_roles_take_their_qualification_from_the_licence_route():
    """No more "employers usually ask for a degree" next to a diploma route."""
    roles = _roles(CARE_WORKER)
    nurse, tvet = roles["registered_nurse"]["requirements"], roles["tvet_instructor"]["requirements"]
    assert nurse["qualification"]["basis"] == "licence" and "Diploma in Nursing" in nurse["qualification"]["text"]
    assert tvet["qualification"]["basis"] == "licence" and "SKM" in tvet["qualification"]["text"]


def test_role_qualifications_come_from_real_ads_with_quotes_and_links():
    ref = get_reference()
    from_ads = {r: e for r, e in ref.entry_requirements["roles"].items() if e.get("level")}
    assert len(from_ads) >= 10
    for role_id, entry in from_ads.items():
        assert entry["level_ads"] >= 0.5 * entry["ads_with_level"] and entry["ads_with_level"] >= 5, role_id
        assert entry["sources"] and all(s["url"].startswith("https://") and s["quote"] for s in entry["sources"]), role_id
        for cert in entry["certifications"]:
            assert cert["ads"] >= 2 and cert["sources"] and all(s["quote"] for s in cert["sources"]), (role_id, cert["name"])
    cyber = _roles(SERVICE_REP)["cybersecurity_analyst"]["requirements"]
    assert cyber["qualification"]["basis"] == "ads" and cyber["qualification"]["level"] == "degree"
    assert any(c["name"] == "CompTIA Security+" for c in cyber["certifications"])


def test_a_role_with_too_few_ads_keeps_the_masco_default():
    farm = _roles(CARE_WORKER)["farm_worker"]["requirements"]
    assert farm["qualification"] == {"basis": "masco", "text": farm["usual"]}


def test_extraction_reads_the_minimum_level_fields_and_known_certificates():
    q = _script()
    ad = ("<p><strong>Requirements</strong></p><ul><li>Minimum Diploma / Degree in Accounting or Finance.</li>"
          "<li>Possess LCCI Level 3 or ACCA.</li><li>Good communication skills.</li></ul>"
          "<p>We pay CPA campaigns on Google.</p>")
    found = q.extract(ad)
    assert found["level"] == "diploma" and found["quote"].startswith("Minimum Diploma")
    assert {"accounting", "finance"} <= set(found["fields"])
    assert set(found["certifications"]) == {"LCCI", "ACCA"}  # "CPA campaigns" is not the accounting body
    assert q.extract("<p>No education stated here.</p>")["level"] is None
