"""Scanned CVs and photos are read by OCR on this server, then scrubbed like any CV."""

import io

import pytest

from app.services import documents, ocr

needs_ocr = pytest.mark.skipif(not ocr.available(), reason="OCR models not fetched (scripts/fetch_ocr_models.py)")
LINES = ["NUR AISYAH BINTI AHMAD", "IC 900101-14-5678  Phone 012-345 6789",
         "Data entry clerk, 2016 to present", "Skills: Microsoft Excel, data entry, scheduling",
         "and customer service on the phone"]


def _page(lines: list[str] = LINES):
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 30)
    except OSError:
        try:
            font = ImageFont.truetype("arial.ttf", 30)
        except OSError:
            font = ImageFont.load_default(size=30)
    image = Image.new("RGB", (1300, 120 + 70 * len(lines)), "white")
    draw = ImageDraw.Draw(image)
    for i, line in enumerate(lines):
        draw.text((60, 60 + 70 * i), line, fill="black", font=font)
    return image


def _scanned_pdf() -> bytes:
    buffer = io.BytesIO()
    _page().save(buffer, "PDF", resolution=150)  # an image only: no text layer, like a scan
    return buffer.getvalue()


def _photo() -> bytes:
    buffer = io.BytesIO()
    _page().save(buffer, "JPEG", quality=85)
    return buffer.getvalue()


@needs_ocr
def test_a_scanned_pdf_is_read_and_marked_as_a_scan():
    text, from_scan = documents.read("cv.pdf", _scanned_pdf())
    assert from_scan and "Excel" in text and "data entry" in text.lower()


@needs_ocr
def test_a_photo_of_a_cv_is_read():
    text, from_scan = documents.read("cv.jpg", _photo())
    assert from_scan and "customer service" in text.lower()


@needs_ocr
def test_scan_upload_finds_skills_and_scrubs_before_anything_else(client):
    found = client.post("/api/intake/upload", files={"file": ("cv.pdf", _scanned_pdf())}).json()
    assert found["from_scan"] and {"excel", "data_entry", "customer_service"} <= set(found["skills"])
    preview = client.post("/api/intake/upload/preview", files={"file": ("cv.pdf", _scanned_pdf())}).json()
    assert preview["from_scan"] and "AISYAH" not in preview["text"] and "900101" not in preview["text"]


def test_without_ocr_a_scan_gets_a_clear_way_forward(monkeypatch):
    def unavailable(*_):
        raise ocr.Unavailable("models missing")

    monkeypatch.setattr(ocr, "read_images", unavailable)
    with pytest.raises(documents.UnreadableDocument, match="Paste the text or upload a Word file"):
        documents.read("cv.pdf", _scanned_pdf())


@needs_ocr
def test_a_blank_scan_is_refused():
    with pytest.raises(documents.UnreadableDocument, match="clearer"):
        documents.read("blank.png", _png_blank())


def _png_blank() -> bytes:
    from PIL import Image

    buffer = io.BytesIO()
    Image.new("RGB", (800, 600), "white").save(buffer, "PNG")
    return buffer.getvalue()


def test_text_pdfs_and_word_files_never_go_through_ocr(monkeypatch):
    monkeypatch.setattr(ocr, "read_images", lambda *_: pytest.fail("OCR used for a file with text"))
    assert documents.read("cv.txt", b"Data entry clerk using Microsoft Excel and SQL every day at work.")[1] is False


