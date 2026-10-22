"""Laluan's OCR worker for RunPod Serverless: page images in, text boxes out.

The API (backend/app/services/ocr.py) renders each page of a scanned CV, sends up to MAX_IMAGES JPEGs
here, and puts the boxes into reading order and scrubs the text itself, so this worker only reads.
Nothing is stored or logged: the images live in memory for one job.

Input:  {"images": ["<base64 JPEG or PNG>", ...]}
Output: {"pages": [{"width": int, "boxes": [[[x, y] x4], ...], "txts": [str, ...]}], "model": str}
"""

import base64
import io

import runpod
from PIL import Image
from rapidocr import RapidOCR

MAX_IMAGES = 3
MAX_SIDE = 1600
MODEL = "/models/en_PP-OCRv4_rec_infer.onnx"
KEYS = "/models/en_dict.txt"

# Loaded once per worker, before the first job; same settings as the API's local fallback.
ENGINE = RapidOCR(params={"Rec.model_path": MODEL, "Rec.rec_keys_path": KEYS,
                          "Rec.rec_batch_num": 1, "Global.use_cls": False})


def read(data: bytes) -> dict:
    image = Image.open(io.BytesIO(data))
    image.load()
    image = image.convert("RGB")
    image.thumbnail((MAX_SIDE, MAX_SIDE))
    result = ENGINE(image)
    boxes = [] if result.boxes is None else [[[float(x), float(y)] for x, y in box] for box in result.boxes]
    return {"width": image.width, "boxes": boxes, "txts": [str(t) for t in (result.txts or ())]}


def handler(job: dict) -> dict:
    images = (job.get("input") or {}).get("images") or []
    if not images or len(images) > MAX_IMAGES:
        return {"error": f"send 1 to {MAX_IMAGES} images"}
    try:
        return {"pages": [read(base64.b64decode(b)) for b in images], "model": "PaddleOCR PP-OCRv4 English (RapidOCR)"}
    except Exception as error:  # noqa: BLE001 - a broken image is the caller's to handle (it falls back)
        return {"error": f"{type(error).__name__}: could not read the image"}


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
