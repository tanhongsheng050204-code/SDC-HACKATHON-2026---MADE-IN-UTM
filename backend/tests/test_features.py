import io
import zipfile

from app.reference import get_reference
from app.services import documents, matching, pathway, scenario, workforce

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk"}
CV_TEXT = ("Data entry clerk at a logistics company for nine years. I use Microsoft Excel every day with "
           "pivot tables, write simple SQL queries and help with customer service on the phone.")


def _docx(text: str) -> bytes:
    body = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.split(". "))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("word/document.xml", f"<w:document><w:body>{body}</w:body></w:document>")
    return buf.getvalue()


# ---------- CV upload ----------

def test_docx_and_txt_are_read():
    assert "pivot tables" in documents.read_text("cv.docx", _docx(CV_TEXT))
    assert "SQL" in documents.read_text("cv.txt", CV_TEXT.encode())


def test_bad_uploads_are_refused():
    for name, data in [("cv.exe", b"MZ" + b"0" * 100), ("cv.txt", b"too short"),
                       ("cv.pdf", b"%PDF-1.4 not really a pdf" * 3), ("big.txt", b"a" * (documents.MAX_BYTES + 1))]:
        try:
            documents.read_text(name, data)
        except documents.UnreadableDocument:
            continue
        raise AssertionError(f"{name} should be refused")


def test_upload_endpoint_returns_skills_and_stores_nothing(client):
    response = client.post("/api/intake/upload", files={"file": ("cv.docx", _docx(CV_TEXT))})
    assert response.status_code == 200
    assert {"data_entry", "excel", "sql", "customer_service"} <= set(response.json()["skills"])
    assert client.post("/api/intake/upload", files={"file": ("x.exe", b"MZ" * 40)}).status_code == 422


# ---------- year slider ----------

def test_year_scales_from_base_to_horizon_and_never_beyond():
    snap = get_reference().latest_snapshot
    base, horizon = int(snap["published"][:4]), snap["horizon_year"]
    assert scenario.year_fraction(snap, base) == (base, 0.0)
    assert scenario.year_fraction(snap, horizon) == (horizon, 1.0)
    assert scenario.year_fraction(snap, horizon + 5) == (horizon, 1.0)  # no extrapolation


def test_earlier_year_gives_smaller_changes_and_can_reorder():
    ref = get_reference()
    snap = ref.latest_snapshot
    early = matching.match(ref, CLERK, "baseline", int(snap["published"][:4]) + 1)
    late = matching.match(ref, CLERK, "baseline", snap["horizon_year"])
    clerk = lambda m: next(r for r in m["roles"] if r["role_id"] == "data_entry_clerk")  # noqa: E731
    assert abs(clerk(early)["outlook"]["baseline"]["index"]) < abs(clerk(late)["outlook"]["baseline"]["index"])
    assert early["year"] < late["year"] and late["year_range"][1] == snap["horizon_year"]


# ---------- progress ----------

def test_finishing_a_course_raises_readiness_and_marks_the_step(client):
    pid = client.post("/api/profiles", json={"skills": CLERK["skills"]}).json()["id"]
    before = client.get(f"/api/profiles/{pid}/pathway", params={"role": "data_analyst"}).json()
    first = before["steps"][0]["course"]["id"]
    assert client.post(f"/api/profiles/{pid}/complete", json={"course_id": first}).json()["completed_courses"] == [first]
    after = client.get(f"/api/profiles/{pid}/pathway", params={"role": "data_analyst"}).json()
    assert after["readiness"] > before["readiness"] and after["steps"][0]["done"]
    assert after["hours_left"] < before["hours_left"]
    undone = client.post(f"/api/profiles/{pid}/complete", json={"course_id": first, "done": False}).json()
    assert undone["completed_courses"] == []
    assert client.post(f"/api/profiles/{pid}/complete", json={"course_id": "nope"}).status_code == 422


def test_pathway_without_summary_makes_no_llm_call(monkeypatch):
    def boom(*_a, **_k):
        raise AssertionError("LLM called")
    monkeypatch.setattr(pathway, "generate_json", boom)
    assert pathway.build(get_reference(), CLERK, "data_analyst", summarize=False)["summary_mode"] == "template"


# ---------- HR workforce ----------

SAMPLE = "role,department,skills\n" + "\n".join(
    ["Data entry clerk,Ops,Excel; data entry"] * 5 + ["Data analyst,Digital,SQL; Python; dashboards"] * 2
    + ["Astronaut,Space,zero gravity"])


