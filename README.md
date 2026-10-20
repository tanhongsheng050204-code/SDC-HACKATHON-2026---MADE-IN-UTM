# Laluan: Future-Ready Workforce

**A career GPS for the AI era.** Laluan (Malay for “path”) helps workers and students explore how AI could change their work, identify transferable skills, and build a reskilling pathway toward future roles.

Built for **Domain 1: Aiversecity Future-Ready Workforce**, this hackathon prototype combines explainable role matching, three AI-adoption scenarios, dated trend signals, and connections to the UN Sustainable Development Goals (SDGs). An employer view supports aggregate workforce reskilling analysis.

> **Prototype data:** The bundled forecast snapshot is illustrative; its numbers are not verified WEF figures. Live trend collection adjusts that baseline and preserves its illustrative status. Use synthetic CVs and anonymous workforce data for demonstrations and evaluation.

## Features

| Feature | Current implementation |
|---|---|
| Skills profile | Upload a PDF, DOCX, or TXT CV, paste text, answer the intake questionnaire, or select skills manually. Review extracted skills before saving. |
| Task breakdown | Explore O*NET-referenced tasks labelled **automate**, **assist**, or **human**, with explanations and review status. |
| Future-role matching | Compare ranked roles, covered and missing skills, score breakdowns, and robust picks across all three scenarios. |
| Scenario exploration | Switch between **Slow**, **Baseline**, and **Accelerated** AI adoption and choose a year up to the snapshot horizon (currently 2030). |
| Reskilling pathways | Find courses mapped to missing skills, source links, estimated hours, and cost categories. Completed courses add their mapped skills to subsequent matching. |
| Future Skills Radar | Inspect research and job-posting signals, dated sources, and skill trends. Refreshing signals requires internet access. |
| SDG impact | Explore role and skill mappings to SDGs; selected SDG interests contribute a small ranking boost. |
| Future Cards | Create a read-only career summary link with a QR code. |
| Workforce view | Analyse an anonymous CSV or the bundled synthetic company to see aggregate role risk and reskilling moves. |

## Quick start

Requirements: **Python 3.12+**, **Node.js 20+**, and **npm**. Start the backend and frontend in separate terminals, each beginning at the repository root.

### 1. Backend

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
# Optional configuration; skip if you already have a .env file.
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
# Optional configuration; skip if you already have a .env file.
cp .env.example .env
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

