"""Phase 2 privacy: the wider scrubber, the "what gets sent" preview, open-model CV reading and voice."""

import httpx
import pytest

from app import runpod
from app.config import get_settings
from app.services import skills
from app.services.deid import removed_counts, scrub, scrub_cv

CV = """Nur Aisyah binti Ahmad
Address: No. 12, Jalan Melati 3, Taman Desa, 43000 Kajang, Selangor
Date of birth: 14/03/1994   Age: 32
Data entry clerk, Maju Logistics Sdn Bhd (2016 - 2024), Kampung Baru warehouse.
Diploma in Accounting, Universiti Teknologi MARA; SPM at SMK Taman Desa.
Keyed invoices into SAP and kept Excel trackers with pivot tables from 2016 to 2024."""


def test_addresses_birth_dates_ages_and_organisations_are_removed():
    out = scrub_cv(CV)
    for detail in ("Aisyah", "Melati", "43000", "Kajang", "14/03/1994", "32", "Maju Logistics", "Teknologi MARA", "SMK Taman"):
        assert detail not in out, detail
    assert removed_counts(out) == {"NAME": 1, "DOB": 1, "AGE": 1, "ADDRESS": 1, "ORG": 3}
    # What skill extraction needs stays: duties, tools and employment years.
    assert "Keyed invoices into SAP and kept Excel trackers with pivot tables from 2016 to 2024." in out
    assert "Data entry clerk" in out and "(2016 - 2024)" in out


@pytest.mark.parametrize("text, kept", [
    ("Born on March 3, 1994 in Ipoh.", "[DOB]"),
    ("DOB 3 March 1994", "[DOB]"),
    ("Lives at Lot 5 Jalan Ampang, 50450 Kuala Lumpur.", "Lives at [ADDRESS], [ADDRESS]."),
    ("Accounts intern at Petronas Chemicals Group Berhad, June 2015.", "Accounts intern at [ORG], June 2015."),
    ("Bachelor's from University of Malaya and Sunway College.", "Bachelor's from [ORG] and [ORG]."),
])
def test_scrubber_shapes(text, kept):
    assert kept in scrub(text)


def test_dates_and_numbers_without_a_label_stay():
    text = "Joined in March 2019; processed 12000 invoices; Excel since 01/02/2018."
    assert scrub(text) == text


def test_name_at_the_start_of_a_headline():
    assert scrub_cv("Siti Aminah Rahman — Sustainability Manager\nGRI").splitlines()[0] == "[NAME] — Sustainability Manager"


def test_preview_shows_what_gets_sent(client):
    body = client.post("/api/intake/preview", json={"text": CV}).json()
    assert body["text"] == scrub_cv(CV)
    assert body["removed"]["ORG"] == 3


def test_upload_preview_reads_the_file_and_scrubs(client):
    files = {"file": ("cv.txt", CV.encode(), "text/plain")}
    body = client.post("/api/intake/upload/preview", files=files).json()
    assert "Melati" not in body["text"] and "[ADDRESS]" in body["text"]
    bad = client.post("/api/intake/upload/preview", files={"file": ("cv.exe", b"MZ" * 40, "application/octet-stream")})
    assert bad.status_code == 422


@pytest.fixture
def runpod_on(monkeypatch):
    monkeypatch.setenv("RUNPOD_API_KEY", "rp-test")
    monkeypatch.setenv("RUNPOD_LLM_ENDPOINT", "llm123")
    monkeypatch.setenv("RUNPOD_WHISPER_ENDPOINT", "whisper123")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _response(url, payload):
    return httpx.Response(200, json=payload, request=httpx.Request("POST", url))


def test_open_model_reads_the_cv_and_gemini_never_sees_it(runpod_on, monkeypatch):
    sent = []

    def fake_post(url, **kwargs):
        sent.append((url, kwargs["json"]))
        return _response(url, {"choices": [{"message": {"content": '```json\n{"skills": ["pivot tables"]}\n```'}}]})

    def gemini(*_args, **_kwargs):
        raise AssertionError("Gemini must not see CV text when the open model answers")

    monkeypatch.setattr(runpod.httpx, "post", fake_post)
    monkeypatch.setattr(skills, "generate_json", gemini)
    result = skills.extract(CV)
    assert result["mode"] == "open-model+dictionary"
    url, payload = sent[0]
    assert url == "https://api.runpod.ai/v2/llm123/openai/v1/chat/completions"
    assert "Melati" not in payload["messages"][0]["content"] and "Aisyah" not in payload["messages"][0]["content"]