def _two_columns():
    """A sidebar (contact, skills) beside the main text, like most designed CVs."""
    from PIL import Image, ImageDraw, ImageFont

    image = Image.new("RGB", (1240, 900), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=28)
    for i, line in enumerate(["SKILLS", "AutoCAD", "MATLAB", "Power BI", "Python"]):
        draw.text((40, 80 + 70 * i), line, fill="black", font=font)
    for i, line in enumerate(["EXPERIENCE", "Engineering Intern", "Built an Excel dashboard", "Cut report time by 75%", "Taught SPM Mathematics"]):
        draw.text((520, 80 + 70 * i), line, fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


@needs_ocr
def test_two_column_pages_are_read_one_column_at_a_time():
    lines = documents.read("cv.png", _two_columns())[0].splitlines()
    assert lines[:5] == ["SKILLS", "AutoCAD", "MATLAB", "Power BI", "Python"]
    assert lines[5] == "EXPERIENCE" and lines[-1] == "Taught SPM Mathematics"


def _box(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def test_runpod_reads_first_and_this_server_never_loads_the_engine(monkeypatch):
    from app import runpod
    sidebar = [(_box(30, 80 + 60 * i, 200, 110 + 60 * i), t) for i, t in enumerate(["SKILLS", "Excel", "SQL", "Python"])]
    main = [(_box(500, 80 + 60 * i, 900, 110 + 60 * i), t) for i, t in enumerate(["EXPERIENCE", "Data clerk", "Built reports", "Filing"])]
    pairs = sidebar + main
    pairs.sort(key=lambda p: p[0][0][1])  # as a worker returns them: top to bottom, columns interleaved
    sent = []

    def worker(images):
        sent.append(len(images))
        return [{"width": 1000, "boxes": [b for b, _ in pairs], "txts": [t for _, t in pairs]}]

    monkeypatch.setattr(runpod, "ocr_available", lambda: True)
    monkeypatch.setattr(runpod, "read_pages", worker)
    monkeypatch.setattr(ocr, "_engine", lambda: pytest.fail("the local engine was loaded"))
    from PIL import Image
    text = ocr.read_images([Image.new("RGB", (1000, 400), "white")])
    assert sent == [1] and text.splitlines() == ["SKILLS", "Excel", "SQL", "Python", "EXPERIENCE", "Data clerk",
                                                 "Built reports", "Filing"]


@needs_ocr
def test_a_cold_or_failing_runpod_worker_falls_back_to_this_server(monkeypatch):
    from app import runpod

    def cold(images):
        raise TimeoutError("worker still waking")

    monkeypatch.setattr(runpod, "ocr_available", lambda: True)
    monkeypatch.setattr(runpod, "read_pages", cold)
    text, from_scan = documents.read("cv.pdf", _scanned_pdf())
    assert from_scan and "Excel" in text


def test_runpod_read_pages_sends_images_and_checks_the_answer(monkeypatch):
    import httpx

    from app import runpod
    from app.config import get_settings
    monkeypatch.setenv("RUNPOD_API_KEY", "test-key")
    monkeypatch.setenv("RUNPOD_OCR_ENDPOINT", "ocr123")
    get_settings.cache_clear()
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs["json"]["input"]["images"]))
        return httpx.Response(200, json={"status": "COMPLETED", "output": {"pages": [{"width": 10, "boxes": [], "txts": []}]}},
                              request=httpx.Request("POST", url))

    monkeypatch.setattr(runpod, "_post", post)
    try:
        assert runpod.read_pages([b"jpeg-bytes"]) == [{"width": 10, "boxes": [], "txts": []}]
        assert calls[0][0].endswith("/ocr123/runsync") and calls[0][1] == ["anBlZy1ieXRlcw=="]
        monkeypatch.setattr(runpod, "_post", lambda url, **k: httpx.Response(
            200, json={"status": "FAILED"}, request=httpx.Request("POST", url)))
        with pytest.raises(RuntimeError):
            runpod.read_pages([b"x"])
    finally:
        get_settings.cache_clear()


def test_a_spreadsheet_is_not_called_a_broken_word_document():
    data = io.BytesIO()
    import zipfile
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr("xl/workbook.xml", "<workbook/>")
    with pytest.raises(documents.UnreadableDocument, match="Upload a PDF, Word"):
        documents.read("skills.xlsx", data.getvalue())
