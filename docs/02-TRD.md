# 2. Technical Requirements (TRD)

> Status: AI-assisted draft. Reviewed by ______ on ______.

## Stack

| Part | Choice | Why |
|---|---|---|
| Web app | React 18 + TypeScript + Vite, plain CSS with design tokens | Light, mobile-friendly, fast to build |
| API | Python 3.12+ FastAPI + Uvicorn | Same language as the data pipeline |
| Trend pipeline | Python scripts, re-runnable on demand or on a schedule | Meets "updatable source"; each run writes a dated snapshot |
| Reference data | Versioned JSON in `backend/data/` | Dated and diff-able in git |
| User data | SQLite | Zero setup |
| Language model | Google Gemini (model name shown in the app), optional | Every LLM step has an offline fallback |
| Hosting | Frontend on Vercel, API on Render or Railway | Free tiers |

## Trend signal layer (must-have M2)

The brief says hard-coded lists alone do not count. Signals come from public sources through scripts
anyone can re-run:

| Source | What it measures | How it is used |
|---|---|---|
| **arXiv API** (public) | New AI papers per month per capability (document understanding, speech, code generation, vision, robotics, agents) | **AI advancement**: rising capability momentum raises the automation exposure of the tasks it can do |
| **Public job postings** (e.g. Hacker News "Who is hiring" via its public search API; terms of use to be checked) | Mentions of each skill per month | **Job-market demand** for skills, which feeds the Future Skills Radar |
| **WEF Future of Jobs Report 2025** | Expected growth and decline by role to 2030 | **Baseline** outlook |
| **O\*NET** (open database) | Skills and tasks per occupation | Role skill lists, task lists, codes for citation |

**From signals to forecasts** (simple, explainable, capped):

```
skill_trend      = change in monthly mention share over the last 6 months (job postings)
capability_trend = change in monthly paper count over the last 12 months (arXiv), scaled 0–1
exposure_adj     = automation_exposure + 0.2 × Σ capability_trend of capabilities that can do the role's tasks
role_outlook     = WEF baseline + skill-demand adjustment (capped at ±15 points) − exposure adjustment
scenario outlook = role_outlook + (adoption − 1) × 40 × (ai_complementarity − exposure_adj)
```

Each collector run saves its raw counts with the query and date; the builder writes a new snapshot
`data/signals/<date>-<slug>.json` and never edits an old one. If a source fails, the last good
snapshot stays in use and its date is shown.

## Matching and scoring

`fit = covered skill weight ÷ total weight` (core 3, important 2, useful 1) ·
`score = 0.6 × fit + 0.4 × outlook (0–1) + 0.05 if the role serves a goal the user chose` ·
declining roles rank last · every role returns the breakdown, an estimate range across scenarios and a citation.

## Architecture

```
Browser ── Intake → Future Skills Radar → Roles (scenarios, year) → Why this rank → Pathway → Impact
   │          HR view (CSV, aggregate)         Admin: refresh trend data / approve changes
   ▼
FastAPI /api ── intake (scrub → skills) · matching · pathway (catalogue + grounding) · sdg · workforce
   ▲
backend/data/signals/*.json  ◄── build_snapshot ◄── collect_arxiv · collect_jobs · WEF/O*NET CSV
```

## Auth, privacy and fairness

| Topic | Rule |
|---|---|
| Accounts | None; a profile is reached by a random UUID; admin actions need `ADMIN_TOKEN` |
| Personal data | Only synthetic profiles and CVs (brief, section 6). `scrub()` removes IC, phone, email and names before any LLM call; uploaded CVs are read in memory and never stored |
| Fairness | No age, gender, ethnicity or background fields; the API rejects them; tests check that names don't change rankings |
| Human-centred | AI proposes, people decide: coach and trend changes need approval; the HR view is aggregate-only, never ranks individual employees |
| No invention | Roles, courses and figures come only from reference data with sources; AI text passes the grounding check |
| Model disclosure | `/api/health` and the footer name the model in use |
| Secrets | `.env` only |

## Targets

Re-rank < 300 ms · first page < 2 s · LLM timeout 15 s then offline fallback · trend refresh < 60 s with a progress message.

## Key decisions

| Choice | Instead of | Reason |
|---|---|---|
| Transparent, capped formula over public signals | Training our own forecasting model | Explainable, traceable, no labelled data needed |
| Several modest sources, each dated | One "perfect" source | Resilient; judges can check each one |
| Snapshots are immutable | Updating numbers in place | History shows how forecasts changed |
| Catalogue-only pathway steps | LLM-generated courses | The brief forbids invented courses |
