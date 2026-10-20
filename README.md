# Laluan: Future-Ready Workforce

**A career GPS for the AI era.** Laluan (Malay for “path”) shows workers and students how AI could change their work, which of their skills carry over, and a reskilling plan toward roles with a better outlook. You make the call; Laluan shows the evidence.

Built by team **Made in UTM** for **Domain 1: Aiversecity Future-Ready Workforce** at the XMUM hackathon. It combines explainable role matching, three AI-adoption scenarios, dated trend signals, cited reskilling pathways and links to the UN Sustainable Development Goals (SDGs), plus an aggregate view for HR teams.

## Try it

**[laluan-psi.vercel.app](https://laluan-psi.vercel.app)** · [Worker demo (Aisyah)](https://laluan-psi.vercel.app/?demo=clerk) · [Student demo (Wei Jie)](https://laluan-psi.vercel.app/?demo=student) · [HR workforce view](https://laluan-psi.vercel.app/?demo=hr) · [API docs](https://laluan-api.onrender.com/docs)

> The API runs on Render's free plan, which sleeps after about 15 minutes without visitors. The first click after a quiet spell can take up to a minute; the app shows “Waking up the server…” while it waits.
>
> **Data:** each role's net job growth to 2030 comes from the **WEF Future of Jobs Report 2025, Figure 2.3** (a global employer survey), read from the chart by [`extract_wef_figure.py`](backend/scripts/extract_wef_figure.py). Each role's AI-exposure settings are the team's own estimates, and every note says so. The demo people are synthetic. Use synthetic CVs and anonymous workforce files when trying it.

## What it does

| Feature | What you can do |
| --- | --- |
| **Skills profile** | Upload a CV (PDF, DOCX or TXT), paste one, answer a short questionnaire, or pick skills from a list. Names, emails, phone and IC numbers are removed before any AI reads the text, and the file is never stored. You confirm the skill list before it is saved. Profiles you don't save to an account are deleted after 30 days; log in with Google to keep yours until you delete it. |
| **Today** | Your home screen after opening a profile: top match, how your current role is trending, robust picks, your best five roles and next steps. Ask the coach straight from here. |
| **Future Skills Radar** | Skills rising, steady or declining, from research papers and job postings, each with its source and date. Your own skills are highlighted. |
| **My job, task by task** | O\*NET tasks for a job, labelled *AI likely to automate*, *AI assists you* or *stays human*. Tick the tasks you do to see your own split. |
| **Future roles** | Ranked roles under **Slow**, **Baseline** and **Accelerated** AI adoption, with a year slider up to the forecast horizon (2030). Every card shows an estimate range, its source and a **Why this rank?** breakdown. Robust picks stay in the top five in every scenario. |
| **Pathway** | Ordered courses for the skills you're missing, with hours, cost label and link-check date. Tick a course off and your readiness and rankings update. |
| **SDG impact** | How the role and each of its skills connect to the SDGs, with a written reason for every link. The SDG links explain each role; they are not a ranking preference. |
| **AI coach** | Answers questions about *your* results, citing them. It can suggest a change (another scenario), but nothing changes until you press **Apply**. |
| **Future Card** | A read-only summary with a QR code to show a counsellor, employer or family. It never shows the full skill list. |
| **Workforce view** | For HR teams: upload an anonymous `role,skills` CSV (or use the synthetic 160-person company) to see a risk heatmap by role and the cheapest reskilling moves. Totals only, never a ranking of people. |
| **Admin review** | New trend data from a refresh waits for a person: a before/after table of every role that would move, then **Approve** (name recorded) or **Reject** (reason kept). |
| **Review kit** | For the people checking our work: a native speaker marks each BM / 中文 string OK or fixes it, a teammate marks the 5 synthetic CVs without seeing the app's answers, and a lecturer reviews both personas' pathways. Each produces a file to commit. |
| **Sources** | Every forecast snapshot the app has used, with source, dates, status and who approved it. |
| **Inclusive design** | English, Bahasa Malaysia and Chinese interface; lite mode for slow connections; light and dark themes; keyboard and screen-reader friendly. |

## Suggested demo (about 3 minutes)

1. Open the **worker demo**. Aisyah is a data-entry clerk whose team just started using an AI tool that reads invoices.
2. On **Today**, ask the coach *“Is my current job at risk?”*.
3. Open **My job, task by task** to see which of her tasks AI is likely to automate.
4. Go to **Future roles**, switch between scenarios, drag the year slider and open **Why this rank?**.
5. Open the top role, **Build my pathway**, and tick a course as finished: readiness and rankings update.
6. **See my impact** for the SDG links, then **Create my Future Card** and scan the QR code.
7. Finish with the **Workforce view** and the synthetic sample company.

## Run it locally

You need **Python 3.12+**, **Node.js 20+** and npm. Start the backend and frontend in two terminals from the repository root.

### Backend

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env   # optional
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

macOS / Linux:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
cp .env.example .env   # optional
.venv/bin/python -m uvicorn app.main:app --reload --port 8000
```

SQLite is created automatically at `backend/laluan.db`; there is no separate database to set up.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **[localhost:5173](http://localhost:5173)**. Vite forwards `/api` to the backend on port 8000. Shortcuts: [worker demo](http://localhost:5173/?demo=clerk) · [student demo](http://localhost:5173/?demo=student) · [HR view](http://localhost:5173/?demo=hr) · [API docs](http://localhost:8000/docs).

Everything works without an API key, using the bundled data, a skill dictionary and template pathways. Gemini, trend collection and external course or job links need internet access.

### Or with Docker

With Docker Desktop running:

```bash
docker compose up --build
```

Open **[localhost:8080](http://localhost:8080)** (API on port 8000). Settings come from `backend/.env` if it exists; profiles are kept in a Docker volume (`docker compose down -v` clears them).

On Windows, Docker can't read files managed by OneDrive (“Files On-Demand”). If the build fails with `invalid file request`, clone the repository to a folder outside OneDrive.

## Deployment

One **Replit Deployment** runs everything: FastAPI serves the API under `/api` and the built React app at `/` (see [`.replit`](.replit)). Data lives in **Supabase**: Postgres for profiles, progress and trend snapshots, and Supabase Auth for Google login, so nothing is lost when the deployment restarts.

1. Import the repository into Replit and add the secrets listed in `.replit` (Secrets tab). `VITE_SUPABASE_*` must be set before the build, because Vite bakes them into the app.
2. In Supabase: enable the **Google** provider (Authentication → Providers) with a Google Cloud OAuth client (scopes `openid`, `email`, `profile`; authorised redirect = the Supabase callback URL), and add the Replit address and `http://localhost:5173` to **Redirect URLs**. Publish the Google consent screen to production, or only listed test users can sign in.
3. `DATABASE_URL` is the Supabase *Session pooler* connection string. Tables are created on first start.
4. Deploy (Autoscale, or Reserved VM to avoid a cold start during a demo).

The older Vercel + Render setup above stays live until the Replit address replaces it.

## Configuration

The backend reads environment variables and `backend/.env` (real environment variables win). See [backend/.env.example](backend/.env.example).

| Variable | Purpose / default |
| --- | --- |
| `GEMINI_API_KEY` | Optional. Empty means offline rules and templates; set it to use Gemini for CV reading, coach answers and pathway summaries. The model in use is shown in the app. |
| `GEMINI_MODEL` | Generation model, default `gemini-2.5-flash`. |
| `GEMINI_EMBEDDING_MODEL` | Embedding model, default `gemini-embedding-001`. |
| `GEMINI_TIMEOUT_SECONDS` | Provider timeout, default `15`. |
| `ADMIN_TOKEN` | Needed for **Refresh trend data** and snapshot import. Use a long random value. |
| `CORS_ORIGINS` | Comma-separated frontend addresses, default `http://localhost:5173`. |
| `CORS_ORIGIN_REGEX` | Optional pattern for hosts that serve one site under many addresses, e.g. Vercel's per-deploy URLs. |
| `CONTACT_EMAIL` | Optional contact address sent with OpenAlex requests. |
| `DATABASE_URL` | Postgres connection string (Supabase). Empty means the local SQLite file below. |
| `DATABASE_PATH` | SQLite file, default `backend/laluan.db`. |
| `SUPABASE_URL` | Supabase project URL; login tokens are verified against its public keys. |
| `SUPABASE_JWT_SECRET` | Only for Supabase projects still on the legacy shared JWT secret. |
| `FRONTEND_DIST` | Built frontend to serve at `/`, default `frontend/dist` when it exists. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Build-time, for the frontend's Google login. Without them the login button is hidden. |
| `DATA_DIR` | Reference data, default `backend/data`. |

For a separately hosted frontend, set `VITE_API_URL` (see [frontend/.env.example](frontend/.env.example)) to the backend address without `/api`, and add the frontend address to `CORS_ORIGINS`.

## How the ranking works

Each role scores **0.6 × weighted skill fit + 0.4 × scaled outlook**, plus **0.05** if it serves an SDG the person picked. Roles that are declining under the chosen scenario rank below the rest. Every card shows this breakdown and the snapshot it came from.

The scenario engine adjusts each role's baseline growth for AI-adoption speed, how exposed its tasks are to automation and how much AI complements it. Years before the horizon are interpolated. These are modelling assumptions, not predictions about any one person. See [matching.py](backend/app/services/matching.py) and [scenario.py](backend/app/services/scenario.py), and [CODE_TO_EXPLAIN.md](docs/CODE_TO_EXPLAIN.md) for a walkthrough.

## Trend signals

The refresh collects AI research counts from **arXiv** (falling back to **OpenAlex**) and skill mentions from Hacker News **“Who is hiring?”** threads. Raw counts go to `backend/data/raw/`; each refresh writes a new dated snapshot to `backend/data/signals/` and keeps the old ones, so rankings can be compared before and after.

**A person approves every update.** A refresh only saves the new snapshot for review. Under **Admin: refresh trend data** on the Future roles screen, an admin sees which roles would move and by how much, then approves it (their name is stored with the snapshot and shown on the Sources page) or rejects it with a reason (kept in `backend/data/signals/rejected/`). Users see nothing new until it is approved.

Run a refresh from that panel (needs `ADMIN_TOKEN`), or from `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts/refresh_trends.py          # reuse today's counts if present
.\.venv\Scripts\python.exe scripts/refresh_trends.py --force  # collect again
.\.venv\Scripts\python.exe scripts/refresh_trends.py --approve-as "Your name"  # you checked the output: publish it
```

On macOS/Linux use `.venv/bin/python`. Starting the app does not schedule refreshes; use cron or Task Scheduler if needed.

Research activity and Hacker News posts are rough proxies for demand. A refresh adjusts the WEF baseline within capped limits; it does not replace it.

## Tests and checks

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest     # 69 tests: API, services, trends, review, data integrity, privacy
cd frontend; npm run build                           # type check + production build
```

GitHub Actions runs both on every push and pull request ([ci.yml](.github/workflows/ci.yml)).

Scripts in `backend/scripts/`: `check_links.py` (opens every course link and records the date), `eval_extraction.py` (skill-extraction recall on the five synthetic CVs in `backend/data/eval/`), `cleanup.py` (deletes profiles untouched for 30 days), `build_snapshot.py` and `build_tasks.py` (rebuild reference data), `extract_wef_figure.py` (reads WEF Figure 2.3; needs `pip install pymupdf`).

Human scoring of the synthetic CVs and an outside review of the pathways are still to be recorded in [EVALUATION.md](docs/EVALUATION.md); the **Review kit** (`/?view=review-kit`) makes both quick.

## Limits of this prototype

- **Forecasts:** WEF figures are global, not Malaysia-specific, and come from an employer survey. AI operations specialist has no WEF category; it uses Process Automation Specialists as the closest match. The earlier illustrative seed is kept for history. Horizon: 2030.
- **Task labels:** tasks come from O\*NET 30.0; the automate / assist / human labels are our judgements, drafted with AI help and still being reviewed (`reviewed_by` in `backend/data/tasks.json`).
- **Courses:** RM prices and HRD Corp status come from each provider's own page and are dated (`price_checked`). Three paid courses (NIOSH, electrical, caregiver) have no published fee, so the app says to ask the provider; only the GRI training is confirmed HRD Corp-claimable.
- **CVs:** read in memory and scrubbed before any model call; only confirmed skills, goals and course progress are saved.
- **Accounts:** there are none. A profile is reached by its ID, which the browser remembers; Future Cards use a separate read-only link. Treat both links as private.
- **Workforce view:** files with name, email, IC or staff-ID columns are refused, but the data should still be anonymous before upload.

## Project structure

```text
backend/
  app/
    api.py              HTTP routes
    services/           intake, de-identification, matching, scenarios, pathways, coach, cards, workforce
    trends/             research and job-posting collectors, snapshot builder
    store.py            SQLite: profiles, progress, shared cards
  data/                 roles, skills, courses, tasks, SDG map, forecast snapshots, synthetic eval CVs
  scripts/              trend refresh, data builders, link checks, evaluation, cleanup
  tests/
  Dockerfile
frontend/
  src/
    App.tsx             app shell and navigation
    screens/            one file per screen; landing/ holds the landing page
    components/         sidebar, role card, coach drawer, SDG tiles, banners
    lib/                API client, URL state, translations, helpers
    styles/             app.css (app), site.css (public pages), landing.css
  public/               favicon and landing page photos
  Dockerfile, nginx.conf
docs/                   requirements, design, plan, decisions, review log, AI declaration
  submission/           SDC preliminary proposal and technical tools declaration
docker-compose.yml      run everything locally
.replit                 Replit deployment (API + built app in one process)
```

Stack: **React 18 + TypeScript + Vite**, **FastAPI + Pydantic**, **SQLite** locally / **Supabase Postgres + Auth** in production, optional **Google Gemini**; deployed on **Replit**.

## Project documents

1. [PRD](docs/01-PRD.md): goals, requirements and success measures
2. [TRD](docs/02-TRD.md): architecture, stack and security
3. [App Flow](docs/03-APP_FLOW.md): screens and actions
4. [UI/UX Brief](docs/04-UI_UX_BRIEF.md): look and feel
5. [Backend Schema](docs/05-BACKEND_SCHEMA.md): data and rules
6. [Implementation Plan](docs/06-IMPLEMENTATION_PLAN.md): milestones and what's done

SDC submission: [Preliminary proposal](docs/submission/SDC2026_MadeInUTM_Preliminary.md) · [Technical tools declaration](docs/submission/SDC2026_MadeInUTM_TechDeclaration.md)

How we built and checked it: [Proposal](docs/PROPOSAL.md) · [AI declaration](docs/AI_DECLARATION.md) · [Decisions](docs/DECISIONS.md) · [Review log](docs/REVIEW_LOG.md) · [Code to explain](docs/CODE_TO_EXPLAIN.md) · [Evaluation](docs/EVALUATION.md)

## Team

**Made in UTM**

| Member | Role |
| --- | --- |
| ______ | ______ |
| ______ | ______ |
| ______ | ______ |

## Credits and licence

Job growth figures from the [WEF Future of Jobs Report 2025](https://www.weforum.org/publications/the-future-of-jobs-report-2025/). Occupation tasks from [O\*NET 30.0](https://www.onetcenter.org/) (U.S. Department of Labor), used under CC BY 4.0. SDG names and colours from the United Nations. Landing page photos from [Unsplash](https://unsplash.com) by Gema Saputera, Mimi Thian and Vitaly Gariev; the people shown are not the demo personas.

Code under the [Apache License 2.0](LICENSE).
