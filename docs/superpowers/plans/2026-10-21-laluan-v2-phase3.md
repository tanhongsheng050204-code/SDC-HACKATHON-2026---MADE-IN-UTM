# Laluan v2 Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cite where each role's skills come from (Malaysian job ads found through Gemini's Google Search grounding, reviewed by a person), show 3–6 emerging roles as a labelled prediction, add "A day in this job" to every role, and show the SDG reason wherever a role or skill appears, all in EN / BM / 中文.

**Build order (decided 21 Oct, grill session):** A cited skill evidence → B emerging roles → C a day in this job → D SDG reasons shown. Each feature is merged to `main` only when its tests pass; anything not solid by the evening of 24 Oct stays on its branch and the submission lists it as in progress.

**Architecture:** A new `app/evidence/` package mirrors `app/trends/`: a collector (grounded Gemini search), a background refresh with progress, and a review module. Pending and decided results live in a new `evidence` table (schema v10), so a redeploy keeps them. `reference.get_reference()` applies each role's latest approved evidence to `roles`, so matching, the skill tree, pathways and the role page pick it up with no other change.

**Spec:** `docs/superpowers/specs/2026-10-20-laluan-v2-features-design.md`, sections 5, 8, 9, 10 and "Phase 3 decisions".

## Global Constraints

- Tests run offline: the grounded search is a function the tests replace; no network, no key.
- Grounded calls get their own client timeout (120 s): a search takes about 25 s, longer than `GEMINI_TIMEOUT_SECONDS`.
- Nothing found by search reaches users until a person approves it, except the live "Search the web" on emerging-role cards, which is labelled "not yet reviewed", never feeds a score, is rate-limited per profile (5 per hour) and cached per role per day.
- Evidence may only add skills that already exist in `skills.json`, only when **2+ distinct job-ad URLs** mention them, at **weight 1**. Pages from the widened search ("web") never add skills. Names not in the catalogue are listed for the team and change nothing.
- Status per skill: `confirmed` (2+ distinct sources of any kind), `single` (1), `none` (0).
- Every citation keeps: URL, page title, employer if known, kind (`job_ad` or `web`), the exact quote, and whether its domain appeared in Gemini's grounding sources (`grounded`).
- No personal data is involved: queries contain only role titles and catalogue skill names.

## Review Focus

1. **Gemini invents a quote or a URL** → the reviewer sees quote + link + a "not in Google's sources" flag for ungrounded domains, and can untick it; unticked citations are dropped before statuses are recomputed. *(A: `test_unticked_sources_are_dropped_before_statuses_are_recomputed`.)*
2. **A skill seen only on career-guide pages** → shown as evidence, never added to the role. *(A: `test_web_pages_never_add_skills`.)*
3. **Approving evidence changes rankings** → the added skill shows up in matching and the skill tree; rejecting changes nothing. *(A: `test_approved_evidence_adds_skill_to_matching`.)*
4. **Search fails or times out for some roles** → those roles report "search failed" in the run; the others still go to review. *(A: `test_failed_role_does_not_stop_the_run`.)*

---

## A. Cited skill evidence

- [ ] **A1 Storage.** `store.py`: migration 10 creates `evidence (id, role_id, state, created, body, decided_by, decided_at, reason)`; add to `APP_TABLES` (RLS on Postgres). Functions `save_evidence`, `get_evidence`, `list_evidence(state)`, `decide_evidence`. Test in `test_store.py`.
- [ ] **A2 Collector** `app/evidence/search.py`: `search_role(role, catalogue, grounded=...)` runs the job-ad prompt (catalogue ids listed in the prompt, Gemini tags each quote with an id or `other`), widens to "any page" when fewer than 2 job ads come back, classifies each URL (job board list → `job_ad`), marks `grounded` from the grounding metadata, and returns sources. `aggregate(role, sources, catalogue)` → `{skills: {id: status + citations}, added: [...], not_in_catalogue: [...]}`.
- [ ] **A3 Refresh** `app/evidence/refresh.py`: background run over all catalogue roles (3 in parallel), progress steps like the trend refresh, one pending record per role; a failed role is reported and skipped.
- [ ] **A4 Review** `app/evidence/review.py`: list pending, detail, approve with `drop_sources` and `drop_added`, reject with reason; approval recomputes the aggregate, stamps reviewer and date, reloads reference data.
- [ ] **A5 Apply** `reference.py`: latest approved evidence per role adds `{"skill_id", "weight": 1, "source": "evidence"}` entries and an `evidence` summary to each role.
- [ ] **A6 API**: `POST/GET /api/evidence/refresh`, `GET /api/evidence/pending`, `GET /api/evidence/pending/{id}`, `POST .../approve`, `POST .../reject` (admin), and the public role detail already returns `evidence`.
- [ ] **A7 Admin UI**: an "Evidence" panel beside "Refresh trend data": run, progress, per-role review with checkboxes for citations and added skills, approve / reject.
- [ ] **A8 User UI**: role page skill list shows confirmed / single source / no evidence with an expandable list of quotes and links; skill tree node panel shows "Seen in N Malaysian job ads" with links; added skills are marked "added from job ads".
- [ ] **A9 Docs**: README (how evidence works), DECISIONS (#35), Sources page line, REVIEW_LOG note that approvals are the review record.

## B. Emerging roles

- [ ] **B1** Collector: for each capability with positive momentum in the live snapshot, a grounded search for new job titles in Malaysia it creates; Gemini returns title, summary, catalogue skill ids, stepping-stone role id (validated), citations and an SDG reason in EN / BM / 中文.
- [ ] **B2** Stored in the `evidence` table as kind `emerging`, reviewed in the same panel; at most 6 approved, one per capability.
- [ ] **B3** `GET /api/emerging?profile_id=` → approved cards with the person's carry-over skills; live `POST /api/emerging/{id}/search` (rate-limited, cached, labelled unreviewed).
- [ ] **B4** Future roles screen panel "Emerging roles (a prediction)", 3–6 cards with trend, sources, carry-over skills and a link to the stepping-stone role's pathway. Not in the ranked list.

## C. A day in this job

- [ ] **C1** Script `scripts/build_day_in_job.py` drafts, for every role, a short text in EN / BM / 中文 from O*NET tasks, work context, skills, DOSM pay group and the SDG reason only; output committed to `data/day_in_job.json` and listed in REVIEW_LOG.
- [ ] **C2** Approving a role's evidence drafts a richer version (adds facts from approved ads) into the review queue; the approved version is stored in the database and replaces the file version for that role.
- [ ] **C3** Role page section "A day in this job", in the chosen language.

## D. SDG reasons shown

- [ ] **D1** Script drafts BM / 中文 for every reason in `sdg_map.json` (`reason_ms`, `reason_zh`), committed and listed in REVIEW_LOG.
- [ ] **D2** Reasons shown under the SDG tiles on the role page, in the proof-check pass result for the proven skill, and on emerging-role cards.