def test_workforce_aggregates_and_suggests_moves():
    result = workforce.analyse(get_reference(), SAMPLE, "baseline")
    assert result["employees"] == 7 and result["at_risk"] == 5
    assert result["roles"][0]["role_id"] == "data_entry_clerk" and result["roles"][0]["at_risk"]
    assert result["moves"][0]["people"] == 5 and result["moves"][0]["avg_hours"] > 0
    assert result["sdg_contribution"] and "Row 9" in result["problems"][0]
    # Aggregates only: groups by role and by move, never a row per employee.
    assert set(result) == {"scenario", "employees", "at_risk", "total_hours", "budget", "roles", "moves",
                           "in_place", "get_ahead", "sdg_contribution", "problems", "signal_source"}
    assert all("headcount" in r for r in result["roles"]) and all("people" in m for m in result["moves"])


def test_workforce_rejects_files_that_identify_people(client):
    for header in ["name,role,skills", "role,skills,email", "role,skills,IC number", "role,skills,Staff ID"]:
        body = {"csv": header + "\nx,Data entry clerk,Excel"}
        response = client.post("/api/workforce/analyse", json=body)
        assert response.status_code == 422 and "identify people" in response.json()["detail"], header


def test_workforce_sample_runs(client):
    sample = client.get("/api/workforce/sample").text
    result = client.post("/api/workforce/analyse", json={"csv": sample, "scenario": "accelerated"}).json()
    assert result["employees"] == 160 and result["moves"]


# ---------- your job, task by task ----------

def test_tasks_come_from_onet_and_shares_follow_ticked_tasks(client):
    body = client.get("/api/roles/data_entry_clerk/tasks").json()
    assert body["onet_code"] == "43-9021.00" and "O*NET" in body["source"]
    assert all(t["label"] in {"automate", "assist", "human"} and t["reason"] for t in body["tasks"])
    assert round(sum(body["shares"].values()), 6) == 1.0

    ticked = [t["id"] for t in body["tasks"] if t["label"] == "human"]
    only_human = client.get("/api/roles/data_entry_clerk/tasks", params={"done": ",".join(ticked)}).json()
    assert only_human["shares"] == {"automate": 0.0, "assist": 0.0, "human": 1.0}
    assert only_human["counted"] == len(ticked)


def test_tasks_for_a_role_without_onet_occupation_are_empty_not_guessed(client):
    body = client.get("/api/roles/ai_operations_specialist/tasks").json()
    assert body["tasks"] == [] and body["onet_code"] is None and body["onet_note"]
    assert client.get("/api/roles/nope/tasks").status_code == 404


def test_every_recommendation_carries_a_source(client):
    """Task 3.5: roles, skills and courses each say where they come from."""
    profile = client.post("/api/profiles/demo/clerk").json()
    roles = client.get(f"/api/profiles/{profile['id']}/matches").json()["roles"]
    assert all(r["citation"]["snapshot_id"] and "skills_source" in r for r in roles)
    analyst = next(r for r in roles if r["role_id"] == "data_analyst")
    assert analyst["skills_source"]["onet_code"] == "15-2051.01"
    plan = client.get(f"/api/profiles/{profile['id']}/pathway", params={"role": "data_analyst"}).json()
    assert all("checked" in s["course"] and s["course"]["provider"] for s in plan["steps"])
    assert all(r["pay"]["source"] and r["pay"]["table"] for r in roles)


# ---------- Future Card ----------

def test_future_card_is_a_read_only_summary_without_private_details(client):
    profile = client.post("/api/profiles/demo/clerk").json()
    card = client.post(f"/api/profiles/{profile['id']}/cards", json={"role_id": "data_analyst"})
    assert card.status_code == 201
    card_id = card.json()["card_id"]
    assert len(card_id) >= 10 and profile["id"] not in card_id

    view = client.get(f"/api/cards/{card_id}").json()
    assert view["role"]["title"] == "Data analyst" and view["display_name"] == "Aisyah (demo)"
    assert 0 <= view["readiness"] <= 1 and view["steps"] >= 1 and view["hours"] > 0
    assert view["sdgs"] and view["source"]["snapshot_id"]
    flat = str(view)
    assert profile["id"] not in flat and "skills" not in view  # no profile ID or full skill list


def test_future_card_goes_when_the_profile_is_deleted(client):
    profile = client.post("/api/profiles/demo/clerk").json()
    assert client.post(f"/api/profiles/{profile['id']}/cards", json={"role_id": "nope"}).status_code == 422
    card_id = client.post(f"/api/profiles/{profile['id']}/cards", json={"role_id": "data_analyst"}).json()["card_id"]
    client.delete(f"/api/profiles/{profile['id']}")
    assert client.get(f"/api/cards/{card_id}").status_code == 404


# ---------- AI coach ----------

def _ask(client, profile_id, question, **extra):
    return client.post("/api/coach", json={"profile_id": profile_id, "question": question, **extra})


