# Laluan OCR worker (RunPod Serverless)

Reads scanned CVs for the Laluan API: page images in, text boxes out. The API renders the pages, puts
the boxes in reading order and scrubs the text itself (`backend/app/services/ocr.py`); when this
worker is not set up, still waking or failing, the API reads the scan on its own server instead.

Same engine and model as the API's fallback: RapidOCR with the PaddleOCR PP-OCRv4 English recogniser
(Apache-2.0), checked against its SHA-256 at build time. Images live in memory for one job and are
never stored or logged.

## Deploy

1. RunPod → Serverless → **New Endpoint** → **GitHub repo**: this repository, branch `main`,
   Dockerfile path `runpod/ocr/Dockerfile`. RunPod builds from the repository root, and the Dockerfile
   expects that. (Or build and push it yourself: `docker build -f runpod/ocr/Dockerfile -t <you>/laluan-ocr .`
   from the repository root, then use that image.)
2. A **CPU** worker is enough (a page takes about 2 s). Max workers 1; idle timeout to taste.
3. Copy the endpoint ID into the API's environment as `RUNPOD_OCR_ENDPOINT` (the same `RUNPOD_API_KEY`
   calls it). On Render: `laluan-api` → Environment.

## Try it locally

```bash
docker build -f runpod/ocr/Dockerfile -t laluan-ocr-worker .
```

Put a job in `test_input.json` (`{"input": {"images": ["<base64 JPEG>"]}}`) next to `handler.py`
inside the container and run `python handler.py`; the RunPod SDK runs it once and prints the result.
