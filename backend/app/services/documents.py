"""Read the text of an uploaded CV (PDF, DOCX or plain text) in memory. Nothing is written to disk.

DOCX is a zip of XML: the text lives in word/document.xml, so no extra library is needed.
"""

import io
import re
import zipfile

MAX_BYTES = 5 * 1024 * 1024
MAX_CHARS = 20_000
_PARAGRAPH = re.compile(r"</w:p>")
_TAG = re.compile(r"<[^>]+>")
_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'"}


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


def read_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_BYTES:
        raise UnreadableDocument("File is larger than 5 MB")
    name = filename.lower()
    if name.endswith(".pdf") or data[:5] == b"%PDF-":
        text = _pdf_text(data)
    elif name.endswith(".docx") or data[:2] == b"PK":
        text = _docx_text(data)
    elif name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="ignore")
    else:
        raise UnreadableDocument("Upload a PDF, DOCX or TXT file")
    text = re.sub(r"[ \t]+", " ", text).strip()
    if len(text) < 50:
        raise UnreadableDocument("We could not find enough text in that file (scanned PDFs are not supported)")
    return text[:MAX_CHARS]
