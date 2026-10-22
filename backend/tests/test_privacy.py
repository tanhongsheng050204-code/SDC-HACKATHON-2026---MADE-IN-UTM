"""Send less: only CV extraction ever sees CV text, and no name or contact detail reaches the model."""

import pytest

from app.services import coach, pathway, proofcheck, skills, survey

CV = """Siti Nurhaliza
siti.nurhaliza@example.com · 012-345 6789
Data entry clerk at the Kampung Baru warehouse since 2016.
Keyed invoices into SAP, kept Excel trackers with pivot tables, handled filing and scheduling."""

QUESTIONS = [{"prompt": f"Q{i}?", "options": [f"a{i}", f"b{i}", f"c{i}", f"d{i}"], "answer": 0, "explanation": "."}
             for i in range(3)]


@pytest.fixture
def prompts(monkeypatch):
    seen: list[tuple[str, str]] = []

    def recorder(module_name):
        def fake(prompt, **_):
            seen.append((module_name, prompt))
            return {"skills": [], "summary": "A short plan.", "answer": "See your results [SOURCE-1].",
                    "proposal": None, "questions": QUESTIONS, "dims": {}}
        return fake

    for module in (skills, pathway, coach, proofcheck, survey):
        monkeypatch.setattr(module, "generate_json", recorder(module.__name__))
    monkeypatch.setattr(coach, "_llm_available", lambda: True)
    monkeypatch.setattr(survey, "_llm_available", lambda: True)
    return seen


def test_only_cv_extraction_sees_cv_text(client, prompts):
    extracted = client.post("/api/intake/extract", json={"text": CV}).json()
    profile = client.post("/api/profiles", json={"display_name": "Siti Nurhaliza", "skills": extracted["skills"],
                                                  "current_role_id": "data_entry_clerk"}).json()
    pid = profile["id"]
    client.get(f"/api/profiles/{pid}/pathway", params={"role": "data_analyst"})
    client.post("/api/coach", json={"profile_id": pid, "question": "I'm Siti, siti.nurhaliza@example.com: is my job at risk?"})
    client.post(f"/api/profiles/{pid}/skills/excel/checks", json={"language": "en"})
    client.post("/api/survey/interpret", json={"text": "Siti here, call 012-345 6789, I like a team"})

    used = {module for module, _ in prompts}
    assert used == {"app.services.skills", "app.services.pathway", "app.services.coach",
                    "app.services.proofcheck", "app.services.survey"}, used
    for module, prompt in prompts:
        assert "Nurhaliza" not in prompt, module
        assert "siti.nurhaliza@example.com" not in prompt, module
        assert "345 6789" not in prompt, module
        if module != "app.services.skills":
            assert "Kampung Baru" not in prompt, module
    assert any("Kampung Baru" in p for m, p in prompts if m == "app.services.skills")


def test_a_heading_first_cv_keeps_the_heading_and_loses_the_split_name():
    """A sidebar CV: the name broken over two lines after a heading, a referee with a title, a profile link."""
    from app.services.deid import scrub_cv
    cv = ("PROFILE\nNurul Aina\nbinti Hassan\nnurul.aina.hassan@example.com\nlinkedin.com/in/nurulaina-example\n"
          "SKILLS\nExcel (pivot tables)\nPower BI\nEXPERIENCE\nEngineering Intern, built dashboards for Nurul's team\n"
          "REFEREE\nDr. Tan Wei Ming\nSenior Lecturer, UTM\ntan.weiming@example.com\n")
    clean = scrub_cv(cv)
    for leak in ("Nurul", "Aina", "Hassan", "Tan Wei", "Ming", "linkedin", "nurulaina"):
        assert leak.lower() not in clean.lower(), leak
    assert clean.startswith("PROFILE\n[NAME]\n[NAME]") and "Excel (pivot tables)" in clean and "Power BI" in clean
    assert "[LINK]" in clean


def test_titled_names_are_removed_anywhere():
    from app.services.deid import scrub
    assert scrub("Reported to Puan Siti Aminah and Ir. Lim Chee Keong weekly.") == "Reported to [NAME] and [NAME] weekly."
