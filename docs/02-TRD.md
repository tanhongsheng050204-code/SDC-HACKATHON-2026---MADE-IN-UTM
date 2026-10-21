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
| **arXiv API** (public); **OpenAlex** (open research index that includes arXiv) as automatic fallback | Papers per AI capability in the last 6 months (ending 60 days ago, as recent papers are still being indexed) vs the same months a year earlier | **AI advancement**: a capability accelerating faster than AI research overall raises the exposure of roles it can automate and the outlook of roles it complements |
| **Public job postings**: Hacker News "Ask HN: Who is hiring?" threads through the public Algolia API | Share of postings mentioning each skill (whole word or exact phrase) in the latest 3 monthly threads vs the same months a year earlier | **Job-market demand** for skills, which feeds the Future Skills Radar. Tech-heavy source: skills with fewer than 20 mentions show "too few postings" |
| **OpenDOSM API** (`api.data.gov.my`, dataset `wages_occupation`, Salaries & Wages Survey) | Salaried employees per MASCO major group, latest year vs 3 years earlier, compared with all employees | **Malaysian employment**: a local check on the global baseline. Nine groups only, so roles in the same group move together. Optional: if the API is down the refresh runs without it |
| **WEF Future of Jobs Report 2025** | Expected growth and decline by role to 2030 | **Baseline** outlook |
| **O\*NET** (open database) | Skills and tasks per occupation | Role skill lists, task lists, codes for citation |

**From signals to forecasts** (simple, explainable, capped):

```
momentum(capability) = log2(its paper growth ÷ median growth of all capabilities), clipped to ±1
                       (only acceleration above 0 moves roles and skills)
skill trend          = change in share of postings mentioning it (needs ≥ 20 mentions)
                       + 0.5 × (momentum of capabilities that boost it − of those that automate it), clipped to ±1
role demand points   = 15 × weighted mean skill trend of the role's skills, capped ±15
role AI points       = 15 × (mean momentum of complementing − of exposing capabilities), capped ±15
Malaysian points     = employee growth of the role's MASCO group − growth of all employees
                       (percentage points over 3 years), capped ±10
net growth           = WEF baseline + demand points + Malaysian points + AI points
scenario outlook     = net growth + (adoption − 1) × 40 × (ai_complementarity − automation_exposure)
```

Mappings (which capability exposes or complements which role, which job term counts for which skill)
live in `data/capabilities.json` and `data/job_terms.json` and are reviewed by the team.

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
