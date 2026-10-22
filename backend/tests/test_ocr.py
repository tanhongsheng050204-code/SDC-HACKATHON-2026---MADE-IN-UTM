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
