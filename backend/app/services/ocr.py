"""Read the text of a scanned CV or a photo of one, on this server: no outside service sees the file.

Pages are rendered with PDFium (pypdfium2) and read by RapidOCR, which runs the PaddleOCR (PP-OCR)
models on ONNX Runtime. The bundled recogniser is the Chinese one and drops the spaces between English
words, so the English recogniser is used instead; scripts/fetch_ocr_models.py downloads it (with its
checksum) into backend/models/ocr, which the Docker build does too. The text then goes through the
same scrubbing as any CV (app/services/deid.py) before a language model sees it.

Everything is imported lazily, so the app starts, and every other upload works, without these
libraries or models: available() says whether scans can be read.
"""

import io
import re
import threading
from functools import lru_cache
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[2] / "models" / "ocr"
REC_MODEL = MODEL_DIR / "en_PP-OCRv4_rec_infer.onnx"
REC_KEYS = MODEL_DIR / "en_dict.txt"
MAX_PAGES = 3      # a CV's first pages hold the skills; more would only slow the upload
# Longest side, in pixels, of a page before OCR. The text detector's memory grows with page size: an A4
# page at 1,200 px peaked near 300 MB in the Docker image against about 450 MB at 1,750 px, and still
# read 10-point text without a miss. It keeps a scan inside a 512 MB server.
MAX_SIDE = 1200
MAX_PIXELS = 40_000_000  # refuse images bigger than this (decompression bombs)
_lock = threading.Lock()  # one scan at a time: caps memory on a small server


class Unavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _engine():
    if not (REC_MODEL.exists() and REC_KEYS.exists()):
        raise Unavailable("OCR models missing: run scripts/fetch_ocr_models.py")
    try:
        from rapidocr import RapidOCR
    except ImportError as error:
        raise Unavailable("OCR libraries not installed") from error
    # One text line at a time and no angle classifier: measured on a test page, both read more lines
    # correctly (40 of 40 against 34) and neither raised peak memory.
    return RapidOCR(params={"Rec.model_path": str(REC_MODEL), "Rec.rec_keys_path": str(REC_KEYS),
                            "Rec.rec_batch_num": 1, "Global.use_cls": False})


def available() -> bool:
    try:
        _engine()
        return True
    except Unavailable:
        return False


def _tidy(line: str) -> str:
    """The recogniser sometimes drops the space after a comma or colon."""
    return re.sub(r"(?<=[,:;])(?=[A-Za-z])", " ", line).strip()


def read_images(images: list) -> str:
    engine = _engine()
    lines = []
    with _lock:
        for image in images:
            result = engine(image)
            lines += [_tidy(t) for t in (result.txts or ())]
    return "\n".join(line for line in lines if line)


def pdf_pages(data: bytes) -> list:
    import pypdfium2 as pdfium

    document = pdfium.PdfDocument(data)
    try:
        pages = []
        for i in range(min(len(document), MAX_PAGES)):
            page = document[i]
            width, height = page.get_size()  # in points
            pages.append(page.render(scale=MAX_SIDE / max(width, height)).to_pil())
        return pages
    finally:
        document.close()


def photo(data: bytes):
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # Pillow raises on anything bigger
    image = Image.open(io.BytesIO(data))
    image.load()
    image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    return image
