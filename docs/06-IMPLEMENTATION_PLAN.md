# 6. Implementation Plan

> Status: AI-assisted draft. Reviewed by ______ on ______.
> Assumes 4–5 days and 2–3 people. Owners: **A** backend/data pipeline · **B** frontend · **C** data review, proposal & pitch.
> Every change lands through a pull request reviewed by another teammate; findings go in REVIEW_LOG.md.

The **preliminary round** is judged on the proposal and on "a rough, working version of your single
most important feature, shown live and backed by your GitHub repository". For this domain the rubric
names it: **the trend signal layer feeding role matching**, with output that visibly changes when
the trend data changes. That comes first.

**Before moving on from a milestone:** run the app, check the PRD acceptance criteria, log open issues.

## M1: foundation ✅

FastAPI backend, React frontend, offline mode, six must-haves working on illustrative seed data,
explainable score, SDG tags on every role and skill, SDG preference re-ranking, estimate ranges,
fairness tests, model name shown. 28 backend tests.

## M2: preliminary round (Day 1–2)

| # | Task | Owner | Done when |
|---|---|---|---|
| 2.1 | **Baseline data**: WEF Future of Jobs 2025 growth figures and O\*NET skills/tasks for each role → CSV → `scripts/build_snapshot.py` | C | Every figure has a page or table reference; `illustrative: false`; reviewed |
| 2.2 | ✅ **Research collector** (`app/trends/research.py`): arXiv, falling back to OpenAlex | A | Re-runnable; raw counts saved in `data/raw/research/<date>.json` |
| 2.3 | ✅ **Job-posting collector** (`app/trends/jobs.py`): HN hiring threads, this year vs last | A | Re-runnable; raw counts saved in `data/raw/jobs/<date>.json`. Team to check the source's terms of use |
| 2.4 | ✅ **Signal builder** (`app/trends/builder.py`): capability momentum → automation exposure of each role's tasks; skill-mention trend → skill demand; both adjust the WEF baseline within a capped range → new dated snapshot with skill-level and role-level signals | A | Formula documented in CODE_TO_EXPLAIN.md; tests; a refresh visibly changes rankings |
| 2.5 | ✅ **Future Skills Radar** screen: skills and roles rising/declining, each with source and date | B | Matches brief section 3, step 2 |
| 2.6 | ✅ **Refresh in the demo**: admin button "Refresh trend data" → new snapshot → rankings move, with "what changed" | A + B | Works live, falls back to the last good snapshot |
| 2.7 | ✅ draft in `docs/PROPOSAL.md` · **Proposal** (problem → approach → expected outcome), following the submission format | C | Someone hearing it cold can explain it back |
| 2.8 | ✅ Repo public, README explains how to run, CI workflow added | A | Judges can open it |

**Checkpoint (preliminary):** live demo of 2.6, repo public, proposal submitted.

**To rehearse the demo:** delete `backend/data/signals/*trend*.json` so the app starts on the baseline;
the Refresh button then reuses today's raw counts (fast) or collects new ones (about 1 minute).

## M3: complete the must-haves (Day 2–3)

| # | Task | Owner | Done when |
|---|---|---|---|
| 3.1 | ✅ CV **file upload** (PDF/DOCX) + guided questionnaire tab | A + B | Text extracted in memory, scrubbed, never stored |
| 3.2 | ◐ free / free-to-audit / paid labels shown; ✅ 25 of 29 links opened and dated by `scripts/check_links.py` (4 generic Malaysian providers have no single course page); ⬜ RM prices, HRD Corp status, `reviewed_by` · Course catalogue: RM cost, free / HRD Corp-claimable flags, every link opened | C | `checked` and `reviewed_by` filled |
| 3.3 | ✅ Year slider (today → horizon year, never beyond), scenarios as presets | A + B | Re-ranks < 300 ms; keyboard works |
| 3.4 | ✅ New visual design (white landing, sidebar app shell, stat cards, pill badges) | B | All screens restyled |
| 3.5 | ✅ Source shown on every recommendation (roles, skills with their O\*NET occupation, tasks, courses with link-check date, radar skills) | B | Spot check: nothing without a source |

## M4: good-to-haves, in this order (Day 3–4)

1. ✅ HR workforce view (aggregate heatmap + cheapest moves; rejects personal columns)
2. ✅ Automatic re-planning notice after a refresh ("Your plan changed because …")
3. ✅ Your job, task by task (O\*NET 30.0 tasks; ⬜ labels reviewed by the team: fill `reviewed_by` in `tasks.json`)
4. ✅ Progress tracking + skill badges
5. BM + 中文 strings and lite mode
6. AI coach (cited answers, proposals the user applies)
7. Future Card + QR

## M5: quality and evidence (Day 4)

| Task | Done when |
|---|---|
| Error, empty and offline states | Each one seen once in the browser |
| Accessibility | Keyboard-only run; contrast checked |
| Privacy and fairness | Tests: CV never stored; scrub before every LLM call; demographic fields rejected; HR CSV with personal columns rejected |
| Human evaluation | ◐ 5 synthetic CVs and `scripts/eval_extraction.py` ready in `backend/data/eval/`; ⬜ 5 **synthetic** CVs marked by a person; a lecturer or counsellor reviews both personas' pathways → EVALUATION.md |
| Code walkthrough | Every teammate explains their modules from CODE_TO_EXPLAIN.md without notes |

## M6: release (Day 5)

Deploy (Vercel + Render/Railway) · demo rehearsed twice on the live URL · previous deploy kept for
rollback · `/api/health` checked before judging · README, AI declaration, proposal, demo video.

## Demo script (preliminary, ~3 minutes)

1. Aisyah's synthetic CV → skills found, personal details removed.
2. Future Skills Radar: data entry declining, AI tool use rising, with source and date.
3. Her ranked roles with **Why this rank?** and estimate ranges; switch to Accelerated.
4. She picks SDG 8 and 13 → roles re-rank, and the app says why.
5. **Refresh trend data** → new dated snapshot from arXiv and job postings → rankings visibly change.
6. Pathway for her top role: ordered, hours, free / HRD Corp courses, SDG tags.
