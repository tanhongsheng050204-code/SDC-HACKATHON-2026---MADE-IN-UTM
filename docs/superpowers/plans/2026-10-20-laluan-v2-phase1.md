# Laluan v2 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google login with Supabase-backed storage, Replit single-deployment hosting, a skill tree with Gemini proof checks, and a personalised preference survey, and remove the user's SDG choice from ranking.

**Architecture:** The FastAPI backend keeps its current shape (`app/api.py` routes, `app/services/*` logic, `app/store.py` storage). `store.py` gains a Postgres path selected by `DATABASE_URL` (SQLite stays for tests and local runs). Supabase Auth issues tokens in the browser; the backend only verifies them. FastAPI also serves the built React app, so Replit runs one process.

**Tech Stack:** Python 3.12, FastAPI, psycopg 3, PyJWT, google-genai; React 18 + TypeScript + Vite, `@supabase/supabase-js`; Supabase (Auth with Google provider, Postgres); Replit Deployments.

**Spec:** `docs/superpowers/specs/2026-10-20-laluan-v2-features-design.md` (Phase 1 rows only). Read it before any task.

## Global Constraints

- Tests run offline: no Gemini key, no Supabase, no network. `python -m pytest` in `backend/` and `npm run build` in `frontend/` are the CI gates (`.github/workflows/ci.yml`).
- Every LLM call keeps an offline fallback or fails soft (feature says "unavailable"; nothing else breaks). Pattern: `app/llm.py`.
- No CV text, survey free text, or display name is ever logged or sent to an LLM except CV text once, scrubbed, for extraction.
- `user_id` = Supabase user id (JWT `sub`). The email is never stored in app tables.
- One profile per user. Demo profiles (`?demo=clerk|student|hr`) never need login and are never claimable.
- The 30-day purge only deletes profiles with `user_id IS NULL`.
- Proof check: 3 multiple-choice questions, pass = at least 2 correct. Levels: 1 Basic, 2 Working, 3 Advanced. One attempt per (profile, skill, level) per UTC day; demo profiles unlimited. Answer key never leaves the server before grading.
- A missing skill counts toward fit once it reaches level 1 (Basic). Finished courses keep counting.
- Preference factor: `PREFERENCE_BOOST = 0.05`, replaces `SDG_BOOST`. "You might also like": up to 3 roles.
- Survey: 8–10 cards; answers `like` | `dislike` | `other`. An "other" answer affects preferences only if the user confirmed the reading.
- Pin new dependency versions: `@supabase/supabase-js` `2.45.4`; `psycopg[binary]>=3.2,<4`; `PyJWT[crypto]>=2.9,<3`.
- Follow existing style: module docstrings explaining the why, small functions, no new frameworks.

## Review Focus

1. **Expired or forged login token** → 401 for owned profiles only; anonymous and demo profiles keep working with no header; the frontend signs the user out and keeps the browser profile, never wipes it. *(Task 3 test `test_expired_token_is_refused_but_anonymous_still_works`.)*
2. **Gemini returns malformed questions or times out** → 503 "Proof checks are unavailable right now", and the failed generation does **not** use up the day's attempt. *(Task 8 test `test_unavailable_check_does_not_count_as_an_attempt`.)*
3. **Answers submitted twice, or for another profile's attempt** → 409 / 404, and the level is granted at most once. *(Task 8 test `test_attempt_is_graded_once_and_only_for_its_owner`.)*
4. **Survey where every answer is an unconfirmed "other"** → empty preferences, zero preference points, empty "you might also like", no error. *(Task 11 test `test_survey_with_no_usable_answers_changes_nothing`.)*
5. **Logging in while the browser holds a demo profile** → claim refused (404); the account's own profile (or none) loads. *(Task 3 test `test_demo_profiles_cannot_be_claimed`.)*

---

### Task 1: Store works on Postgres and has the new tables

**Files:**
- Modify: `backend/app/store.py`, `backend/app/config.py`, `backend/requirements.txt`, `backend/tests/conftest.py`, `backend/.env.example`
- Test: `backend/tests/test_store.py` (create)

**Interfaces:**
- Produces: `Settings.database_url: str` (env `DATABASE_URL`, default `""` → SQLite at `database_path`).
- Produces: `store.init_db()` runs migrations 1–8 on either engine. `store._connect()` yields an object with `execute(sql, params=()) -> cursor` where cursor has `fetchone()`, `fetchall()` (dict-like rows) and `rowcount`; SQL is written with `?` placeholders and translated to `%s` for Postgres.
- Produces: `get_profile()` dict gains `user_id: str | None`, `is_demo: bool`, `preferences: dict[str, float]`, `skill_levels: dict[str, int]` (from `skill_progress`).

