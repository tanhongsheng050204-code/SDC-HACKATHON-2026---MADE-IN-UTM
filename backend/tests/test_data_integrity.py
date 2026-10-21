"""Every ID referenced in the reference data exists, and every role is fully described."""

from app.reference import get_reference


def test_role_skills_exist():
    ref = get_reference()
    for role in ref.roles.values():
        for rs in role["skills"]:
            assert rs["skill_id"] in ref.skills, (role["id"], rs["skill_id"])
            assert rs["weight"] in (1, 2, 3)


def test_aliases_are_unique_across_skills():
    seen: dict[str, str] = {}
    for skill in get_reference().skills.values():
        for alias in skill.get("aliases", []):
            assert alias not in seen, f"alias {alias!r} on {skill['id']} and {seen.get(alias)}"
            seen[alias] = skill["id"]


def test_every_role_has_signal_and_sdg():
    ref = get_reference()
    signalled = {s["role_id"] for s in ref.latest_snapshot["signals"]}
    for role_id in ref.roles:
        assert role_id in signalled, role_id
        assert ref.role_sdgs(role_id), role_id


def test_every_role_skill_has_a_course():
    ref = get_reference()
    taught = {s for c in ref.courses for s in c["skills"]}
    for role in ref.roles.values():
        for rs in role["skills"]:
            assert rs["skill_id"] in taught, (role["id"], rs["skill_id"])


def test_course_and_sdg_ids_exist():
    ref = get_reference()
    for course in ref.courses:
        assert set(course["skills"]) <= ref.skills.keys(), course["id"]
        assert course["level"] in ("intro", "intermediate", "advanced")
    for tags in [*ref.sdg_map["roles"].values(), *ref.sdg_map["skills"].values()]:
        for tag in tags:
            assert tag["sdg"] in ref.sdgs
    assert set(ref.sdg_map["skills"]) <= ref.skills.keys()


def test_snapshot_signals_in_range():
    for snapshot in get_reference().snapshots:
        assert snapshot["source"] and snapshot["imported"] and snapshot["source_url"]
        for s in snapshot["signals"]:
            assert -100 <= s["net_growth_pct"] <= 300
            assert 0 <= s["automation_exposure"] <= 1
            assert 0 <= s["ai_complementarity"] <= 1


def test_every_skill_and_role_has_an_sdg_with_target():
    """The brief: tag each role and skill to at least one SDG."""
    ref = get_reference()
    for skill_id in ref.skills:
        assert ref.skill_sdgs(skill_id), f"skill {skill_id} has no SDG"
    for tags in [*ref.sdg_map["roles"].values(), *ref.sdg_map["skills"].values()]:
        for tag in tags:
            assert tag.get("target", "").startswith(f"{tag['sdg']}."), tag


def test_tasks_cover_every_role_with_valid_labels():
    ref = get_reference()
    assert set(ref.tasks["roles"]) == set(ref.roles)
    for role_id, entry in ref.tasks["roles"].items():
        assert bool(entry["onet_code"]) == bool(entry["tasks"]), role_id
        for t in entry["tasks"]:
            assert t["label"] in {"automate", "assist", "human"} and t["reason"] and t["text"], t["id"]


def test_skill_prereqs_reference_known_skills_and_have_no_cycles():
    ref = get_reference()
    for skill_id, prereqs in ref.skill_prereqs.items():
        assert skill_id in ref.skills, skill_id
        for p in prereqs:
            assert p in ref.skills and p != skill_id, (skill_id, p)

    def visit(node: str, path: tuple[str, ...]) -> None:
        assert node not in path, f"cycle: {' -> '.join(path + (node,))}"
        for p in ref.skill_prereqs.get(node, []):
            visit(p, path + (node,))

    for skill_id in ref.skill_prereqs:
        visit(skill_id, ())


def test_skill_levels_are_basic_working_advanced():
    assert [(lvl["level"], lvl["name"]) for lvl in get_reference().skill_levels] == [
        (1, "Basic"), (2, "Working"), (3, "Advanced")]


def test_every_role_has_a_full_work_context():
    ref = get_reference()
    dims = {d["id"] for d in ref.work_dimensions}
    assert dims == {"people", "structured", "field", "shifts", "team"}
    for role in ref.roles.values():
        context = role["work_context"]
        assert set(context) == dims, role["id"]
        assert all(-1 <= v <= 1 for v in context.values()), role["id"]


def test_survey_cards_are_valid():
    ref = get_reference()
    dims = {d["id"] for d in ref.work_dimensions}
    assert len(ref.survey_cards) >= 30
    for card_id, card in ref.survey_cards.items():
        assert card_id == card["id"] and card_id.startswith("card-")
        assert card["role_ids"] and all(r in ref.roles for r in card["role_ids"]), card_id
        assert card["dims"] and all(d in dims and v in (1, -1) for d, v in card["dims"].items()), card_id
        assert all(card["text"][lang].strip() for lang in ("en", "ms", "zh")), card_id
    for d in ref.work_dimensions:
        assert all(d[pole][lang].strip() for pole in ("plus", "minus") for lang in ("en", "ms", "zh"))


def test_every_dimension_has_cards_both_ways():
    ref = get_reference()
    for d in ref.work_dimensions:
        directions = {card["dims"].get(d["id"]) for card in ref.survey_cards.values()}
        assert {1, -1} <= directions, d["id"]


def test_every_role_has_survey_cards():
    ref = get_reference()
    covered = {r for card in ref.survey_cards.values() for r in card["role_ids"]}
    assert covered == set(ref.roles)


def test_every_role_has_entry_level():
    ref = get_reference()
    assert all(isinstance(role.get("entry_level"), bool) for role in ref.roles.values())
    assert any(role["entry_level"] for role in ref.roles.values())


DOSM_2025_MEDIANS = {"1": 6186, "2": 6124, "3": 3852, "4": 2693, "5": 2035, "6": 1992, "7": 2173, "8": 2083,
                     "9": 1758, "all": 2940}  # DOSM Salaries & Wages Survey Report 2025, Appendix table A10


def test_salaries_match_dosm_table_a10():
    salaries = get_reference().salaries
    assert {g["id"]: g["median_rm"] for g in salaries["groups"]} == DOSM_2025_MEDIANS
    assert salaries["year"] == 2025 and "A10" in salaries["table"] and salaries["source_url"].startswith("https://storage.dosm.gov.my")


def test_every_role_maps_to_a_dosm_group():
    ref = get_reference()
    groups = {g["id"] for g in ref.salaries["groups"]}
    assert all(role["masco_major"] in groups - {"all"} for role in ref.roles.values())


def test_every_sdg_reason_has_bm_and_chinese():
    ref = get_reference()
    for tags in [*ref.sdg_map["roles"].values(), *ref.sdg_map["skills"].values()]:
        for tag in tags:
            assert tag.get("reason_ms", "").strip() and tag.get("reason_zh", "").strip(), tag["reason"]


def test_role_page_sends_sdg_reasons_in_three_languages(client):
    body = client.get("/api/roles/care_worker").json()
    assert body["sdgs"] and all(set(g["reasons"]) == {"en", "ms", "zh"} for g in body["sdgs"])
    assert all(set(g["reasons"]) == {"en", "ms", "zh"} for goals in body["skill_sdgs"].values() for g in goals)
