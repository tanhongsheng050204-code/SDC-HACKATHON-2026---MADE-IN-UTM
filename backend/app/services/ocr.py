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
MIN_COLUMN_LINES = 4  # lines on each side of a gap before a page counts as two columns
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
    """The recogniser sometimes drops the space after a comma or colon, and reads a bullet as a dot."""
    line = re.sub(r"^\s*[.•·*●▪]\s*(?=[A-Za-z])", "", line)
    return re.sub(r"(?<=[,:;])(?=[A-Za-z])", " ", line).strip()


def _column_gap(spans: list[tuple[float, float]], width: float) -> float | None:
    """The x of an empty vertical band between two columns, or None for a one-column page.

    A two-column CV (a sidebar with contact details and skills beside the main text) has a band no
    text crosses; reading straight across would interleave the two. The band must sit in the middle
    60% of the page and have at least MIN_COLUMN_LINES lines on each side."""
    covered = [False] * (int(width) + 1)
    for x0, x1 in spans:
        for x in range(max(0, int(x0)), min(int(width), int(x1)) + 1):
            covered[x] = True
    best = None
    x = int(width * 0.2)
    while x < width * 0.8:
        if covered[x]:
            x += 1
            continue
        start = x
        while x < width * 0.8 and not covered[x]:
            x += 1
        gap = (start + x) / 2
        left = sum(1 for x0, x1 in spans if x1 <= start)
        right = sum(1 for x0, x1 in spans if x0 >= x)
        if left >= MIN_COLUMN_LINES and right >= MIN_COLUMN_LINES and (best is None or x - start > best[1]):
            best = (gap, x - start)
    return best[0] if best else None


def _reading_order(boxes, txts, width: float) -> list[str]:
    """Text in the order a person reads it: each column top to bottom, pieces on one line left to right."""
    items = []
    for box, text in zip(boxes, txts):
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        items.append((min(xs), max(xs), min(ys), max(ys), text))
    gap = _column_gap([(x0, x1) for x0, x1, *_ in items], width)
    columns = [[i for i in items if i[1] <= gap], [i for i in items if i[1] > gap]] if gap else [items]
    lines = []
    for column in columns:
        column.sort(key=lambda i: (i[2] + i[3]) / 2)
        row: list = []
        for item in column:  # pieces whose middles share a line ("Pasir Gudang ... Jun - Aug 2025")
            if row and abs((item[2] + item[3]) / 2 - (row[0][2] + row[0][3]) / 2) > (row[0][3] - row[0][2]) / 2:
                lines.append(" ".join(i[4] for i in sorted(row)))
                row = []
            row.append(item)
        if row:
            lines.append(" ".join(i[4] for i in sorted(row)))
    return lines


def read_images(images: list) -> str:
    engine = _engine()
    lines = []
    with _lock:
        for image in images:
            result = engine(image)
            if result.txts:
                lines += [_tidy(t) for t in _reading_order(result.boxes, result.txts, image.width)]
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
