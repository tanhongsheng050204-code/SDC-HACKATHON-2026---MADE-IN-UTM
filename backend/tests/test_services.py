from app.reference import get_reference
from app.services import grounding, matching, pathway, skills
from app.services.deid import scrub
from app.services.scenario import RoleSignal, label_for, outlook

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}


def test_baseline_outlook_is_the_published_figure():
    signal = RoleSignal("x", net_growth_pct=20, automation_exposure=0.8, ai_complementarity=0.2)
    assert outlook(signal, "baseline", 1.0).index == 20


def test_accelerated_adoption_hurts_exposed_roles_and_helps_complementary_ones():
    exposed = RoleSignal("a", 0, automation_exposure=0.9, ai_complementarity=0.1)
    complementary = RoleSignal("b", 0, automation_exposure=0.1, ai_complementarity=0.9)
    assert outlook(exposed, "accelerated", 1.6).index < outlook(exposed, "slow", 0.5).index
    assert outlook(complementary, "accelerated", 1.6).index > outlook(complementary, "slow", 0.5).index


def test_labels():
    assert [label_for(i) for i in (60, 20, 0, -30)] == ["emerging", "growing", "stable", "declining"]


def test_scenarios_change_the_ranking():
    ref = get_reference()
    slow = [r["role_id"] for r in matching.match(ref, CLERK, "slow")["roles"]]
    fast = [r["role_id"] for r in matching.match(ref, CLERK, "accelerated")["roles"]]
    assert slow != fast


def test_match_has_gap_sdgs_and_dated_source():
    result = matching.match(get_reference(), CLERK, "baseline")
    assert result["signal_source"]["imported"] and result["signal_source"]["source"]
    for role in result["roles"]:
        assert role["sdgs"], role["role_id"]
        assert set(role["outlook"]) == {"slow", "baseline", "accelerated"}
        assert 0 <= role["fit"] <= 1
    clerk = next(r for r in result["roles"] if r["role_id"] == "data_entry_clerk")
    assert clerk["is_current_role"] and clerk["outlook"]["baseline"]["label"] == "declining"


def test_pathway_only_uses_catalogue_courses_and_covers_the_gap():
    ref = get_reference()
    result = pathway.build(ref, CLERK, "data_analyst")
    catalogue = {c["id"] for c in ref.courses}
    assert result["steps"] and all(s["course"]["id"] in catalogue for s in result["steps"])
    taught = {k["skill_id"] for s in result["steps"] for k in s["skills"]}
    _, _, missing = matching.fit_and_gap(ref.roles["data_analyst"], set(CLERK["skills"]))
    assert {m["skill_id"] for m in missing} == taught
    assert result["total_hours"] == sum(s["course"]["hours"] for s in result["steps"])
    assert result["grounding"]["all_supported"]


def test_grounding_flags_an_invented_course():
    report = grounding.check("Take the Quantum Basketweaving Bootcamp for 999 hours.",
                             ["Google Data Analytics Professional Certificate 180 hours"])
    assert report.unsupported == [1]


def test_dictionary_extraction_and_scrub():
    text = ("Aisyah binti Ahmad, aisyah@example.com, 012-345 6789. Data entry clerk for 6 years. "
            "Daily work in Microsoft Excel with pivot tables, some SQL queries, customer service.")
    scrubbed = scrub(text, ["Aisyah binti Ahmad"])
    assert "example.com" not in scrubbed and "6789" not in scrubbed and "Aisyah" not in scrubbed
    found = skills.extract(text)["skills"]
    assert {"data_entry", "excel", "sql", "customer_service"} <= set(found)


def test_short_alias_does_not_match_inside_words():
    # "ml" and "js" must not match inside "html" or "jsonl"
    assert "machine_learning" not in skills.dictionary_extract("I write html and jsonl files every day")


def test_declining_roles_rank_last_and_are_never_robust():
    result = matching.match(get_reference(), CLERK, "baseline")
    flags = [r["at_risk"] for r in result["roles"]]
    assert flags == sorted(flags)  # every at-risk role comes after every other role
    assert not any(r["robust_pick"] and r["at_risk"] for r in result["roles"])
    assert result["roles"][0]["role_id"] != "data_entry_clerk"


def test_sdg_interest_changes_the_ranking_and_is_explained():
    ref = get_reference()
    plain = matching.match(ref, {**CLERK, "interests": []}, "baseline")["roles"]
    climate = matching.match(ref, {**CLERK, "interests": [13]}, "baseline")["roles"]
    rank = lambda roles, rid: next(r["rank"] for r in roles if r["role_id"] == rid)  # noqa: E731
    assert rank(climate, "renewable_energy_technician") < rank(plain, "renewable_energy_technician")
    boosted = next(r for r in climate if r["role_id"] == "renewable_energy_technician")
    assert boosted["why"]["matched_sdgs"] == [13] and boosted["why"]["sdg_points"] > 0


def test_score_breakdown_adds_up_and_range_covers_every_scenario():
    for role in matching.match(get_reference(), CLERK, "accelerated")["roles"]:
        why = role["why"]
        assert abs(why["fit_points"] + why["outlook_points"] + why["sdg_points"] - role["score"]) < 1e-3
        indexes = [o["index"] for o in role["outlook"].values()]
        assert role["estimate_range"]["low"] == min(indexes)
        assert role["estimate_range"]["high"] == max(indexes)
        assert role["citation"]["snapshot_id"] and role["citation"]["imported"]


def test_cv_header_name_is_removed_without_being_told_the_name():
    from app.services.deid import scrub_cv
    cv = "NURUL AISYAH BINTI AHMAD\nData entry clerk, Shah Alam\nSkills: Excel"
    assert scrub_cv(cv).splitlines()[0] == "[NAME]"
    assert "Lim Wei Jie" not in scrub_cv("Name: Lim Wei Jie\nPython, SQL")
    assert "Data entry clerk" in scrub_cv(cv)


def test_chat_turns_never_call_the_llm(monkeypatch):
    from app.services import intake

    def boom(*_args, **_kwargs):
        raise AssertionError("LLM called from a chat turn")
    monkeypatch.setattr(skills, "generate_json", boom)
    messages = [{"role": "user", "content": "I use Excel and SQL"}] * 50
    result = intake.turn(messages)
    assert result["is_complete"] and {"excel", "sql"} <= set(result["skills_found"])