def test_coach_offline_answers_from_the_persons_own_results_with_sources(client):
    profile = client.post("/api/profiles/demo/clerk").json()
    reply = _ask(client, profile["id"], "Why is this my top role?").json()
    assert reply["mode"] == "offline" and reply["sources"]
    top = client.get(f"/api/profiles/{profile['id']}/matches").json()["roles"][0]
    assert top["title"] in reply["answer"]
    assert reply["grounding"]["all_supported"]

    hours = _ask(client, profile["id"], "How long will the plan take?", role_id="data_analyst").json()
    assert "hours" in hours["answer"] and hours["grounding"]["all_supported"]


def test_coach_proposes_changes_but_never_applies_them(client):
    profile = client.post("/api/profiles/demo/clerk").json()
    reply = _ask(client, profile["id"], "What if AI adoption is faster?").json()
    assert reply["proposal"] == {"kind": "scenario", "value": "accelerated",
                                 "label": "Switch to the Accelerated AI adoption scenario"}
    climate = _ask(client, profile["id"], "I care about climate change").json()
    assert "Renewable energy technician" in climate["answer"] and climate["proposal"] is None


def test_coach_validates_input_and_scrubs_before_any_llm_call(client, monkeypatch):
    profile = client.post("/api/profiles/demo/clerk").json()
    assert _ask(client, profile["id"], "").status_code == 422
    assert _ask(client, profile["id"], "x" * 501).status_code == 422
    assert _ask(client, "no-such-profile", "hello there").status_code == 404

    from app.services import coach
    seen = {}

    def fake_llm(prompt):
        seen["prompt"] = prompt
        return {"answer": "Your top role is shown first [SOURCE-1].", "proposal": None}

    monkeypatch.setattr(coach, "_llm_available", lambda: True)
    monkeypatch.setattr(coach, "generate_json", fake_llm)
    reply = _ask(client, profile["id"], "Call me on 012-345 6789 about my top role").json()
    assert reply["mode"] == "gemini" and "012-345" not in seen["prompt"] and "[PHONE]" in seen["prompt"]


def test_future_card_shows_proven_levels(client):
    from app import store

    pid = client.post("/api/profiles/demo/clerk").json()["id"]
    store.set_skill_level(pid, "sql", 2)
    card = client.post(f"/api/profiles/{pid}/cards", json={"role_id": "data_analyst"}).json()["card_id"]
    assert {"name": "SQL", "level": 2, "level_name": "Working"} in client.get(f"/api/cards/{card}").json()["proven"]


def test_no_leftover_sdg_choice_in_coach_or_questionnaire():
    from app.services import coach, intake

    assert "SDG goal" not in coach.PROMPT and "SDG goal" not in (coach.__doc__ or "")
    assert not any("cause" in q.lower() for q in intake.SCRIPTED_QUESTIONS["en"])


def test_training_budget_splits_fees_and_never_guesses_a_missing_price():
    from app.services import workforce

    plan = {"steps": [
        {"course": {"title": "Free one", "cost": "free", "price_rm": 0}},
        {"course": {"title": "Claimable", "cost": "paid", "price_rm": 500.0, "hrd_corp": "claimable"}},
        {"course": {"title": "Ask first", "cost": "paid", "price_rm": 120.0, "hrd_corp": "check"}},
        {"course": {"title": "No price yet", "cost": "paid", "price_rm": None, "hrd_corp": "check"}},
    ]}
    fees = workforce._plan_fees(plan)
    assert (fees["total"], fees["claimable"], fees["ask"]) == (620.0, 500.0, 120.0)
    assert fees["unpriced"] == {"No price yet"}


def test_workforce_reports_course_fees_and_staff_time():
    from app.services import workforce

    ref = get_reference()
    csv_text = "role,skills\n" + "Data entry clerk,Excel; data entry\n" * 4
    budget = workforce.analyse(ref, csv_text, "baseline")["budget"]
    assert set(budget) >= {"total_rm", "claimable_rm", "ask_provider_rm", "unpriced_courses", "staff_time_rm"}
    assert budget["staff_time_rm"] > 0 and budget["total_rm"] >= budget["claimable_rm"]


def test_hr_moves_go_to_the_nearest_role_and_offer_upskilling_in_place():
    from app.services import workforce

    ref = get_reference()
    result = workforce.analyse(ref, open("data/sample_workforce.csv", encoding="utf-8").read(), "baseline")
    # The nearest move, never a long shot picked for its growth (the old pick: clerks -> AI/ML specialist at 0% fit).
    assert all(m["to_role_id"] != "ai_ml_engineer" for m in result["moves"])
    in_place = {r["role_id"]: r for r in result["in_place"]}
    assert "data_entry_clerk" in in_place and 0 < in_place["data_entry_clerk"]["avg_hours"] < 100
    assert in_place["data_entry_clerk"]["ai_skills"]
    risky = {r["role_id"] for r in result["roles"] if r["at_risk"]}
    assert all(r["role_id"] not in risky for r in result["get_ahead"])  # stable roles only
