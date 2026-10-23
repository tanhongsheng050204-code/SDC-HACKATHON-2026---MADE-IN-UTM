# How Laluan works

The ranking, the trend pipeline and forecasts, job-ad evidence, emerging roles, the role catalogue and the limits of this prototype. Back to the [README](../README.md).

## How the ranking works

Each role scores **0.6 × weighted skill fit + 0.4 × scaled outlook**, plus up to **0.05** when it fits what the person said they enjoy (**What I enjoy**) and, for graduates, **0.05** when it is open to new graduates. Roles that are declining under the chosen scenario rank below the rest. Every card shows this breakdown and the snapshot it came from. SDG links explain each role and skill; they no longer change the rank.

The scenario engine adjusts each role's baseline growth for AI-adoption speed, how exposed its tasks are to automation and how much AI complements it. Years before the horizon are interpolated. These are modelling assumptions, not predictions about any one person. See [matching.py](../backend/app/services/matching.py) and [scenario.py](../backend/app/services/scenario.py), and [CODE_TO_EXPLAIN.md](CODE_TO_EXPLAIN.md) for a walkthrough.

## Trend signals

The refresh collects AI research counts from **arXiv** (falling back to **OpenAlex**), skill mentions from Hacker News **“Who is hiring?”** threads and from live **Malaysian job postings on freehire.me** (a share today; a trend once a second count at least four weeks later exists), and Malaysian employment by occupation group from the **OpenDOSM** public API (`wages_occupation`). Raw counts go to `backend/data/raw/`; each refresh writes a new dated snapshot and keeps the old ones, so rankings can be compared before and after.

### Forecasts: which skills and jobs will rise or decline

Each refresh also collects **history**: about three years of quarterly skill mentions in the hiring threads, twelve quarters of papers per AI capability, and eight years of Malaysian employment per occupation group. [`forecast.py`](../backend/app/trends/forecast.py) then applies one method to every series:

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

