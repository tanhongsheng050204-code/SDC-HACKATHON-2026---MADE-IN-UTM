import io
import zipfile

from app.reference import get_reference
from app.services import documents, matching, pathway, scenario, workforce

CLERK = {"skills": ["data_entry", "excel", "office_admin", "scheduling", "communication", "genai_tools"],
         "current_role_id": "data_entry_clerk", "interests": []}
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
    assert set(result) == {"scenario", "employees", "at_risk", "total_hours", "roles", "moves",
                           "sdg_contribution", "problems", "signal_source"}
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