def test_cold_open_model_falls_back_to_gemini(runpod_on, monkeypatch):
    def timeout(url, **_kwargs):
        raise httpx.ReadTimeout("cold start")

    monkeypatch.setattr(runpod.httpx, "post", timeout)
    monkeypatch.setattr(skills, "generate_json", lambda prompt: {"skills": []})
    assert skills.extract(CV)["mode"] == "gemini+dictionary"


def test_slow_open_model_falls_back_within_the_total_deadline(runpod_on, monkeypatch):
    # RunPod keeps the connection alive while a worker cold-starts, so httpx's per-read timeout
    # never fires; the deadline must cover the whole call.
    import time
    monkeypatch.setenv("RUNPOD_TIMEOUT_SECONDS", "1")
    get_settings.cache_clear()

    def slow(url, **_kwargs):
        time.sleep(3)
        return _response(url, {"choices": [{"message": {"content": '{"skills": []}'}}]})

    monkeypatch.setattr(runpod.httpx, "post", slow)
    monkeypatch.setattr(skills, "generate_json", lambda prompt: {"skills": []})
    started = time.perf_counter()
    assert skills.extract(CV)["mode"] == "gemini+dictionary"
    assert time.perf_counter() - started < 2.5


def test_open_model_answer_that_is_not_an_object_falls_back_to_gemini(runpod_on, monkeypatch):
    monkeypatch.setattr(runpod.httpx, "post", lambda url, **_: _response(url, {"choices": [{"message": {"content": "[1, 2]"}}]}))
    monkeypatch.setattr(skills, "generate_json", lambda prompt: {"skills": []})
    assert skills.extract(CV)["mode"] == "gemini+dictionary"


def test_scrubber_is_fast_on_long_capitalised_text():
    import time
    text = ("Alpha Beta Gamma Delta Epsilon Zeta Eta Theta " * 400)[:20_000]
    started = time.perf_counter()
    scrub_cv(text)
    assert time.perf_counter() - started < 1.0


def test_voice_is_unavailable_without_a_worker(client):
    assert client.get("/api/health").json()["voice"] is False
    response = client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x" * 100, "audio/webm")})
    assert response.status_code == 503


def test_voice_transcript_is_scrubbed_and_audio_goes_only_to_runpod(client, runpod_on, monkeypatch):
    sent = []

    def fake_post(url, **kwargs):
        sent.append((url, kwargs["json"]["input"]))
        return _response(url, {"status": "COMPLETED", "output": {"transcription": " I'm Siti, call 012-345 6789. I like Excel. "}})

    monkeypatch.setattr(runpod.httpx, "post", fake_post)
    assert client.get("/api/health").json()["voice"] is True
    response = client.post("/api/voice/transcribe?language=ms", files={"audio": ("a.webm", b"\x1aE" * 200, "audio/webm")})
    assert response.status_code == 200
    assert response.json()["text"] == "I'm Siti, call [PHONE]. I like Excel."
    url, job = sent[0]
    assert url == "https://api.runpod.ai/v2/whisper123/runsync" and job["language"] == "ms" and job["audio_base64"]


def test_voice_refuses_bad_input_and_reports_a_cold_worker(client, runpod_on, monkeypatch):
    assert client.post("/api/voice/transcribe?language=fr", files={"audio": ("a.webm", b"x", "audio/webm")}).status_code == 422
    assert client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"", "audio/webm")}).status_code == 422
    monkeypatch.setattr(runpod.httpx, "post", lambda url, **_: _response(url, {"status": "IN_QUEUE"}))
    assert client.post("/api/voice/transcribe", files={"audio": ("a.webm", b"x" * 10, "audio/webm")}).status_code == 503
