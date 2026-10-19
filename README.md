# Laluan: Future-Ready Workforce

Hackathon entry for **Domain 1, Aiversecity Future-Ready Workforce**. Working name *Laluan*
(Malay for "path").

A career GPS for the AI era: it reads your skills, ranks future roles under three AI-adoption
scenarios, shows your skills gap, builds a cited reskilling pathway, and maps every role and
skill to the UN Sustainable Development Goals.

> ⚠️ The forecast numbers in `backend/data/signals/` are **illustrative seed data**, not real
> figures. Replace them with the WEF Future of Jobs 2025 figures (Implementation Plan task 2.1)
> before the demo. Course links with an empty `url` still need checking (task 2.4).

## Planning documents (read in this order)

1. [PRD](docs/01-PRD.md): what it must do and how success is measured
2. [TRD](docs/02-TRD.md): stack, architecture, security
3. [App Flow](docs/03-APP_FLOW.md): screens and actions
4. [UI/UX Brief](docs/04-UI_UX_BRIEF.md): look and feel
5. [Backend Schema](docs/05-BACKEND_SCHEMA.md): data and rules
6. [Implementation Plan](docs/06-IMPLEMENTATION_PLAN.md): milestones, owners, definition of done

How we reviewed the AI's work: [AI declaration](docs/AI_DECLARATION.md) ·
[Decisions](docs/DECISIONS.md) · [Review log](docs/REVIEW_LOG.md) ·
[Code to explain](docs/CODE_TO_EXPLAIN.md) · [Evaluation](docs/EVALUATION.md)

## Must-haves → where they are

| Must-have | Code |
|---|---|
| Skills profile intake | `backend/app/services/skills.py`, `intake.py`, `deid.py`; Intake screen |
| AI-trend signal layer (updatable, dated source) | `backend/app/trends/` (research + job-posting collectors, signal builder), `scripts/refresh_trends.py`, `POST /api/signals/refresh`; Future Skills Radar and source line on every role card |
| Future-role matching + skills gap | `backend/app/services/matching.py`; Roles and role detail screens |
| Personalised reskilling pathway | `backend/app/services/pathway.py` + `grounding.py`; Pathway section |
| SDG mapping | `backend/data/sdg_map.json`; SDG tiles and Impact screen |
| More than one future scenario | `backend/app/services/scenario.py`; Slow / Baseline / Accelerated switch |

## Run it

Backend (Python 3.12+), from `backend/`:

```bash
python -m venv .venv
```
```bash
.venv/Scripts/python -m pip install -r requirements-dev.txt
```
```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

Frontend (Node 20+), from `frontend/`:

```bash
npm install
```
```bash
npm run dev
```

Open http://localhost:5173 and press **Demo: Aisyah, data-entry clerk**.

Everything runs offline. To use Gemini, copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY`.

## Refresh the trend data

Set `ADMIN_TOKEN` in `backend/.env`, then either use **Admin: refresh trend data** on the Roles screen, or run:

```bash
.venv/Scripts/python scripts/refresh_trends.py
```

It counts AI research papers per capability (arXiv, or OpenAlex if arXiv is busy) and skill mentions in
Hacker News "Who is hiring?" threads, then writes a new dated snapshot in `backend/data/signals/`. Raw counts
are kept in `backend/data/raw/`. Run it on a schedule to keep the forecast current.

## Tests

```bash
.venv/Scripts/python -m pytest
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.
