# Laluan OCR worker for RunPod Serverless (CPU is enough; a page takes about 2 s).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1

# OpenCV, used by RapidOCR, needs these two system libraries on a slim image.
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# The English recogniser (RapidOCR's bundled one is Chinese and drops the spaces between English
# words), checked against the same SHA-256 as backend/scripts/fetch_ocr_models.py.
ARG BASE=https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v2.1.0
RUN mkdir /models \
    && curl -fsSL -o /models/en_PP-OCRv4_rec_infer.onnx "$BASE/onnx/PP-OCRv4/rec/en_PP-OCRv4_rec_infer.onnx" \
    && curl -fsSL -o /models/en_dict.txt "$BASE/paddle/PP-OCRv4/rec/en_PP-OCRv4_rec_infer/en_dict.txt" \
    && echo "e8770c967605983d1570cdf5352041dfb68fa0c21664f49f47b155abd3e0e318  /models/en_PP-OCRv4_rec_infer.onnx" | sha256sum -c - \
    && echo "5662df9d2d03f0e8ca0d3b0649d6acbab904b6a14b3d3521463c71c37c668ce3  /models/en_dict.txt" | sha256sum -c -

COPY handler.py .
# Start the engine once at build time so RapidOCR fetches its own text detector into the image.
RUN python -c "import handler"

CMD ["python", "-u", "handler.py"]
