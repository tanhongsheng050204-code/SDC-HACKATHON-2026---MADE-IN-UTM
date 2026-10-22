"""Download the English text recogniser for scanned CVs into backend/models/ocr (app/services/ocr.py).

    python scripts/fetch_ocr_models.py

RapidOCR's bundled recogniser is the Chinese model, which drops the spaces between English words; the
PaddleOCR PP-OCRv4 English recogniser (Apache-2.0, from RapidOCR's model hub) keeps them. Each file is
checked against its SHA-256 before it is kept, and the engine is started once so RapidOCR also fetches
its own text detector. The Docker build runs this; run it once locally to read scans in development.
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import ocr  # noqa: E402

BASE = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v2.1.0"
FILES = {
    ocr.REC_MODEL: (f"{BASE}/onnx/PP-OCRv4/rec/en_PP-OCRv4_rec_infer.onnx",
                    "e8770c967605983d1570cdf5352041dfb68fa0c21664f49f47b155abd3e0e318"),
    ocr.REC_KEYS: (f"{BASE}/paddle/PP-OCRv4/rec/en_PP-OCRv4_rec_infer/en_dict.txt",
                   "5662df9d2d03f0e8ca0d3b0649d6acbab904b6a14b3d3521463c71c37c668ce3"),
}


def main() -> None:
    ocr.MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for path, (url, sha256) in FILES.items():
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == sha256:
            print(f"{path.name}: already here")
            continue
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != sha256:
            raise SystemExit(f"{path.name}: checksum does not match, not saved")
        path.write_bytes(data)
        print(f"{path.name}: downloaded ({len(data) // 1024} KB)")
    print("OCR ready" if ocr.available() else "OCR libraries missing: pip install -r requirements.txt")


if __name__ == "__main__":
    main()
