# Laluan: Future-Ready Workforce

**A career GPS for the AI era.** Laluan (Malay for “path”) shows workers and students how AI could change their work, which of their skills carry over, and a reskilling plan toward roles with a better outlook. You make the call; Laluan shows the evidence.

Built by team **Made in UTM** for **Domain 1: Aiversecity Future-Ready Workforce** at the XMUM hackathon. It combines explainable role matching, three AI-adoption scenarios, dated trend signals, cited reskilling pathways and links to the UN Sustainable Development Goals (SDGs), plus an aggregate view for HR teams.

## Try it

**[laluan-psi.vercel.app](https://laluan-psi.vercel.app)** · [Worker demo (Aisyah)](https://laluan-psi.vercel.app/?demo=clerk) · [Student demo (Wei Jie)](https://laluan-psi.vercel.app/?demo=student) · [HR workforce view](https://laluan-psi.vercel.app/?demo=hr) · [API docs](https://laluan-api.onrender.com/docs)

> The API runs on Render's free plan, which sleeps after about 15 minutes without visitors. The first click after a quiet spell can take up to a minute; the app shows “Waking up the server…” while it waits.
>
> **Data:** each role's net job growth to 2030 comes from the **WEF Future of Jobs Report 2025, Figure 2.3** (a global employer survey), read from the chart by [`extract_wef_figure.py`](backend/scripts/extract_wef_figure.py). Each role's AI-exposure settings are the team's own estimates, and every note says so. Pay figures are **DOSM Salaries & Wages Survey Report 2025**, Appendix table A10: monthly medians for Malaysian citizens by occupation group, shown as group medians, never as job offers. The demo people are synthetic. Use synthetic CVs and anonymous workforce files when trying it.

## What it does

| Feature | What you can do |
| --- | --- |
| **Skills profile** | Upload a CV (PDF, DOCX or TXT), paste one, answer a short questionnaire, or pick skills from a list. Names, emails, phone and IC numbers, addresses, birth dates and employer or school names are removed before any AI reads the text, and **What gets sent** shows you the exact text (which you can still edit) before it goes. The file is never stored. With a RunPod open model configured, CV text goes to it instead of Gemini. A mic button on skill entry, the survey and the coach turns speech into text (Whisper on RunPod, else the browser's own recognition, else typing); audio is never stored. Only that one extraction step sees CV text: afterwards the language model receives only skill names, role titles and your scrubbed questions (a test checks this). Use a paid-tier Gemini key for any public deployment; Google does not use paid-tier requests to improve its products. You confirm the skill list before it is saved. Profiles you don't save to an account are deleted after 30 days; log in with Google to keep yours until you delete it. |
| **Today** | One **next step** in plain words, a four-step journey (**Where I stand → Explore roles → Build my skills → Apply and share**) showing what is done, the coach, how your current job is trending and your best three roles. The sidebar follows the same four steps. |
| **Role pages in four tabs** | **Overview** (a day in the job, why this rank, outlook by scenario with the x-ray, pay, pros and cons), **Fit and plan** (skills you bring, have and need, evidence, pathway), **Market** (open jobs in Malaysia, MyCOL and programmes, where experts disagree) and **Practise and share** (identity statement, interview practice, Future Card). The tab is kept in the address. |
| **My profile** | Edit your skills, current job, years of experience and situation in place; add more skills from a CV or the questionnaire; your target role and progress stay. |
| **Target role** | **Make this my target** on any role page. Pathway, SDG impact, practice and sharing follow it, and it is saved with your profile. |
| **Future Skills Radar** | A **forecast to 2030** for every skill with enough data: the change in the share of job ads that mention it, projected from three years of quarterly history and AI research momentum, with an 80% range under each AI-adoption scenario, a history-and-forecast chart, **Likely** or **Uncertain**, and **Emerging** when growth is speeding up. Jobs rising and declining under the same scenario, with Malaysia's own employment trend per occupation group (OpenDOSM). A **backtest** says how well the method did on the last year of data, good or bad. Every number names its source and date; your own skills are highlighted. |
| **My job, task by task** | O\*NET tasks for a job, labelled *AI likely to automate*, *AI assists you* or *stays human*. Tick the tasks you do to see your own split. |
| **Future roles** | Ranked roles under **Slow**, **Baseline** and **Accelerated** AI adoption, with a year slider up to the forecast horizon (2030). Every card shows an estimate range, its source and a **Why this rank?** breakdown. Robust picks stay in the top five in every scenario. |
| **Your own AI future** | On **Future roles**, drag AI adoption from 0.5× to 2× (not just the three scenarios). Laluan names your **tipping points**: the speed at which your current job turns Declining, or another role overtakes your top match. |
| **Forecast x-ray** | Tap 🔍 beside any outlook to see each step from the published WEF figure to the number shown, with sources. |
| **Why it could work / what could go wrong** | Two columns on every role, for *your* profile: skills you have, growth, plan hours, pay difference in RM; and missing core skills, the share of its tasks AI is likely to automate, paid courses, and when WEF has no exact category for the role. Every point names its source, and none is written by a model. |
| **Pathway** | Ordered courses for the skills you're missing, with hours, cost label and link-check date. Tick a course off and your readiness and rankings update. |
| **SDG impact** | How the role and each of its skills connect to the SDGs, with a written reason for every link. The SDG links explain each role; they are not a ranking preference. |
| **AI coach** | Answers questions about *your* results, citing them. It can suggest a change (another scenario), but nothing changes until you press **Apply**. |
| **Future Card** | A read-only summary with a QR code to show a counsellor, employer or family. It never shows the full skill list. |
| **Who you are** | The first question is *I'm working*, *I'm studying or just graduated* or *I'm changing careers*. Workers see their job's risk first and HRD Corp-claimable courses first; graduates see roles open to new graduates (a visible boost); switchers see the skills they bring from their current job, and their current role is kept out of the ranking. |
| **Skill tree** | Skills you have at the bottom, your target role on top. Prove each level (Basic, Working, Advanced) with three questions Gemini writes on the spot; two right fills the next part of the ring. The server keeps the answers and grades. |
| **What I enjoy** | A short survey of real tasks and settings from the roles you match. Like, dislike or say it in your own words; Laluan names the preferences your answers reveal, gives a small visible boost to roles that fit them and suggests roles you might not have considered. |
| **Class view** | For TVET and university career centres: an anonymous class list in, the roles the class fits, the skills most students still need and the courses that help most students out. Totals only; groups under three are hidden. |
| **For organisations** | For HR teams: upload an anonymous `role,skills` CSV (or use the synthetic 190-person company) to see a risk heatmap by role and the cheapest reskilling moves. Totals only, never a ranking of people. |
| **Admin review** | One **Admin** page (linked from Sources, needs the admin token) for every check: trend refreshes, skill evidence, emerging roles and “a day in this job” drafts. New trend data waits for a person: a before/after table of every role that would move, then **Approve** (name recorded) or **Reject** (reason kept). |
| **Review kit** | For the people checking our work: a native speaker marks each BM / 中文 string OK or fixes it, a teammate marks the 5 synthetic CVs without seeing the app's answers, and a lecturer reviews both personas' pathways. Each produces a file to commit. |
| **Sources** | Every forecast snapshot the app has used, with source, dates, status and who approved it. |
| **Where experts disagree** | AI-exposure studies disagree, so each role shows three of them side by side inside its forecast x-ray: the Anthropic Economic Index (observed use), OpenAI's “GPTs are GPTs” and the ILO's 2025 global index, each as a percentile among the occupations it covers, next to Laluan's own estimate by rank. Display only; when Laluan's estimate falls outside every study, the role is flagged for the team to review. **Future roles → Map** plots every role's exposure against its outlook, with your top five highlighted. |
| **How Malaysians use AI** | From the Anthropic Economic Index's Malaysia data: what people in Malaysia use AI for compared with the world (Skills Radar), and on each role how much AI use is about that kind of work and whether the AI does the task or helps a person. |
| **AI does it, or helps you** | On **My job, task by task**, each O\*NET task the index covers shows how people actually use AI for it: the share where the AI does the task and the share where it helps a person do it. |
| **Malaysian programmes** | On every role: whether employers listed it on TalentCorp's MyCOL 2024/2025 critical occupations list (with the report page), plus links to MyMahir and the free Jelajah AI MyMahir training. Links only, no endorsement implied. |
| **Career identity statement** | One or two sentences for an interview or CV, built only from your current job, the skills you already have that the role uses and the next core skill you are building. Gemini rewrites it more naturally and is checked against those facts; the Future Card shows the rules version. |
| **Open now in Malaysia** | On every role: how many live Malaysian postings mention it, and the three newest whose title names the role, each linking to the employer or JobStreet page. From [freehire.me](https://freehire.me)'s open, keyless API (MIT-licensed project), cached for six hours; if it is down, the plain job-board searches remain. |
| **Practise an interview** | Five questions for one role: why this role, then the skills you are missing first. Short feedback after each answer (Gemini, or plain rules offline); answers pass the prompt-injection check and the personal-details scrubber, and nothing is saved. Voice input works here too. |
| **Plain-language help** | A “?” beside jargon on Today (skill fit, outlook, robust pick), and a badge on each coach answer saying whether AI or plain rules wrote it, or a safety check stopped it. |
| **Safety checks** | Coach questions and CV text are checked for prompt injection (“ignore previous instructions…”, “change my score”) before any model reads them; the coach answers with a calm refusal and the CV is read by the skill dictionary only. |
| **Inclusive design** | English, Bahasa Malaysia and Chinese throughout: every screen, plus role titles, skill names, summaries, scenario and task text (`backend/data/translations.json`, drafted with [`build_translations.py`](backend/scripts/build_translations.py)). Course names, job-ad quotes and coach answers stay in English, the coach so each sentence can be checked against its English sources. Lite mode for slow connections; light and dark themes; keyboard and screen-reader friendly. |

## How Laluan meets the judging criteria

| Criterion (weight) | Where to look |
| --- | --- |
| **Innovation & Creativity (30%)** | *How trend signals become skill forecasts:* damped, shrunk trends over three years of job ads and research, projected to 2030 per scenario with an 80% range and a published backtest ([forecast.py](backend/app/trends/forecast.py), **Radar**); the **forecast x-ray** on any role ([xray.py](backend/app/services/xray.py)) and the approved snapshots on **Sources**. *How we handle disagreement:* the **Where experts disagree** band and the **Map** on Future roles. *How scenarios are modelled:* the adoption slider and **tipping points** ([tipping.py](backend/app/services/tipping.py)). *How SDG links change choices:* each role's and skill's SDG links on **SDG impact**. |
| **Problem-Solution Fit (25%)** | The whole chain: AI-advancement tracking ([trends/](backend/app/trends/)), rising and declining skills (**Radar**), role matching (**Future roles**), skill tree and costed pathway, SDG links (**SDG impact**). People stay in charge: the coach only suggests, trend updates need an admin's approval, and every screen says “You decide”. |
| **Feasibility of Build (25%)** | Live demo (links above); the trend layer feeds matching live (**Admin: refresh trend data**, then approve: rankings change). **Hardest risk: reliable, updatable trend data.** Public job-ad and research counts are noisy proxies, and free APIs limit or refuse requests. Fallbacks: noisy trends are shrunk towards no change and shown with 80% ranges; the backtest is published even where it is weak; every source is dated and every refresh waits for a person's approval; arXiv → OpenAlex (optional API key) → the two-period comparison → the last approved snapshot. Other risks: AI inventing jobs or courses → catalogue-only steps, grounding check, prompt-injection guardrails; no API key → full offline mode. 337 automated tests. Public and synthetic data only. |
| **Clarity of Proposal (20%)** | [Preliminary proposal](docs/submission/SDC2026_MadeInUTM_Preliminary.md), this README, and plain-language “?” tips in the app. |

## Suggested demo (about 3 minutes)

1. Open the **worker demo**. Aisyah is a data-entry clerk whose team just started using an AI tool that reads invoices.
2. On **Today**, point out the one **next step** and the four-step journey, then ask the coach *“Is my current job at risk?”*.
3. Open **My job, task by task** to see which of her tasks AI is likely to automate, and how people actually use AI for them.
4. Go to **Future roles**, switch between scenarios, drag the year slider, try the **Map**, and open **Why this rank?**.
5. Open the top role, press **Make this my target**, then **Build my pathway** and tick a course as finished: readiness, rankings and the journey on Today update.
6. **See my impact** for the SDG links, then **Create my Future Card** and scan the QR code.
7. Finish with **For organisations** and the synthetic sample company.

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

The **frontend is on Vercel** ([laluan-psi.vercel.app](https://laluan-psi.vercel.app)) and the **API on Render** as a Docker container ([laluan-api.onrender.com](https://laluan-api.onrender.com/docs), Singapore, from [`render.yaml`](render.yaml) and `backend/Dockerfile`). Data lives in **Supabase**: Postgres for profiles, progress, trend snapshots and review decisions, and Supabase Auth for Google login, so nothing is lost when Render replaces the container.

**1. Render (API).** New → Blueprint, pick this repository (or update the existing `laluan-api` service). Keep it to **one instance**: the trend and evidence refresh jobs run inside the server process (DECISIONS #38). Add these under the service's **Environment**:

| Variable | Needed? | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Required | Supabase → Connect → **Session pooler** URI, with the database password filled in (letters and digits, or URL-encoded). Not the direct `db.*` address, which is IPv6-only |
| `SUPABASE_URL` | Required | `https://<project-ref>.supabase.co`; login tokens are checked against its public keys |
| `ADMIN_TOKEN` | Required | Generated by the blueprint, or any long random string: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
| `CORS_ORIGINS` | Required | The Vercel address, e.g. `https://laluan-psi.vercel.app` (set by the blueprint, with `CORS_ORIGIN_REGEX` for Vercel's other addresses) |
| `GEMINI_API_KEY` | Recommended | [Google AI Studio](https://aistudio.google.com/apikey). Without it: dictionary and templates, and proof checks are unavailable |
| `GEMINI_MODEL` | Optional | Default `gemini-3.8-flash`. Google no longer offers `gemini-2.5-flash` to new API keys |
| `RUNPOD_API_KEY`, `RUNPOD_LLM_ENDPOINT`, `RUNPOD_WHISPER_ENDPOINT` | Optional | RunPod → Settings → API Keys (one key calls both endpoints) and each endpoint's ID, for CV reading (Qwen) and voice (Whisper) |
| `RUNPOD_LLM_MODEL` | Only if changed | Default `Qwen/Qwen2.5-7B-Instruct`; must match the model the worker loaded |
| `CONTACT_EMAIL` | Optional | Sent to OpenAlex with research-trend requests |
| `OPENALEX_API_KEY` | Optional | Free key from [openalex.org](https://openalex.org). Without one, OpenAlex searches share a small daily budget per IP address (Render's addresses are shared); it is only used when arXiv refuses |
| `SENTRY_DSN` | Optional | Error tracking: a free [Sentry](https://sentry.io) project → Project Settings → Client Keys. Events carry no request body, headers, user or local variables |

Not needed: `SUPABASE_JWT_SECRET` (legacy projects only), `DATABASE_PATH`, `DATA_DIR`, `FRONTEND_DIST`.

**2. Vercel (frontend).** Project root `frontend`, build `npm run build`, output `dist`. Environment variables are built into the app, so **redeploy after changing them**:

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | The Render address without `/api`, e.g. `https://laluan-api.onrender.com` |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API Keys → Legacy API keys → `anon` (public by design; row-level security keeps the tables closed to it) |
| `VITE_SENTRY_DSN` | Optional: the same Sentry DSN, for errors in the browser. Empty = the Sentry code is never loaded |

Security headers (a Content Security Policy that allows only this site, the Render API, Supabase and Sentry; HSTS; no framing) are in [`frontend/vercel.json`](frontend/vercel.json). If the API moves to another address, update its `connect-src` too.

**3. Supabase and Google login.** Enable the **Google** provider (Authentication → Sign In / Providers) with a Google Cloud OAuth client whose only authorised redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback` (no JavaScript origins needed). Under Authentication → URL Configuration, set the Vercel address as the **Site URL** and add `https://laluan-psi.vercel.app/**` and `http://localhost:5173/**` to **Redirect URLs**. Publish the Google consent screen to production, or only listed test users can sign in. Tables are created on the API's first start.

**4. After the first deploy.** On the **Admin** page (Sources → *Admin: review new data*, needs `ADMIN_TOKEN`), run **Refresh trend data** and approve it, then **Refresh skill evidence** and **Find emerging roles** and approve what checks out. Try a proof check, a CV upload and a voice clip to confirm the Gemini and RunPod keys.

**5. Scheduled jobs (GitHub Actions).** [`cron.yml`](.github/workflows/cron.yml) pings `/api/health` every 10 minutes from 07:00 to 23:00 Malaysia time so the free Render service stays awake by day (about 500 of Render's 750 free hours a month). Add the repository secret `API_URL` (Settings → Secrets and variables → Actions), e.g. `https://laluan-api.onrender.com`. GitHub can start scheduled runs a few minutes late.

**Before a live demo:** Render's free plan sleeps after about 15 minutes without visitors and takes up to a minute to wake (the app shows "Waking up the server…"), so open the site a minute before. Wake the RunPod workers the same way (one CV and one voice clip), or set the endpoints' active workers to 1 for the session and back to 0 afterwards.

## Configuration

The backend reads environment variables and `backend/.env` (real environment variables win). See [backend/.env.example](backend/.env.example).

| Variable | Purpose / default |
| --- | --- |
| `GEMINI_API_KEY` | Optional. Empty means offline rules and templates; set it to use Gemini for CV reading, coach answers and pathway summaries. The model in use is shown in the app. |
| `GEMINI_MODEL` | Generation model, default `gemini-3.8-flash`. |
| `GEMINI_EMBEDDING_MODEL` | Embedding model, default `gemini-embedding-001`. |
| `GEMINI_TIMEOUT_SECONDS` | Provider timeout, default `15`. |
| `RUNPOD_API_KEY` | Optional. Turns on the RunPod Serverless endpoints below. |
| `RUNPOD_LLM_ENDPOINT`, `RUNPOD_LLM_MODEL` | A vLLM worker serving an open model (default `Qwen/Qwen2.5-7B-Instruct`) for CV reading, so Gemini only sees confirmed skills. Fallback: Gemini, then the dictionary. |
| `RUNPOD_WHISPER_ENDPOINT`, `RUNPOD_WHISPER_MODEL` | A faster-whisper worker (default model `small`) for voice input. Empty means the browser's own speech recognition, then typing. |
| `RUNPOD_TIMEOUT_SECONDS` | Default `20`: a cold worker falls back instead of keeping the person waiting. |
| `ADMIN_TOKEN` | Needed for **Refresh trend data** and snapshot import. Use a long random value. |
| `CORS_ORIGINS` | Comma-separated frontend addresses, default `http://localhost:5173`. |
| `CORS_ORIGIN_REGEX` | Optional pattern for hosts that serve one site under many addresses, e.g. Vercel's per-deploy URLs. |
| `CONTACT_EMAIL` | Optional contact address sent with OpenAlex requests. |
| `OPENALEX_API_KEY` | Optional OpenAlex key, used when arXiv is unavailable; without it OpenAlex allows only a few dozen searches a day per IP address. |
| `DATABASE_URL` | Postgres connection string (Supabase). Empty means the local SQLite file below. |
| `DATABASE_PATH` | SQLite file, default `backend/laluan.db`. |
| `SUPABASE_URL` | Supabase project URL; login tokens are verified against its public keys. |
| `SUPABASE_JWT_SECRET` | Only for Supabase projects still on the legacy shared JWT secret. |
| `FRONTEND_DIST` | Built frontend to serve at `/`, default `frontend/dist` when it exists. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Optional error tracking; empty means off. Personal data is stripped before sending. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Build-time, for the frontend's Google login. Without them the login button is hidden. |
| `DATA_DIR` | Reference data, default `backend/data`. |

For a separately hosted frontend, set `VITE_API_URL` (see [frontend/.env.example](frontend/.env.example)) to the backend address without `/api`, and add the frontend address to `CORS_ORIGINS`.

## How the ranking works

Each role scores **0.6 × weighted skill fit + 0.4 × scaled outlook**, plus up to **0.05** when it fits what the person said they enjoy (**What I enjoy**) and, for graduates, **0.05** when it is open to new graduates. Roles that are declining under the chosen scenario rank below the rest. Every card shows this breakdown and the snapshot it came from. SDG links explain each role and skill; they no longer change the rank.

The scenario engine adjusts each role's baseline growth for AI-adoption speed, how exposed its tasks are to automation and how much AI complements it. Years before the horizon are interpolated. These are modelling assumptions, not predictions about any one person. See [matching.py](backend/app/services/matching.py) and [scenario.py](backend/app/services/scenario.py), and [CODE_TO_EXPLAIN.md](docs/CODE_TO_EXPLAIN.md) for a walkthrough.

## Trend signals

The refresh collects AI research counts from **arXiv** (falling back to **OpenAlex**), skill mentions from Hacker News **“Who is hiring?”** threads and from live **Malaysian job postings on freehire.me** (a share today; a trend once a second count at least four weeks later exists), and Malaysian employment by occupation group from the **OpenDOSM** public API (`wages_occupation`). Raw counts go to `backend/data/raw/`; each refresh writes a new dated snapshot and keeps the old ones, so rankings can be compared before and after.

### Forecasts: which skills and jobs will rise or decline

Each refresh also collects **history**: about three years of quarterly skill mentions in the hiring threads, twelve quarters of papers per AI capability, and eight years of Malaysian employment per occupation group. [`forecast.py`](backend/app/trends/forecast.py) then applies one method to every series:

1. A straight line through the log of the share (share of job ads mentioning a skill; a capability's papers against the median capability; an occupation group's share of all employees).
2. Noisy trends are **shrunk towards no change** in proportion to how unclear they are, and the projection starts from the last year's average, not one noisy quarter.
3. The trend is **damped** (each year adds 80% of the previous year's change), so nothing grows for ever, and projected to 2030 with an **80% range**.
4. For a skill, AI research momentum is added, scaled by each scenario's adoption speed (slow 0.5×, baseline 1×, accelerated 1.6×): skills that accelerating AI capabilities automate fall faster under faster adoption; skills they boost rise faster.
5. **Rising** above +15% by 2030, **declining** below −15%, otherwise steady; **Likely** only when the whole range agrees; **Emerging** when a rising skill grew faster in the last 18 months than before.

The forecast feeds matching: each skill's trend is its forecast's yearly rate, which moves the role outlooks, and each role's Malaysian employment points are its occupation group's projected change. **Backtest:** every refresh hides the last year of job-ad data and forecasts it. With the data collected on 21 Oct 2026, where the history showed a clear trend (19 skills), the next year moved that way for 14; guessing "everything rises" gets 12. On size, a plain "no change" guess did better (average error about 18% against 25%), so the app tells people to read the direction more than the number. Without history (an API down), the refresh falls back to comparing the last six months with a year earlier.

**A person approves every update.** A refresh only saves the new snapshot for review. On the **Admin** page (linked from Sources), an admin sees which roles would move and by how much, then approves it (their name is stored with the snapshot and shown on the Sources page) or rejects it with a reason (kept in `backend/data/signals/rejected/`). Users see nothing new until it is approved.

Run a refresh from that panel (needs `ADMIN_TOKEN`), or from `backend/`:

```powershell
.\.venv\Scripts\python.exe scripts/refresh_trends.py          # reuse today's counts if present
.\.venv\Scripts\python.exe scripts/refresh_trends.py --force  # collect again
.\.venv\Scripts\python.exe scripts/refresh_trends.py --approve-as "Your name"  # you checked the output: publish it
```

On macOS/Linux use `.venv/bin/python`. Starting the app does not schedule refreshes; use cron or Task Scheduler if needed.

Research activity and Hacker News posts are rough proxies for demand. A refresh adjusts the WEF baseline within capped limits; it does not replace it.

## Skill evidence from job ads

Each role's skill list can be checked against **current Malaysian job ads**. **Refresh skill evidence** (Admin, Future roles screen) runs a Gemini search with Google Search grounding for every role (about 2 minutes) and asks for the exact sentence in each ad that asks for each skill. If fewer than 2 ads come back, it widens to any page (career guides, reports), labelled as weaker evidence. Google's redirect links are resolved to the real address; only the redirect header is read.

**A person approves each role.** The reviewer sees every page and quote, flagged when the site was not among Google's own sources, and can untick a whole page or one quote (wrong page, wrong skill) before approving. Then:

- every skill of the role shows **Confirmed** (2+ pages), **One source** or **Not seen in ads**, with the quotes and links, on the role page and in the skill tree;
- a skill from our catalogue that **2+ job ads** ask for is **added to the role at weight 1**, so fit, rankings and the pathway change; web pages never add skills;
- skill names that are not in our catalogue are listed for the team and change nothing.

Results and decisions are stored in the database (`evidence` table), so a redeploy keeps them.

## Emerging roles (a prediction)

**Find emerging roles** (same admin panel) runs one grounded Gemini search per AI capability we track (about 5 minutes). Each proposes one new job title in Malaysia with EN / BM / 中文 text, the catalogue skills it needs, a **stepping-stone role from our catalogue**, an SDG and quoted sources. Answers without a source, a catalogue skill or a valid stepping stone are refused. Once a trend refresh is approved, only capabilities whose research is accelerating are searched, fastest first; before that, every card says momentum is not measured yet.

A person approves each card. Up to 6 approved cards appear under the ranked roles on the Future roles screen, labelled **"A prediction"** and **never ranked**: there is no published growth figure for jobs this new. Each card shows the person's carry-over skills, what is left to learn and a link to the stepping-stone role. **Search current job ads** on a card runs a live search, labelled "not yet reviewed", cached per title per day, limited to 5 per profile per hour, and never scored. Search grounding is billed by Google per search on paid plans; one full run is 13–26 searches, an emerging-roles run 8.

## A day in this job

Each role page opens with a short **"A day in this job"** in EN / BM / 中文: what you spend the day doing, the setting and who you work with, and how the work helps people. Gemini drafted it once per role from our own data only (the role's O\*NET tasks, work context, main skills, DOSM pay group and SDG reason) with [`build_day_in_job.py`](backend/scripts/build_day_in_job.py); the text is committed in `backend/data/day_in_job.json` and listed in REVIEW_LOG for the team. When an admin approves a role's job-ad evidence, a richer version that may also use the approved ad quotes is drafted in the background and waits in the same admin panel; once approved, it replaces that role's text. It never feeds any score.

## Role catalogue

**Skills are not the whole story.** Each role also shows what it takes to be hired: the education its MASCO 2020 occupation group usually asks for (usual, not a rule) and, where the law or an official body requires one, a licence with its route, length and sources: registered nurse (Lembaga Jururawat Malaysia registration after a 3-year diploma), renewable energy technician (Energy Commission wireman competency) and TVET instructor (JPK Vocational Training Officer certificate). A licensed role is a long-term goal unless it is your own job, is never offered as the shortest route, and its plan starts with the qualification, because courses build skills but do not replace it ([`entry_requirements.json`](backend/data/entry_requirements.json)).

Each role also shows the **qualification and certificates Malaysian employers ask for**, read from real job ads (freehire.me, mostly JobStreet) by [`build_qualifications.py`](backend/scripts/build_qualifications.py) with each ad's own sentence and link: for example a degree in computer science or IT and CompTIA Security+ (21 of 54 ads) for a cybersecurity analyst, or a Chargeman or wireman certificate for a renewable energy technician. A role with too few current ads shows its MASCO group default instead, and says so.

23 roles in 17 fields. The first 13 are clerical, ICT, marketing, design, green and care roles; on 22 Oct 2026 we added one role AI is changing from each of Malaysia's largest employing sectors (OpenDOSM, employment by sector, 2025): **production operator** (manufacturing), **cashier** (retail), **hotel front-desk clerk** (food and accommodation), **plantation and farm worker** (agriculture), **engineering drafting and BIM technician** (construction), **accounts and payroll clerk** (business services), **supply chain and logistics specialist** (transport and storage), **bank teller** (finance), **registered nurse** (health) and **TVET instructor** (education). Five are at risk and five growing, so a cashier or bank teller has somewhere nearby to move.

Every role's growth figure is its WEF Future of Jobs 2025 category (Figure 2.3); a role with no category of its own uses the closest one and says so. A new skill joins the catalogue only with a link-checked free or low-cost course, so every gap has a course. [`add_roles.py`](backend/scripts/add_roles.py) has Gemini draft the rest from O\*NET tasks, WEF and MASCO (`draft`), finds and checks courses for new skills (`courses`) and merges the reviewed draft (`apply`); the existing build scripts then add tasks, BM / 中文, “A day in this job” and AI-assisted skills. New roles rank straight away, with a **New role, data being checked** badge until the team fills `reviewed_by` in `roles.json`.

## Tests and checks

```powershell
cd backend; .\.venv\Scripts\python.exe -m pytest     # 337 tests: API, services, trends, forecasts, review, guardrails, openings, interview, exposure, data integrity, privacy
cd frontend; npm test; npm run lint; npm run build   # Vitest component tests, ESLint, type check + production build
```

GitHub Actions runs all of these on every push and pull request ([ci.yml](.github/workflows/ci.yml)), and the store tests again on Postgres.

AI endpoints (coach, interview practice, CV reading, voice, chat questionnaire, survey reading, proof-check questions, identity statement, live job-ad searches) are rate-limited per IP address and per profile in a 10-minute window (`backend/app/ratelimit.py`); over the limit the app shows "You're going a bit fast". Each request is logged as one JSON line (method, route template, status, milliseconds) with no IP, IDs, query string or body.

Scripts in `backend/scripts/`: `check_links.py` (opens every course link and records the date), `eval_extraction.py` (skill-extraction recall on the five synthetic CVs in `backend/data/eval/`), `cleanup.py` (deletes profiles untouched for 30 days), `build_snapshot.py`, `build_tasks.py` and `build_day_in_job.py` (rebuild reference data; the last needs `GEMINI_API_KEY`), `extract_wef_figure.py` (reads WEF Figure 2.3; needs `pip install pymupdf`).

A full manual checklist of every feature is in [MANUAL_TEST_PLAN.md](docs/MANUAL_TEST_PLAN.md).

Human scoring of the synthetic CVs and an outside review of the pathways are still to be recorded in [EVALUATION.md](docs/EVALUATION.md); the **Review kit** (`/?view=review-kit`) makes both quick.

## Limits of this prototype

- **Forecasts:** WEF figures are global, not Malaysia-specific, and come from an employer survey. AI operations specialist has no WEF category; it uses Process Automation Specialists as the closest match. The earlier illustrative seed is kept for history. Horizon: 2030.
- **Task labels:** tasks come from O\*NET 30.0; the automate / assist / human labels are our judgements, drafted with AI help and still being reviewed (`reviewed_by` in `backend/data/tasks.json`).
- **Courses:** RM prices and HRD Corp status come from each provider's own page and are dated (`price_checked`). Three paid courses (NIOSH, electrical, caregiver) have no published fee, so the app says to ask the provider; only the GRI training is confirmed HRD Corp-claimable.
- **CVs:** read in memory and scrubbed before any model call; only confirmed skills, goals and course progress are saved. The scrubber is rule-based: it catches the usual Malaysian shapes (IC, phone, `Jalan …` / postcode addresses, labelled birth dates, `Sdn Bhd` / university names) but not every possible detail, which is why the person sees and can edit the text first.
- **Voice:** the browser fallback (Web Speech API) is run by the browser's maker; Chrome sends the audio to Google. The app says so whenever it uses it.
- **Forecasts:** job-ad mentions come from Hacker News hiring threads, which lean towards tech jobs in the US and Europe; nine skills (care, safety, soft skills) have too few mentions and show "no data" instead of a guess. The 80% range covers uncertainty in the trend, not sudden shocks.
- **Accounts:** optional. Without logging in, a profile is reached by its ID, which the browser remembers, and is deleted after 30 days; Google login keeps it until you delete it. Future Cards use a separate read-only link. Treat both links as private.
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
render.yaml             Render blueprint for the API (the frontend is on Vercel)
```

Stack: **React 18 + TypeScript + Vite**, **FastAPI + Pydantic**, **SQLite** locally / **Supabase Postgres + Auth** in production, optional **Google Gemini** and **RunPod**; frontend on **Vercel**, API on **Render**.

## Project documents

1. [PRD](docs/01-PRD.md): goals, requirements and success measures
2. [TRD](docs/02-TRD.md): architecture, stack and security
3. [App Flow](docs/03-APP_FLOW.md): screens and actions
4. [UI/UX Brief](docs/04-UI_UX_BRIEF.md): look and feel
5. [Backend Schema](docs/05-BACKEND_SCHEMA.md): data and rules
6. [Implementation Plan](docs/06-IMPLEMENTATION_PLAN.md): milestones and what's done

SDC submission: [Preliminary proposal](docs/submission/SDC2026_MadeInUTM_Preliminary.md) · [Technical tools declaration](docs/submission/SDC2026_MadeInUTM_TechDeclaration.md) · [Data sources (PDF)](docs/submission/Laluan_Data_Sources.pdf)

How we built and checked it: [Proposal](docs/PROPOSAL.md) · [AI declaration](docs/AI_DECLARATION.md) · [Decisions](docs/DECISIONS.md) · [Review log](docs/REVIEW_LOG.md) · [Code to explain](docs/CODE_TO_EXPLAIN.md) · [Evaluation](docs/EVALUATION.md)

## Team

**Made in UTM**

| Member | Role |
| --- | --- |
| ______ | ______ |
| ______ | ______ |
| ______ | ______ |

## Credits and licence

AI-exposure estimates from the [Anthropic Economic Index](https://huggingface.co/datasets/Anthropic/EconomicIndex) (CC BY), OpenAI's [“GPTs are GPTs”](https://github.com/openai/GPTs-are-GPTs) (MIT) and [ILO Working Paper 140](https://www.ilo.org/publications/generative-ai-and-jobs-refined-global-index-occupational-exposure) (CC BY 4.0); critical occupations from TalentCorp's [MyCOL 2024/2025](https://www.talentcorp.com.my/mycol/). Job growth figures from the [WEF Future of Jobs Report 2025](https://www.weforum.org/publications/the-future-of-jobs-report-2025/). Occupation tasks from [O\*NET 30.0](https://www.onetcenter.org/) (U.S. Department of Labor), used under CC BY 4.0. SDG names and colours from the United Nations. Landing page photos from [Unsplash](https://unsplash.com) by Gema Saputera, Mimi Thian and Vitaly Gariev; the people shown are not the demo personas.

Code under the [Apache License 2.0](LICENSE).