Each role's skill list is checked against **current Malaysian job ads, read directly**. **Refresh skill evidence** (Admin, Future roles screen) reads up to 40 of each role's newest ads from freehire.me (mostly JobStreet; the same ads as the role page's openings), about a minute for all roles. Every sentence of every ad is matched against our skill names and aliases, so each quote is the ad's own sentence with the ad's own link, and **no language model is involved: a link or a quote cannot be invented**. A few one-word aliases that help read a CV are too common in ads to count as evidence ("compliance", "audit", "writing", "coordination", "ml", "flexibility"), and an ad posted again under a new link counts once.

(Until 22 Oct 2026 a Gemini search found the ads. Of 33 links checked on the live site, 5 opened: the model read real ads but rebuilt their addresses from memory. See REVIEW_LOG.)

**A person approves each role.** The reviewer sees every ad and quote and can untick a whole ad or one quote (a sentence that does not really ask for the skill) before approving. Then:

- every skill of the role shows **Confirmed** (2+ ads), **One source** or **Not seen in ads**, with the quotes and links, on the role page and in the skill tree;
- a catalogue skill that **3+ ads and a fifth of the ads read** ask for is **added to the role at weight 1**, so fit, rankings and the pathway change;
- skill tags the site put on the ads that are not in our catalogue are listed for the team and change nothing.

Results and decisions are stored in the database (`evidence` table), so a redeploy keeps them.

## Emerging roles (a prediction)

**Find emerging roles** (same admin panel) runs one Google-grounded Gemini search per AI capability we track (about 5 minutes). Each proposes one new job title in Malaysia with EN / BM / 中文 text, the catalogue skills it needs, a **stepping-stone role from our catalogue**, an SDG and quoted sources. **Source links come from Google's own search results, never from an address the model wrote**: a Google redirect link is followed to the page it leads to, a site Google did not read is dropped, and each source records whether its quote was found on the page (many job boards refuse automated visits, so that is sometimes unknown). Answers without such a source, a catalogue skill or a valid stepping stone are refused. Once a trend refresh is approved, only capabilities whose research is accelerating are searched, fastest first; before that, every card says momentum is not measured yet.

A person approves each card. Up to 6 approved cards appear under the ranked roles on the Future roles screen, labelled **"A prediction"** and **never ranked**: there is no published growth figure for jobs this new. Each card shows the person's carry-over skills, what is left to learn and a link to the stepping-stone role. **Search current job ads** on a card reads real Malaysian ads whose title has all the card title's main words (freehire.me), labelled "not yet reviewed", cached per title per day, limited to 5 per profile per hour, and never scored. Search grounding is billed by Google per search on paid plans; an emerging-roles run is 8 searches.

## A day in this job

Each role page opens with a short **"A day in this job"** in EN / BM / 中文: what you spend the day doing, the setting and who you work with, and how the work helps people. Gemini drafted it once per role from our own data only (the role's O\*NET tasks, work context, main skills, DOSM pay group and SDG reason) with [`build_day_in_job.py`](../backend/scripts/build_day_in_job.py); the text is committed in `backend/data/day_in_job.json` and listed in REVIEW_LOG for the team. When an admin approves a role's job-ad evidence, a richer version that may also use the approved ad quotes is drafted in the background and waits in the same admin panel; once approved, it replaces that role's text. It never feeds any score.

## Role catalogue

**Skills are not the whole story.** Each role also shows what it takes to be hired: the education its MASCO 2020 occupation group usually asks for (usual, not a rule) and, where the law or an official body requires one, a licence with its route, length and sources: registered nurse (Lembaga Jururawat Malaysia registration after a 3-year diploma), renewable energy technician (Energy Commission wireman competency) and TVET instructor (JPK Vocational Training Officer certificate). A licensed role is a long-term goal unless it is your own job, is never offered as the shortest route, and its plan starts with the qualification, because courses build skills but do not replace it ([`entry_requirements.json`](../backend/data/entry_requirements.json)).

Each role also shows the **qualification and certificates Malaysian employers ask for**, read from real job ads (freehire.me, mostly JobStreet) by [`build_qualifications.py`](../backend/scripts/build_qualifications.py) with each ad's own sentence and link: for example a degree in computer science or IT and CompTIA Security+ (21 of 54 ads) for a cybersecurity analyst, or a Chargeman or wireman certificate for a renewable energy technician. A role with too few current ads shows its MASCO group default instead, and says so.

23 roles in 17 fields. The first 13 are clerical, ICT, marketing, design, green and care roles; on 22 Oct 2026 we added one role AI is changing from each of Malaysia's largest employing sectors (OpenDOSM, employment by sector, 2025): **production operator** (manufacturing), **cashier** (retail), **hotel front-desk clerk** (food and accommodation), **plantation and farm worker** (agriculture), **engineering drafting and BIM technician** (construction), **accounts and payroll clerk** (business services), **supply chain and logistics specialist** (transport and storage), **bank teller** (finance), **registered nurse** (health) and **TVET instructor** (education). Five are at risk and five growing, so a cashier or bank teller has somewhere nearby to move.

Every role's growth figure is its WEF Future of Jobs 2025 category (Figure 2.3); a role with no category of its own uses the closest one and says so. A new skill joins the catalogue only with a link-checked free or low-cost course, so every gap has a course. [`add_roles.py`](../backend/scripts/add_roles.py) has Gemini draft the rest from O\*NET tasks, WEF and MASCO (`draft`), finds and checks courses for new skills (`courses`) and merges the reviewed draft (`apply`); the existing build scripts then add tasks, BM / 中文, “A day in this job” and AI-assisted skills. New roles rank straight away, with a **New role, data being checked** badge until the team fills `reviewed_by` in `roles.json`.

## Limits of this prototype

- **Forecasts:** WEF figures are global, not Malaysia-specific, and come from an employer survey. AI operations specialist has no WEF category; it uses Process Automation Specialists as the closest match. The earlier illustrative seed is kept for history. Horizon: 2030.
- **Task labels:** tasks come from O\*NET 30.0; the automate / assist / human labels are our judgements, drafted with AI help and still being reviewed (`reviewed_by` in `backend/data/tasks.json`).
- **Courses:** RM prices and HRD Corp status come from each provider's own page and are dated (`price_checked`). Three paid courses (NIOSH, electrical, caregiver) have no published fee, so the app says to ask the provider; only the GRI training is confirmed HRD Corp-claimable.
- **CVs:** read in memory and scrubbed before any model call; only confirmed skills, goals and course progress are saved. The scrubber is rule-based: it catches the usual Malaysian shapes (IC, phone, `Jalan …` / postcode addresses, labelled birth dates, `Sdn Bhd` / university names) but not every possible detail, which is why the person sees and can edit the text first. Scans and photos are read by our own OCR (RapidOCR with the PaddleOCR PP-OCRv4 English model, on ONNX Runtime), up to 3 pages: first by our OCR worker on RunPod ([`runpod/ocr`](../runpod/ocr), when `RUNPOD_OCR_ENDPOINT` is set), else on the API server itself (`scripts/fetch_ocr_models.py` fetches the model there, and the Docker build does too). The page images go only to our own worker, are never stored, and the text comes back to the API to be put in reading order and scrubbed the same way; the person is told the text came from a scan and to check it, because OCR can misread words.
- **Voice:** the browser fallback (Web Speech API) is run by the browser's maker; Chrome sends the audio to Google. The app says so whenever it uses it.
- **Forecasts:** job-ad mentions come from Hacker News hiring threads, which lean towards tech jobs in the US and Europe; nine skills (care, safety, soft skills) have too few mentions and show "no data" instead of a guess. The 80% range covers uncertainty in the trend, not sudden shocks.
- **Accounts:** optional. Without logging in, a profile is reached by its ID, which the browser remembers, and is deleted after 30 days; Google login keeps it until you delete it. Future Cards use a separate read-only link. Treat both links as private.
- **Workforce view:** files with name, email, IC or staff-ID columns are refused, but the data should still be anonymous before upload.