- [ ] **Step 1: Make tests use a throwaway default DB.** In `conftest.py`, at import time set `os.environ["DATABASE_PATH"]` to a file in `tempfile.mkdtemp()` and `os.environ["DATABASE_URL"] = ""`, so tests that call `get_reference()` without the `client` fixture never touch `backend/laluan.db`.

- [ ] **Step 2: Write failing tests** in `test_store.py`:
  - `test_migrations_create_new_tables`: after `store.init_db()`, a fresh profile from `create_profile(...)` has `user_id is None`, `is_demo is False`, `preferences == {}`, `skill_levels == {}`.
  - `test_init_db_is_idempotent`: calling `init_db()` twice raises nothing and schema version is 8.
  - `test_deleting_profile_removes_progress`: `set_skill_level(pid, "sql", 1)` then `delete_profile(pid)`; a raw count on `skill_progress` for `pid` is 0.
  - `test_postgres_round_trip` marked `@pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), ...)`: same create/get/delete against Postgres.

- [ ] **Step 3: Run** `python -m pytest tests/test_store.py -v` → FAIL (missing fields / functions).

- [ ] **Step 4: Implement.**
  - Add `psycopg[binary]>=3.2,<4` to `requirements.txt`; `DATABASE_URL=` with a comment to `.env.example`.
  - `_connect()`: if `database_url` set, `psycopg.connect(url, row_factory=dict_row)` with a thin wrapper that replaces `?` with `%s`; else today's SQLite (`PRAGMA foreign_keys = ON`). Migrations: split each script on `;` and execute statements one by one (no `executescript`) so both engines share code.
  - Migrations (portable SQL, TEXT ids, no AUTOINCREMENT):
    - 5: `profiles` add `user_id TEXT`, `is_demo INTEGER NOT NULL DEFAULT 0`, `preferences TEXT NOT NULL DEFAULT '{}'`; `CREATE UNIQUE INDEX IF NOT EXISTS profiles_user ON profiles(user_id) WHERE user_id IS NOT NULL`.
    - 6: `skill_progress(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, skill_id TEXT NOT NULL, level INTEGER NOT NULL, proven_at TEXT NOT NULL, PRIMARY KEY (profile_id, skill_id))`; `skill_checks(id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, skill_id TEXT NOT NULL, level INTEGER NOT NULL, questions TEXT NOT NULL, created_at TEXT NOT NULL, submitted_at TEXT, correct INTEGER, passed INTEGER)` + index on `(profile_id, skill_id, level)`.
    - 7: `survey_responses(profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, card_id TEXT NOT NULL, answer TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL, PRIMARY KEY (profile_id, card_id))`.
    - 8: `snapshots(id TEXT PRIMARY KEY, state TEXT NOT NULL, imported TEXT NOT NULL, body TEXT NOT NULL, decided_by TEXT, decided_at TEXT, reason TEXT)`.
  - New store functions: `set_skill_level(profile_id: str, skill_id: str, level: int) -> None` (upsert, keeps the max), `set_preferences(profile_id: str, prefs: dict[str, float]) -> None`. `_row` reads the new columns; `get_profile` adds `skill_levels`.

- [ ] **Step 5: Run** `python -m pytest -q` → all PASS (existing tests unchanged).

- [ ] **Step 6: Commit** `git commit -m "Let the store run on Postgres and add tables for progress, checks, survey and snapshots"`

---

### Task 2: Trend snapshots and review decisions live in the database

**Files:**
- Modify: `backend/app/store.py`, `backend/app/reference.py`, `backend/app/trends/review.py`, `backend/app/api.py` (`import_snapshot`), `backend/app/main.py` (lifespan order), `backend/tests/test_trends.py`, `backend/tests/test_api.py`

