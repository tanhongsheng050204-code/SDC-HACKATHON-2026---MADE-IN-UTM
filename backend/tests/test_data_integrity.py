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
