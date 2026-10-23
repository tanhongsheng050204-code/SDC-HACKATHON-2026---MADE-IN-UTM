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
    assert scrub("Dr.Tan Wei Ming, Senior Lecturer") == "[NAME], Senior Lecturer"  # OCR can drop the space


def test_names_in_a_sentence_are_removed():
    """A name ended by a full stop, and "My name is ..." / "Nama saya ..." anywhere in the text."""
    from app.services.deid import scrub_cv
    cases = {
        "Nur Aisyah binti Ahmad. Email aisyah@example.com, phone 012-345 6789. Data entry clerk.": ("Aisyah", "Ahmad"),
        "My name is Tan Wei Jie and I know Python and SQL. Tan Wei Jie, 2026.": ("Tan", "Wei", "Jie"),
        "Nama saya Siti Aminah binti Rahman. Saya kerani akaun.": ("Siti", "Aminah", "Rahman"),
    }
    for cv, leaks in cases.items():
        clean = scrub_cv(cv)
        assert all(leak not in clean for leak in leaks), clean
    assert scrub_cv("Data entry clerk. I key invoices into SAP.") == "Data entry clerk. I key invoices into SAP."


def test_an_institution_does_not_swallow_the_next_sentence():
    from app.services.deid import scrub
    assert scrub("Graduated from Universiti Malaya. Python and SQL.") == "Graduated from [ORG]. Python and SQL."


def test_a_designed_cv_with_the_sidebar_first_loses_the_name():
    """A Canva-style CV whose PDF text starts with the sidebar: the name comes after "Phone", "Email"
    and the skills. The email spells the name, so the name-shaped line holding it goes."""
    from app.services.deid import scrub_cv
    cv = ("Contact\nPhone\n012-345 6789\nEmail\nmariana.anderson@gmail.com\nAddress\nNo. 12, Jalan Mawar 3\n"
          "Expertise\nSocial media marketing\nContent writing\nMariana Anderson\nMarketing Manager\n"
          "Ran Instagram campaigns for Mariana's team.\nREFERENCE\nTan Wei Ming\nPhone\n03-1234 5678\nLim Mei Ling\n")
    clean = scrub_cv(cv)
    for leak in ("Mariana", "Anderson", "mariana", "6789", "Mawar", "Tan Wei", "Lim Mei"):
        assert leak not in clean, leak
    assert "Phone\n[PHONE]" in clean and "Social media marketing" in clean and "Marketing Manager" in clean


def test_a_letter_spaced_name_heading_read_as_one_word_is_removed():
    """A PDF reader runs "A I S Y A H  R A H M A N" together; the email words still spell it."""
    from app.services.deid import scrub_cv
    cv = ("CONTACT\n012-345 6789\naisyah.rahman@example.com\nSKILLS\nData entry\nAISYAHRAHMAN\n"
          "D A T A E N T R Y C L E R K\nPROFILE\nAisyah keys in 300 invoices a day.\n")
    clean = scrub_cv(cv)
    for leak in ("AISYAH", "Aisyah", "RAHMAN", "aisyah"):
        assert leak not in clean, leak
    assert "Data entry" in clean and "keys in 300 invoices" in clean
