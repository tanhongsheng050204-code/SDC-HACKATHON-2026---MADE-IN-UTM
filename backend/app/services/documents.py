"""Read the text of an uploaded CV (PDF, DOCX, plain text, or a scan or photo) in memory. Nothing is
written to disk.

DOCX is a zip of XML: the text lives in word/document.xml, so no extra library is needed. A PDF with no
text layer (a scan) and a JPG or PNG photo are read by OCR on this server (app/services/ocr.py).
"""

import io
import re
import zipfile

from app.services import ocr

MAX_BYTES = 5 * 1024 * 1024
MAX_CHARS = 20_000
MIN_CHARS = 50
_PARAGRAPH = re.compile(r"</w:p>")
_TAG = re.compile(r"<[^>]+>")
_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}


# Zip files that are not Word documents: a spreadsheet or slides would otherwise read as a "broken" .docx.
_OTHER_ZIPS = (".xlsx", ".xls", ".pptx", ".odt", ".ods", ".odp", ".zip", ".pages", ".numbers", ".key")


class UnreadableDocument(ValueError):
    pass


def _docx_text(data: bytes) -> str:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > 20 * MAX_BYTES:  # refuse zip bombs
                raise UnreadableDocument("Document is too large")
            xml = archive.read(info).decode("utf-8", errors="ignore")
    except (zipfile.BadZipFile, KeyError) as error:
        raise UnreadableDocument("Not a readable Word document") from error
    text = _TAG.sub("", _PARAGRAPH.sub("\n", xml))
    for entity, char in _ENTITIES.items():
        text = text.replace(entity, char)
    return text


def _pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:10])
    except (PdfReadError, ValueError) as error:
        raise UnreadableDocument("Not a readable PDF") from error


def _clean(text: str) -> str:
    return re.sub(r"[ \t]+", " ", text).strip()


def _scan_text(images) -> str:
    """Text read by OCR on this server (app/services/ocr.py), or a message saying what to do instead."""
    try:
        text = _clean(ocr.read_images(images()))
    except ocr.Unavailable as error:
        raise UnreadableDocument("This looks like a scanned CV or a photo, and this server cannot read scans yet. "
                                 "Paste the text or upload a Word file instead.") from error
    except Exception as error:  # noqa: BLE001 - a broken image or PDF page is the person's file, not a crash
        raise UnreadableDocument("We could not read that scan. Try a clearer scan, or paste the text.") from error
    if len(text) < MIN_CHARS:
        raise UnreadableDocument("We could not read enough text in that scan. Try a clearer, straight scan, "
                                 "or paste the text.")
    return text


def read(filename: str, data: bytes) -> tuple[str, bool]:
    """The CV's text, and whether it was read from a scan or photo (so the person checks it)."""
    if len(data) > MAX_BYTES:
        raise UnreadableDocument("File is larger than 5 MB")
    name = filename.lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        text = _clean(_pdf_text(data))
        if len(text) < MIN_CHARS:  # no text layer: a scan, a photo saved as PDF, or text drawn as shapes
            return _scan_text(lambda: ocr.pdf_pages(data))[:MAX_CHARS], True
    elif name.endswith((".jpg", ".jpeg", ".png")) or data[:3] == b"\xff\xd8\xff" or data[:8] == b"\x89PNG\r\n\x1a\n":
        return _scan_text(lambda: [ocr.photo(data)])[:MAX_CHARS], True
    elif name.endswith(".docx") or (data[:2] == b"PK" and not name.endswith(_OTHER_ZIPS)):
        text = _clean(_docx_text(data))
    elif name.endswith((".txt", ".md")):
        text = _clean(data.decode("utf-8", errors="ignore"))
    else:
        raise UnreadableDocument("Upload a PDF, Word (.docx), text file, or a photo (JPG or PNG)")
    if len(text) < MIN_CHARS:
        raise UnreadableDocument("We could not find enough text in that file. Paste the text instead.")
    return text[:MAX_CHARS], False


def read_text(filename: str, data: bytes) -> str:
    return read(filename, data)[0]
