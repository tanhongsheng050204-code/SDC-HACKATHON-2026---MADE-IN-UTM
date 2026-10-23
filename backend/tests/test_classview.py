"""Career-centre class view: a cohort's fit and gaps, totals only, small groups hidden."""

import json

from app.reference import get_reference
from app.services import classview


def _lists_of_people(value) -> bool:
    """True if any list in the output has one entry per student (a sign of per-person rows)."""
    if isinstance(value, dict):
        return any(_lists_of_people(v) for v in value.values())
    if isinstance(value, list):
        return len(value) >= 40 or any(_lists_of_people(v) for v in value)
    return False


def test_class_view_is_totals_only(client):
    result = client.post("/api/class/analyse", json={"csv": client.get("/api/class/sample").text}).json()
    assert result["students"] == 52
    assert not _lists_of_people(result)
    assert sum(p["students"] for p in result["programmes"] if isinstance(p["students"], int)) <= 52
    assert result["best_fit"] and result["courses"]


def test_small_counts_are_hidden():
    csv = "skills\nExcel; SQL; statistics\nExcel; SQL; statistics\nExcel; SQL; statistics\nsolar; electrical; safety\n"
    result = classview.analyse(get_reference(), csv, "baseline")
    counts = [r["students"] for r in result["best_fit"]]
    assert "fewer than 3" in counts and 3 in counts
    assert "1" not in json.dumps(counts)


def test_class_view_rejects_identifying_columns(client):
    csv = "name,skills\nSiti,Excel\nAli,SQL\nMei,Python\n"
    response = client.post("/api/class/analyse", json={"csv": csv})
    assert response.status_code == 422 and "name" in response.json()["detail"]
    assert client.post("/api/class/analyse", json={"csv": "programme\nBusiness\nBusiness\n"}).status_code == 422


def test_top_gaps_come_with_courses(client):
    result = client.post("/api/class/analyse", json={"csv": client.get("/api/class/sample").text}).json()
    assert len(result["top_gaps"]) >= 3
    assert all(gap["course"] and gap["course"]["url"].startswith("http") for gap in result["top_gaps"])


def test_csv_saved_by_excel_with_a_byte_order_mark_is_read(client):
    for path in ("/api/workforce", "/api/class"):
        sample = client.get(f"{path}/sample").text
        plain = client.post(f"{path}/analyse", json={"csv": sample}).json()
        assert client.post(f"{path}/analyse", json={"csv": "﻿" + sample}).json() == plain
