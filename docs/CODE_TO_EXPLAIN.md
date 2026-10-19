# Code to explain

Each teammate owns some modules and should be able to explain them to a judge without notes.
Owner column: fill in.

| Module | Owner | What it does in one paragraph |
|---|---|---|
| `backend/app/services/scenario.py` | ______ | Turns a role's published growth figure into an outlook under each scenario. Baseline is exactly the published number. Slow and accelerated adoption change it by `(adoption − 1) × 40 × (ai_complementarity − automation_exposure)`: a role that works *with* AI gains when adoption speeds up, a role exposed to automation loses. Labels: ≥ 50 emerging, ≥ 10 growing, > −10 stable, otherwise declining. |
| `backend/app/services/matching.py` | ______ | Fit = covered skill weight ÷ total weight (core 3, important 2, useful 1). Score = 0.6 × fit + 0.4 × outlook scaled to 0–1, plus 0.05 if the role serves an SDG the person chose. Each role returns this breakdown ("Why this rank?"), a low–high estimate across scenarios and a citation. Declining roles go to the bottom. "Robust pick" = top 5 in every scenario and never declining. |
| `backend/app/services/pathway.py` | ______ | For each missing skill, most important first, picks the catalogue course that covers the most remaining gaps, then easier level, then fewer hours. Steps only ever come from `courses.json`. An optional AI summary is checked by `grounding.py`. |
| `backend/app/services/grounding.py` | ______ | A sentence is "supported" if every number in it appears in the sources and at least half its content words do. It can miss a paraphrase but cannot be fooled into passing an invented course or figure. |
| `backend/app/services/skills.py` | ______ | Finds skills three ways, cheapest first: whole-phrase dictionary match on names and aliases; Gemini reading the scrubbed CV; embeddings to map unknown phrases to the nearest skill above 0.75 similarity. |
| `backend/app/services/deid.py` | ______ | Regexes replace Malaysian IC numbers, mobile and landline numbers, emails and known names before any text goes to an LLM. |
| `backend/app/trends/research.py` | ______ | Counts research papers per AI capability for the last 6 months (ending 60 days ago) and the same months a year earlier. Tries arXiv, which rate-limits; on failure the whole run uses OpenAlex instead, so one run never mixes sources. |
| `backend/app/trends/jobs.py` | ______ | Finds the latest 3 "Who is hiring?" threads and those from a year earlier, then counts postings mentioning each skill term as a whole word or exact phrase, as a share of all postings. |
| `backend/app/trends/builder.py` | ______ | Turns counts into a new snapshot. Momentum is growth relative to the median capability (log2, ±1), and only acceleration counts. Skill trend = change in posting share (≥ 20 mentions) + half the net momentum of capabilities that boost or automate it. Role outlook = baseline + demand points + AI points, each capped at ±15. Never edits the baseline. |
| `backend/app/trends/refresh.py` | ______ | Runs a refresh in the background with progress messages; reuses today's raw counts unless forced; saves the snapshot and reloads the data. |
| `backend/app/services/documents.py` | ______ | Reads an uploaded CV in memory: PDF with pypdf, DOCX by unzipping its XML, or plain text. Refuses files over 5 MB, other types, and scanned PDFs with no text. Nothing is saved. |
| `backend/app/services/workforce.py` | ______ | HR view. Refuses CSVs with name, email, IC, phone or staff-ID columns. Groups identical people, runs the normal matching for each group, and returns only totals: headcount and outlook by role, the cheapest move for people in declining roles (learning hours from the catalogue), and SDG totals. Dictionary skill matching only, so no LLM cost per row. |
| `backend/app/services/tasks.py` + `scripts/build_tasks.py` | ______ | Your job, task by task. Task text is copied word for word from O\*NET 30.0; `raw/onet_task_labels.json` picks up to 6 tasks per role and labels each automate / assist / human with a reason. The shares are over the tasks the person ticks (all tasks if none). A role with no O\*NET occupation (AI operations specialist) shows no tasks instead of invented ones. |
| `backend/scripts/check_links.py` | ______ | Opens every course link; a link "works" only if it returns 200 **and** the page title shares a word with the course title or provider, so a redirect to a home page is caught. Writes today's date to `checked`. A title mismatch (often a bot wall) is left for a person to open by hand. |
| `backend/app/services/cards.py` | ______ | Future Card. The card stores only a random ID, the profile and the role; the summary is rebuilt from the live profile each time it is opened, so it updates with new data and disappears when the profile is deleted (foreign key with cascade). It shows the chosen display name, role, readiness, outlook, plan size and SDGs, never the profile ID or full skill list. The QR code is drawn in the browser. |
| `backend/app/services/coach.py` | ______ | The coach builds numbered sources from the person's own matches and pathway (top roles, why the focus role ranks, pathway hours and costs, robust picks, data source). With a key, Gemini answers from those sources only (question scrubbed first); without one, or if the call fails, a keyword rule picks the matching source and quotes it. Either way `grounding.py` marks any sentence the sources do not support. The coach can return one proposal (change scenario, or add an SDG goal) that only takes effect when the person presses **Apply**. |
| Year slider (`scenario.year_fraction`) | ______ | Scales each outlook linearly from the source's base year (0) to its horizon year (1). Years past the horizon are clamped, because the sources do not cover them. |
| Progress (`matching.effective_skills`) | ______ | Skills the person reported plus skills from courses they ticked. Matching uses these, so rankings and readiness move as they learn; the pathway keeps the original gap so finished steps stay visible. |
| `backend/app/reference.py` | ______ | Loads the JSON reference data once; the newest snapshot by `imported` date is the one used. |
| `backend/app/store.py` | ______ | SQLite profiles reachable only by UUID; numbered migrations; 30-day purge. |
| `frontend/src/App.tsx` | ______ | Screens and navigation; calls the API through `api.ts`. |

## Questions judges may ask (practise these)

1. **Where do your forecasts come from, and how old are they?** → A published baseline (WEF/O\*NET) adjusted by research momentum (arXiv/OpenAlex) and job-posting demand (HN hiring threads). Every snapshot lists its inputs and dates; raw counts are in `data/raw/`.
1b. **What if a source is down?** → arXiv falls back to OpenAlex; if a refresh fails, the last good snapshot stays in use and its date is shown.
2. **Why is this role ranked first?** → Walk through fit, outlook and the 60/40 rule using the Why-this-rank panel.
3. **What if the AI makes up a course?** → It can't add steps: steps come from the catalogue; AI text is grounding-checked.
4. **How do you protect personal data?** → `scrub()` before any LLM call; raw CV never stored; HR CSV never stored.
5. **Is the system fair?** → It never asks for age, gender or background; the API rejects those fields; a test shows different names give identical rankings.
6. **Why 40 in the formula / why 60/40?** → Chosen to make scenario differences visible but smaller than the published figure; tuned after human evaluation (DECISIONS #11).
7. **What did you change after reviewing the AI's work?** → REVIEW_LOG.md, starting with the ranking fix.