**Interfaces:**
- Consumes: Task 1 `snapshots` table.
- Produces: `store.save_snapshot(snapshot: dict, state: Literal["pending","approved","rejected"]) -> None`, `store.get_snapshot(snapshot_id: str) -> dict | None` (returns `{"state", "body": dict, "decided_by", "decided_at", "reason"}`), `store.list_snapshots(state: str) -> list[dict]` (bodies; returns `[]` if the table doesn't exist yet), `store.decide_snapshot(snapshot_id, state, decided_by, reason=None) -> None`.
- `review.py` keeps its public functions and `NotFound`; only their storage changes. `reference.load_snapshots(data_dir)` = committed files in `data/signals/*.json` + `store.list_snapshots("approved")`, same sort.

- [ ] **Step 1: Update tests first.** In `test_trends.py`, `test_refresh_waits_for_approval_then_reranks` asserts `store.get_snapshot(sid)["state"] == "approved"` and `["body"]["reviewed_by"] == "Team Reviewer"` instead of reading a file; `test_rejected_snapshot_is_kept_but_never_used` asserts `state == "rejected"` and `reason.startswith("Job-posting")`. In `test_api.py`, rename `test_snapshot_import_writes_inside_signals_dir` → `test_snapshot_import_is_stored_as_approved` asserting `store.get_snapshot(id)["state"] == "approved"` and no new file in `data/signals`. Keep the bad-id tests.

- [ ] **Step 2: Run** `python -m pytest tests/test_trends.py tests/test_api.py -v` → the three changed tests FAIL.

- [ ] **Step 3: Implement** the store functions; rewrite `review.save_pending/list_pending/preview/approve/reject` and `import_snapshot` (409 if the id already exists in files or DB) on them; in `main.py` lifespan call `store.init_db()` before `get_reference()`. Approval still stamps `reviewed_by`/`reviewed_at` into the body and calls `reload_reference()`. Update the `review.py` and `Dockerfile` comments that describe files.

- [ ] **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Keep trend snapshots and review decisions in the database so redeploys keep them"`

---

### Task 3: Login tokens, profile ownership and claiming

**Files:**
- Create: `backend/app/auth.py`
- Modify: `backend/app/api.py`, `backend/app/store.py`, `backend/app/config.py`, `backend/app/main.py` (CORS `allow_headers` add `Authorization`), `backend/scripts/cleanup.py`, `backend/requirements.txt`, `backend/.env.example`, `backend/data/demo_profiles.json` (no change yet), `backend/app/services/coach.py` (accepts the loaded profile; no auth inside services)
- Test: `backend/tests/test_auth.py` (create)

**Interfaces:**
- Produces: `Settings.supabase_url: str`, `Settings.supabase_jwt_secret: str` (env `SUPABASE_URL`, `SUPABASE_JWT_SECRET`).
- Produces: `auth.current_user(authorization: str = Header(default="")) -> str | None` FastAPI dependency: no header → `None`; valid `Bearer` token → `sub`; anything else → `HTTPException(401, "Please log in again")`. Verification: HS256 with `supabase_jwt_secret` when set, else RS256/ES256 via `PyJWKClient(f"{supabase_url}/auth/v1/.well-known/jwks.json")`; audience `"authenticated"`.
- Produces: `api._profile_for(profile_id: str, user_id: str | None) -> dict`: 404 if missing **or** if `profile["user_id"]` is set and differs from `user_id`. Every `/profiles/{id}/...` route and `/coach` uses it.
- Produces: `GET /api/me` → `{"user_id": str, "profile_id": str | None}` (401 without token). `POST /api/me/claim` body `{"profile_id": str, "replace": bool = false}` → 200 `{"profile_id"}`; 404 if the profile is missing, owned, or `is_demo`; 409 `{"detail": {"existing_profile_id": ...}}` if the account has a different profile and `replace` is false; with `replace`, delete the old one then attach.
- Produces: `store.profile_for_user(user_id) -> dict | None`, `store.attach_user(profile_id, user_id) -> None`, `store.create_profile(..., is_demo: bool = False)`; `purge_older_than` adds `AND user_id IS NULL`.

- [ ] **Step 1: Write failing tests** in `test_auth.py`, minting tokens with `jwt.encode({"sub": ..., "aud": "authenticated", "exp": ...}, "test-jwt-secret", "HS256")` and `SUPABASE_JWT_SECRET=test-jwt-secret` set in `conftest.py`:
  - `test_me_needs_a_token` (401) and `test_me_returns_no_profile_for_new_user` (`profile_id is None`).
  - `test_claim_attaches_anonymous_profile_and_locks_it`: after claim, `GET /profiles/{id}` without token → 404, with another user's token → 404, with owner token → 200.
  - `test_claim_conflict_asks_then_replaces`: second anonymous profile → 409 with `existing_profile_id`; with `replace: true` → 200, old profile 404 for everyone.
  - `test_demo_profiles_cannot_be_claimed` (Review Focus 5) → 404.
  - `test_expired_token_is_refused_but_anonymous_still_works` (Review Focus 1): expired token on owned profile → 401; anonymous profile with no header → 200.
  - `test_purge_keeps_owned_profiles`: back-date two profiles, one owned; `purge_older_than(30)` returns 1 and the owned one remains.

- [ ] **Step 2: Run** `python -m pytest tests/test_auth.py -v` → FAIL.

- [ ] **Step 3: Implement** as in Interfaces. Add `PyJWT[crypto]>=2.9,<3`. Demo profiles are created with `is_demo=True`. Update `cleanup.py` docstring and the privacy wording in the README "Skills profile" row: anonymous profiles are deleted after 30 days; profiles saved to an account stay until you delete them.

- [ ] **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Verify Supabase login tokens and let accounts own one profile"`

---

### Task 4: One Replit Deployment serves the API and the app

**Files:**
- Modify: `backend/app/main.py`, `backend/app/config.py`, `README.md`, `frontend/.env.example`, `frontend/src/lib/api.ts` (wake-up comment only), `.github/workflows/ci.yml` (branches list: add `v2-design`)
- Create: `.replit`, `replit.nix` only if Replit needs it (builder checks Replit's current Python + Node template)
- Delete: `render.yaml`
- Test: `backend/tests/test_api.py` (add)

**Interfaces:**
- Produces: `Settings.frontend_dist: Path | None` (env `FRONTEND_DIST`, default `<repo>/frontend/dist` if it exists, else `None`).
- When set: files under it are served at `/`; any non-`/api` GET that isn't a file returns `index.html` (the app keeps state in `?view=`). `/api/*` is unchanged and wins.

- [ ] **Step 1: Write failing test** `test_built_app_is_served_beside_the_api`: write `index.html` and `assets/app.js` into `tmp_path`, set `FRONTEND_DIST`; `GET /` and `GET /anything?view=roles` return the HTML; `GET /assets/app.js` returns the JS; `GET /api/health` returns JSON.

- [ ] **Step 2: Run** it → FAIL.

- [ ] **Step 3: Implement** with `StaticFiles` plus a catch-all route registered after the API router. `.replit`: run `cd backend && python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`; `[deployment]` build `cd frontend && npm ci && npm run build && cd ../backend && pip install -r requirements.txt`, same run command, `deploymentTarget = "autoscale"` (switch to Reserved VM in the Replit UI if the team wants no cold start). README: replace Vercel/Render links and the "Run it" hosting notes with Replit; list the secrets: `GEMINI_API_KEY`, `ADMIN_TOKEN`, `DATABASE_URL` (Supabase pooler URI), `SUPABASE_URL`, `SUPABASE_JWT_SECRET` (optional), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (build-time). Leave `docker-compose.yml` as is.

- [ ] **Step 4: Run** `python -m pytest -q` → PASS; `cd frontend && npm run build` → succeeds.

- [ ] **Step 5: Commit** `git commit -m "Serve the built app from FastAPI for a single Replit deployment"`

---

### Task 5: Log in with Google in the app

**Files:**
- Create: `frontend/src/lib/auth.ts`, `frontend/src/components/AccountButton.tsx`
- Modify: `frontend/package.json`, `frontend/src/lib/api.ts`, `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/lib/i18n.ts`, `frontend/.env.example`

**Interfaces:**
- Consumes: Task 3 `/api/me`, `/api/me/claim`.
- Produces: `auth.ts` exports `authEnabled: boolean` (both `VITE_SUPABASE_*` set), `signIn(): Promise<void>` (`signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } })`), `signOut(): Promise<void>`, `getToken(): string | null` (kept current via `onAuthStateChange`), `onAuth(listener: (userId: string | null) => void): () => void`.
- `api.ts` `request()` and the two direct `fetchAwake` calls add `Authorization: Bearer <token>` when `getToken()` is non-null. New `api.me()`, `api.claim(profileId, replace)`. A 401 calls `signOut()` and shows `t("auth.expired")`; the stored browser profile id is kept.

- [ ] **Step 1: Add** `"@supabase/supabase-js": "2.45.4"`; `npm install`.

- [ ] **Step 2: Implement** `auth.ts` and `AccountButton` ("Log in with Google" / avatar initial + "Log out"), shown in the landing nav and the sidebar. Hidden when `authEnabled` is false, so local runs without Supabase look like today.

- [ ] **Step 3: Implement the after-login flow in `App.tsx`:** on a user id, call `me()`. Browser holds a non-demo profile id and account has none → `claim(id, false)`. Account has one and browser holds a different non-demo one → dialog "Keep your saved profile" (default, loads account profile) / "Replace it with this one" (`claim(id, true)`). Browser holds a demo profile → just load the account profile. Never merge.

- [ ] **Step 4: Verify** `npm run build` passes; with a Supabase project configured (Google provider on, Replit URL + `http://localhost:5173` in redirect URLs), log in locally: an anonymous profile becomes owned (opening it in a private window with the id → "expired"), and logging out keeps working anonymously.

- [ ] **Step 5: Commit** `git commit -m "Add Google login and attach the browser's profile to the account"`

---

### Task 6: Remove the user's SDG choice from ranking

**Files:**
- Modify: `backend/app/services/matching.py`, `backend/app/schemas.py` (`ProfileIn`: drop `interests`), `backend/app/api.py`, `backend/app/services/coach.py` (drop the `"interest"` proposal kind and SDG-points wording), `backend/app/services/intake.py` (drop `INTEREST_WORDS` and the `interests` field), `backend/data/demo_profiles.json` (drop `interests`), `frontend/src/screens/Review.tsx` (remove the goal picker), `frontend/src/App.tsx` (`applyProposal` scenario only), `frontend/src/lib/api.ts` types, `frontend/src/screens/Home.tsx`, `frontend/src/screens/Roles.tsx` (effect deps), affected tests in `backend/tests/`

**Interfaces:**
- Produces: `matching._breakdown(...)` returns `{"fit", "score", "fit_points", "outlook_points", "preference_points": 0.0, "matched_preferences": []}` (Task 11 fills the last two). `ProfileIn` has no `interests`; `store.create_profile/update_profile` drop the `interests` parameter (the DB column stays, unused).
- `CoachProposal.kind` is `"scenario"` only.

- [ ] **Step 1: Update tests:** delete `test_sdg_interest_changes_the_ranking_and_is_explained`; in `test_score_breakdown_adds_up...` sum `fit_points + outlook_points + preference_points`; remove `interests` from request bodies; add `test_profile_rejects_interests_field` (422 because `extra="forbid"`); `test_coach_proposes_changes_but_never_applies_them` asserts only scenario proposals.

- [ ] **Step 2: Run** `python -m pytest -q` → the updated tests FAIL.

- [ ] **Step 3: Implement**; the SDG impact screen and every SDG reason stay untouched.

- [ ] **Step 4: Run** `python -m pytest -q` → PASS; `npm run build` → succeeds.

- [ ] **Step 5: Commit** `git commit -m "Stop letting users pick SDGs; SDG links stay as the system's explanation"`

---

### Task 7: Skill tree data and tree endpoint

**Files:**
- Create: `backend/data/skill_prereqs.json`, `backend/data/skill_levels.json`, `backend/app/services/skilltree.py`
- Modify: `backend/app/reference.py`, `backend/app/services/matching.py` (`effective_skills`), `backend/app/api.py`, `backend/tests/test_data_integrity.py`
- Test: `backend/tests/test_skilltree.py` (create)

**Interfaces:**
- Data: `skill_prereqs.json` = `{"note": "...AI-drafted, team-reviewed...", "prereqs": {skill_id: [skill_id, ...]}}` covering every skill used in `roles.json` that has a sensible prerequisite (e.g. `power_bi: ["excel"]`, `sql: ["excel"]`, `data_visualization: ["excel"]`, `machine_learning: ["python", "statistics"]`). `skill_levels.json` = `[{"level": 1, "name": "Basic", "description": ...}, {"level": 2, "name": "Working", ...}, {"level": 3, "name": "Advanced", ...}]`.
- Produces: `Reference.skill_prereqs: dict[str, list[str]]`, `Reference.skill_levels: list[dict]`.
- Produces: `matching.effective_skills(ref, profile)` = reported skills ∪ course skills ∪ `{s for s, lvl in profile.get("skill_levels", {}).items() if lvl >= 1}`.
- Produces: `skilltree.build(ref: Reference, profile: dict, role_id: str) -> dict` returning `{"role": {"role_id", "title"}, "nodes": [{"skill_id", "name", "level": 0-3, "from_cv": bool, "unlocked": bool, "prereqs": [ids], "depth": int, "course": {"id","title","url"} | None}]}`. Node set = role skills + their transitive prereqs. `depth` = longest prereq chain below the node (0 = root). `unlocked` = every prereq is in `profile["skills"]` or has level ≥ 1. `course` = first catalogue course teaching the skill.
- Produces: `skilltree.is_unlocked(ref, profile, skill_id) -> bool` (used by Task 8).
- Route: `GET /api/profiles/{id}/tree?role=<role_id>` (404 unknown role; ownership via `_profile_for`).

- [ ] **Step 1: Write failing tests:** integrity `test_skill_prereqs_reference_known_skills_and_have_no_cycles`; `test_tree_layers_prereqs_below_skills` (for `data_analyst`, `sql` depth > `excel` depth); `test_locked_until_prereqs_basic` (profile without `excel` → `sql` locked; after `set_skill_level(pid,"excel",1)` → unlocked); `test_basic_level_counts_toward_fit` (fit for `data_analyst` rises after `set_skill_level(pid,"sql",1)`).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**; write both data files (prereqs drafted for all skills in `roles.json`; note says the team must review them, add a line to `docs/REVIEW_LOG.md`).

- [ ] **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Add the skill tree: prerequisites, levels and a per-role tree"`

---

### Task 8: Proof checks

**Files:**
- Create: `backend/app/services/proofcheck.py`
- Modify: `backend/app/store.py`, `backend/app/api.py`, `backend/app/schemas.py`
- Test: `backend/tests/test_proofcheck.py` (create)

**Interfaces:**
- Consumes: Task 7 `skilltree.is_unlocked`, `Reference.skill_levels`; Task 1 tables; Task 3 `_profile_for`.
- Produces: `proofcheck.QUESTIONS = 3`, `PASS_MARK = 2`, `class Unavailable(Exception)`, `proofcheck.generate(ref, skill_id: str, level: int, language: str) -> list[dict]` — each `{"prompt": str, "options": [4 str], "answer": int, "explanation": str}`; one `generate_json` call, one retry if fewer than 3 valid questions, else `Unavailable`; no key → `Unavailable`. The prompt contains only skill name, level name + description and language. Validity: exactly 4 distinct non-empty options, `answer` in 0–3, prompt ≤ 400 chars.
- Produces: `proofcheck.grade(questions: list[dict], answers: list[int]) -> tuple[int, bool]`.
- Produces store: `create_check(profile_id, skill_id, level, questions) -> str`, `get_check(check_id) -> dict | None`, `submit_check(check_id, correct: int, passed: bool) -> bool` (False if already submitted), `attempted_today(profile_id, skill_id, level) -> bool` (UTC date of `created_at`).
- Routes:
  - `POST /api/profiles/{id}/skills/{skill_id}/checks` body `{"language": "en"|"ms"|"zh" = "en"}` → 201 `{"check_id", "skill_id", "level", "level_name", "questions": [{"prompt", "options"}]}`. Level = current + 1. Errors: 404 unknown skill, 409 "Already at Advanced", 409 "Unlock the skills below first", 429 "You can try this level again tomorrow" (skipped when `is_demo`), 503 "Proof checks are unavailable right now" (no row created).
  - `POST /api/checks/{check_id}` body `{"profile_id": str, "answers": [int, int, int]}` → `{"passed", "correct", "level", "explanations": [str], "course": {...} | None}`; on pass `set_skill_level`. 404 if the check doesn't belong to that profile (after `_profile_for`), 409 if already submitted.

- [ ] **Step 1: Write failing tests** (monkeypatch `app.services.proofcheck.generate_json`):
  - `test_questions_are_sent_without_answers` (response has no `answer`/`explanation` keys).
  - `test_two_of_three_passes_and_fills_the_level` → profile `skill_levels["sql"] == 1`; `test_one_of_three_fails_and_suggests_a_course`.
  - `test_second_attempt_same_day_is_refused` (429) and `test_demo_profiles_can_retry_at_once`.
  - `test_unavailable_check_does_not_count_as_an_attempt` (Review Focus 2): first call `generate_json` raises → 503; then it returns valid questions → 201.
  - `test_attempt_is_graded_once_and_only_for_its_owner` (Review Focus 3).
  - `test_malformed_questions_are_dropped` (two good + two bad then retry returns three good → 201 with 3 questions).
  - `test_prompt_has_no_profile_details` (display name "Siti Nurhaliza" absent from the captured prompt).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Prove skill levels with Gemini-generated questions graded on the server"`

---

### Task 9: Skill tree screen

**Files:**
- Create: `frontend/src/screens/SkillTree.tsx`, `frontend/src/components/SkillRing.tsx`, `frontend/src/components/ProofCheck.tsx`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/route.ts` (`"tree"` screen; carries `role` like `"role"`), `frontend/src/App.tsx`, `frontend/src/components/Sidebar.tsx`, `frontend/src/screens/RoleDetail.tsx` (button "Open my skill tree"), `frontend/src/lib/i18n.ts`, `frontend/src/styles/app.css`

**Interfaces:**
- Consumes: Task 7 tree JSON, Task 8 routes. New `api.tree(profileId, roleId)`, `api.startCheck(profileId, skillId, language)`, `api.submitCheck(checkId, profileId, answers)`; TS types `SkillTree`, `TreeNode`, `CheckStart`, `CheckResult` mirroring the backend shapes.
- `SkillRing({ level: 0|1|2|3, size?: number })`: SVG ring with three marks; filled share = level/3; green at 3, amber otherwise, grey track (use existing CSS colour tokens for both themes).

- [ ] **Step 1: Implement** the classic tree (spec mockup A): target role card at the top, rows by `depth` descending so roots sit at the bottom, locked nodes greyed with "locked", CV skills labelled "from your CV". Tapping an unlocked node below level 3 opens `ProofCheck`: one question at a time, then pass/fail result; fail shows "Try again tomorrow" (not for demo) and the course link. 429/503 show their messages. Not logged in and not a demo → banner `t("tree.loginToKeep")` with the Google button. Keyboard and screen-reader: nodes are buttons with `aria-label` "SQL, Basic of Advanced, locked".

- [ ] **Step 2: Verify** `npm run build`; run backend with a Gemini key, open the clerk demo → Data analyst → skill tree; pass a Basic check and see the ring and readiness change; check 375 px width has no horizontal scroll, and dark mode.

- [ ] **Step 3: Commit** `git commit -m "Add the skill tree screen with ring progress and proof checks"`

---

### Task 10: Work context and survey card data

**Files:**
- Create: `backend/data/survey_cards.json`, `backend/data/work_dimensions.json`
- Modify: `backend/data/roles.json` (add `work_context` to every role), `backend/app/reference.py`, `backend/tests/test_data_integrity.py`, `docs/REVIEW_LOG.md` (line saying these are AI-drafted and need team review)

**Interfaces:**
- `work_dimensions.json`: `[{"id": "people", "plus": "working with people", "minus": "working with data and systems"}, {"id": "structured", "plus": "structured, predictable days", "minus": "open-ended, varied work"}, {"id": "field", "plus": "working on site or out and about", "minus": "working at a desk"}, {"id": "shifts", "plus": "shift or flexible hours", "minus": "fixed office hours"}, {"id": "team", "plus": "working in a team", "minus": "working on your own"}]` (plus/minus also as `{en, ms, zh}`).
- `roles.json` role gains `"work_context": {dim_id: float in [-1, 1]}` for all five dimensions.
- `survey_cards.json`: list of `{"id": "card-<role>-<n>", "role_ids": [...], "text": {"en", "ms", "zh"}, "dims": {dim_id: 1 | -1}}`, about 3–4 per role, drafted from that role's O\*NET tasks and work context.
- Produces: `Reference.work_dimensions: list[dict]`, `Reference.survey_cards: dict[str, dict]`.

- [ ] **Step 1: Write failing integrity tests:** `test_every_role_has_a_full_work_context`, `test_survey_cards_are_valid` (known roles and dims, values ±1, three languages non-empty, unique ids), `test_every_dimension_has_cards_both_ways`.

- [ ] **Step 2: Run** → FAIL. **Step 3:** write the data. **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Add work context per role and the survey card bank"`

---

### Task 11: Survey logic and the preference factor

**Files:**
- Create: `backend/app/services/survey.py`
- Modify: `backend/app/services/matching.py`, `backend/app/services/coach.py` (one source line mentions preference points), `backend/app/api.py`, `backend/app/schemas.py`, `backend/app/store.py`, `backend/data/demo_profiles.json`
- Test: `backend/tests/test_survey.py` (create)

**Interfaces:**
- Consumes: Task 10 data; Task 6 breakdown keys; Task 1 `set_preferences`, `survey_responses`.
- Produces `survey.py`:
  - `pick_cards(ref, profile, n: int = 10) -> list[dict]`: take the top 8 roles by `matching.match(...)` baseline order; candidate cards whose `role_ids` meet them; greedily pick so every dimension appears at least once, then prefer roles not yet represented, ties by card id; return 8–10 cards.
  - `interpret(text: str, language: str) -> dict` → `{"dims": {dim: ±1}, "reading": str | None}`; scrubbed text to Gemini, offline keyword fallback (e.g. "team" → team +1, "alone" → team −1, "outdoor" → field +1); empty dims when unsure.
  - `preferences(ref, answers: list[dict]) -> dict[str, float]`: like → +card dims, dislike → −card dims, other → confirmed `dims` only; each dimension = sum / number of answers touching it, clipped to [−1, 1]; dimensions never touched are omitted.
  - `summary(ref, prefs, language) -> list[str]`: one sentence per dimension with |value| ≥ 0.5, e.g. "You seem to prefer working with people."
  - `preference_match(prefs, work_context) -> float` = Σ p·c / Σ|p| over dims in prefs (0 when prefs empty).
- Matching: `preference_points = round(PREFERENCE_BOOST * max(0, preference_match), 4)`; `matched_preferences` = dims where `p * c >= 0.5`, as `{"dim", "label"}` using the pole the user prefers. `match()` adds top-level `"also_like"`: up to 3 roles ranked below 5 with `preference_match >= 0.5` and `fit >= 0.25` (our floor), sorted by match desc; empty when no preferences.
- Routes: `GET /api/profiles/{id}/survey` → `{"cards": [{"id", "text", "role_ids"}], "dimensions": [...]}`; `POST /api/survey/interpret` `{"text" (1–300 chars), "language"}`; `POST /api/profiles/{id}/survey` `{"answers": [{"card_id", "answer": "like"|"dislike"|"other", "note"?: str ≤300, "dims"?: {dim: ±1}}]}` (1–12 answers, known cards only) → replaces previous responses (note stored scrubbed), saves preferences, returns `{"preferences", "summary", "also_like"}`.
- Demo: each demo profile gains `"survey_answers"`; `create_demo_profile` runs them through `preferences()`. Aisyah leans structured + desk + data; Wei Jie leans people + team + open-ended. Rewrite Wei Jie's `story` around those preferences (drop "cares about climate change").

- [ ] **Step 1: Write failing tests:**
  - `test_cards_cover_every_dimension_and_several_roles` (8–10 cards, all five dims, ≥3 distinct roles).
  - `test_likes_and_dislikes_move_preferences` (like a people+1 card and dislike a people−1 card → `people == 1.0`).
  - `test_unconfirmed_other_is_kept_as_note_only`.
  - `test_preference_adds_a_visible_small_boost` (boost ≤ 0.05; `matched_preferences` label present; breakdown sums to score).
  - `test_also_like_lists_roles_outside_top_five`.
  - `test_survey_with_no_usable_answers_changes_nothing` (Review Focus 4).
  - `test_demo_profiles_come_with_preferences` (both demos have non-empty preferences and at least one role with `preference_points > 0`).
  - `test_interpret_scrubs_before_llm` (email in text never reaches captured prompt).

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Discover work preferences from a survey and use them as a small ranking factor"`

---

### Task 12: Survey screen, preference line and "you might also like"

**Files:**
- Create: `frontend/src/screens/Survey.tsx`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/route.ts` (`"survey"`), `frontend/src/App.tsx` (after `Review` saves → `survey`; "Skip" → `home`), `frontend/src/components/Sidebar.tsx` ("Retake the survey" under My profile), `frontend/src/components/RoleCard.tsx` and `frontend/src/screens/RoleDetail.tsx` (Why this rank? line "+ fits your preference for …"), `frontend/src/screens/Roles.tsx` (also-like section), `frontend/src/screens/ReviewKit.tsx` (include card texts and dimension labels so BM / 中文 get checked), `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: Task 11 routes and `RoleMatch.why.preference_points`, `why.matched_preferences`, `Matches.also_like`.

- [ ] **Step 1: Implement** one card at a time with Like / Dislike / Other; Other opens a text box (mic comes in Phase 2), calls `interpret`, shows "We read this as: … Right?" Yes/No; progress "3 of 9"; end screen shows the summary sentences, the also-like roles and "See my roles". Card text uses the current language with English fallback. Not logged in and not demo → same login banner as the tree.

- [ ] **Step 2: Verify** `npm run build`; walk the intake → review → survey → roles flow locally offline (no Gemini key: Other falls back to keywords), and open both demos to see the preference line.

- [ ] **Step 3: Commit** `git commit -m "Add the survey screen and show preferences in rankings"`

---

### Task 13: Send less to the LLM, and say so

**Files:**
- Modify: `README.md` (privacy row), `docs/AI_DECLARATION.md` or the in-app privacy note (whichever states what is sent), `frontend/src/screens/landing/*` FAQ text if it describes what Gemini sees
- Test: `backend/tests/test_privacy.py` (create)

**Interfaces:**
- Consumes: every `generate_json` caller (`skills.extract`, `pathway.build`, `coach.answer`, `proofcheck.generate`, `survey.interpret`).

- [ ] **Step 1: Write the test** `test_only_cv_extraction_sees_cv_text`: monkeypatch `generate_json` in each module to record prompts; create a profile with display name "Siti Nurhaliza" and a CV containing an email and a unique phrase "Kampung Baru warehouse"; run extract, pathway, coach, a proof check and interpret. Assert the display name and email appear in no prompt, and the unique phrase appears only in the extraction prompt.

- [ ] **Step 2: Run** → expected PASS already (current prompts send only role/course data and scrubbed questions); if it fails, fix the caller that leaks.

- [ ] **Step 3: Update wording:** after extraction, only skills, role and your scrubbed questions are sent to Google Gemini; the live demo uses a paid-tier key, which Google does not use to improve its products.

- [ ] **Step 4: Commit** `git commit -m "Pin down that only CV extraction ever sends CV text to the model"`

---

### Task 14: Final check

- [ ] `cd backend && python -m pytest -q` → all pass. `cd frontend && npm run build` → succeeds.
- [ ] Deploy to Replit with the Supabase secrets; run migrations by starting the app; open the clerk demo, student demo and HR view with no login; log in with Google from a second account; take the survey and one proof check; restart the deployment and confirm both are still there.
- [ ] Update `docs/REVIEW_LOG.md` with what was checked and what still needs team review (prerequisites, work context, survey cards, BM / 中文).