SQLite is initialised automatically at `backend/laluan.db`; no separate database service is required.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **[localhost:5173](http://localhost:5173)**. Vite proxies `/api` requests to the backend on port 8000.

- [Worker demo: Aisyah](http://localhost:5173/?demo=clerk)
- [Student demo: Wei Jie](http://localhost:5173/?demo=student)
- [API documentation](http://localhost:8000/docs)
- [Health and active model mode](http://localhost:8000/api/health)

The core demo works without an API key using bundled data, dictionary extraction, and template pathways. Installing dependencies, Gemini calls, trend collection, and opening external course or job links require internet access.

### Or run everything with Docker

With Docker Desktop running, from the repository root:

```bash
docker compose up --build
```

Open **[localhost:8080](http://localhost:8080)**; the API is on port 8000. Settings are read from `backend/.env` if it exists. Profiles are kept in a Docker volume between restarts (`docker compose down -v` clears them).

On Windows, Docker cannot read files that OneDrive manages ("Files On-Demand"). If the build fails with `invalid file request`, clone the repository to a folder outside OneDrive.

## Suggested demo flow

1. Open the worker demo and review Aisyah’s existing skills.
2. Inspect her current role’s task breakdown and the explanations for its AI labels.
3. Compare recommended roles, open **Why this rank?**, and switch scenarios and years.
4. Choose a role and review its skill gaps, course pathway, and SDG connections.
5. Mark a course complete and inspect the updated readiness and matching results.
6. Create a Future Card, then try the Workforce view with the synthetic company sample.

## Configuration

Backend settings load from environment variables and `backend/.env`; existing environment variables take precedence. See [backend/.env.example](backend/.env.example).

| Variable | Purpose / default |
|---|---|
| `GEMINI_API_KEY` | Optional. Leave empty for offline rules and templates; set to enable Gemini-assisted features. |
| `GEMINI_MODEL` | Generation model; defaults to `gemini-2.5-flash`. |
| `GEMINI_EMBEDDING_MODEL` | Embedding model; defaults to `gemini-embedding-001`. |
| `GEMINI_TIMEOUT_SECONDS` | Provider timeout; defaults to `15`. |
| `ADMIN_TOKEN` | Required for HTTP signal import and refresh operations. Use a long random value. |
| `CORS_ORIGINS` | Comma-separated frontend origins; defaults to `http://localhost:5173`. |
| `CONTACT_EMAIL` | Optional contact address for OpenAlex requests. |
| `DATABASE_PATH` | SQLite path; defaults to `backend/laluan.db`. |
| `DATA_DIR` | Reference-data directory; defaults to `backend/data`. |

For a separately hosted frontend, copy [frontend/.env.example](frontend/.env.example) to `frontend/.env` and set `VITE_API_URL` to the backend origin, without an `/api` suffix. Add the frontend origin to `CORS_ORIGINS`. Restart or rebuild the frontend after changing its environment settings.

## How matching works

Role ranking uses **60% weighted skill fit + 40% normalised outlook**, with a **0.05 boost** when a role serves one of the person’s selected SDGs. Roles classified as declining under the selected scenario rank below non-declining roles. Each result includes its score breakdown and source snapshot.

The scenario engine adjusts baseline growth using AI-adoption assumptions, automation exposure, and AI complementarity. Earlier years are interpolated linearly up to the source horizon. These are modelling assumptions, not validated predictions of an individual’s employment prospects. See [matching.py](backend/app/services/matching.py) and [scenario.py](backend/app/services/scenario.py).

## Refresh trend signals

The pipeline collects research counts from **arXiv**, with **OpenAlex** as a fallback, and skill mentions from Hacker News **“Who is hiring?”** threads. It stores raw inputs in `backend/data/raw/` and writes dated snapshots to `backend/data/signals/`, preserving the baseline for comparison.

For the in-app **Admin: refresh trend data** action, configure `ADMIN_TOKEN` in `backend/.env` and supply it in the admin interface. HTTP refresh and import operations require the `X-Admin-Token` header.

Alternatively, run the local script from `backend/` (the script does not require the HTTP admin token):

```powershell
.\.venv\Scripts\python.exe scripts/refresh_trends.py
# Recollect even if today's raw counts are already cached:
.\.venv\Scripts\python.exe scripts/refresh_trends.py --force
```

On macOS/Linux, replace `.\.venv\Scripts\python.exe` with `.venv/bin/python`. Schedule refreshes externally with cron or Windows Task Scheduler if needed; starting the app does not schedule collection.

Research activity and Hacker News postings are limited proxies for demand. Refreshing them does not turn an illustrative baseline into verified labour-market statistics.

## Checks and evaluation

Run backend tests from `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pytest
```

On macOS/Linux, use `.venv/bin/python -m pytest`.

Check TypeScript and produce a frontend build from `frontend/`:

```bash
npm run build
```

Additional scripts in `backend/scripts/` support course-link checks (`check_links.py`), synthetic CV extraction evaluation (`eval_extraction.py`), and deletion of profiles not updated for 30 days (`cleanup.py`). Cleanup is a manual or externally scheduled operation.

Human extraction scores and career-pathway review results remain to be recorded in [Evaluation](docs/EVALUATION.md). Automated checks do not establish career-guidance quality or verify external course pricing and availability.

## Data and prototype limits

- **Forecasts:** Replace the illustrative seed with verified, dated source figures before presenting forecasts as sourced statistics. The current bundled horizon is 2030.
- **Task labels:** O*NET references identify task sources; automate/assist/human labels are project annotations. Team review is incomplete where `reviewed_by` is empty.
- **Courses:** Cost categories, estimated hours, links, and availability need provider verification. Exact RM prices and HRD Corp eligibility are not established.
- **CV handling:** Uploaded documents are processed in memory, and raw CV text is not stored by the application. Text is scrubbed before optional model calls; saved profiles and course progress are stored in SQLite. Use synthetic inputs for the hackathon.
- **Profile access:** The prototype has no user account authentication. Profile access uses the profile UUID, which the frontend remembers locally; shared cards use a separate read-only link. Treat those links as sensitive.
- **Workforce view:** Results are aggregate reskilling suggestions. The CSV parser rejects identifying column names, but input data still needs to be anonymous. Use the synthetic sample for demonstrations.

This is a local hackathon prototype. Hosted deployment, human evaluation, and production readiness are not established by this README.

## Project structure

```text
backend/
  app/
    api.py          # HTTP routes
    services/       # Intake, matching, tasks, pathways, cards, workforce
    trends/         # Research/job collectors and snapshot builder
    store.py        # SQLite profiles, progress, and shared cards
  data/             # Reference catalogues, signals, synthetic evaluation inputs
  scripts/          # Trend refresh, data preparation, evaluation, cleanup
  tests/            # API, service, trend, and data-integrity checks
frontend/
  src/
    App.tsx         # App shell and navigation between screens
    screens/        # One file per screen (landing, intake, roles, pathway, workforce...)
    components/     # Shared pieces: sidebar, role card, coach drawer, SDG tiles
    lib/            # API client, URL state, translations, formatting helpers
docs/               # Requirements, design, implementation plan, review evidence
```

Stack: **React 18 + TypeScript + Vite**, **FastAPI + Pydantic**, **SQLite**, and optional **Google Gemini** generation and embeddings.

## Project documents

Planning documents, in reading order:

1. [PRD](docs/01-PRD.md) — goals, requirements, and success measures
2. [TRD](docs/02-TRD.md) — architecture, stack, and security design
3. [App Flow](docs/03-APP_FLOW.md) — screens and actions
4. [UI/UX Brief](docs/04-UI_UX_BRIEF.md) — visual direction
5. [Backend Schema](docs/05-BACKEND_SCHEMA.md) — data and rules
6. [Implementation Plan](docs/06-IMPLEMENTATION_PLAN.md) — milestones and definition of done

Supporting records: [Proposal](docs/PROPOSAL.md) · [AI declaration](docs/AI_DECLARATION.md) · [Decisions](docs/DECISIONS.md) · [Review log](docs/REVIEW_LOG.md) · [Code to explain](docs/CODE_TO_EXPLAIN.md) · [Evaluation](docs/EVALUATION.md).

Planning documents include intended work and pending review; consult the implementation and evidence records for current behaviour.

## License

[Apache License 2.0](LICENSE).
