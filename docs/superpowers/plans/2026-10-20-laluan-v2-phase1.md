# Laluan v2 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google login with Supabase-backed storage, Replit single-deployment hosting, a skill tree with Gemini proof checks, and a personalised preference survey, remove the user's SDG choice from ranking, make the app demonstrably serve all four groups in the brief (working adults, graduates and switchers, HR, career centres), then add four innovation features: Signal X-ray, your own AI future with tipping points, "What if I learn…?", and the pay jump in ringgit from DOSM.

**Build order:** Tasks 1–5 login and storage → 6 → 7–9 skill tree → 10–12 survey → 13 → 14–18 four groups → 19–22 innovation features → 23. If time runs out, stop at a task boundary; every task leaves the app working.

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
- Audiences: `audience` ∈ `"worker" | "graduate" | "switcher"`; worker and switcher need `current_role_id`. Graduate entry boost `ENTRY_BOOST = 0.05` on roles with `entry_level: true`. Class view: identifying columns rejected, counts under 3 shown as "fewer than 3", totals only.
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

### Task 14: "Which describes you?" changes behaviour per group

**Files:**
- Modify: `backend/app/schemas.py`, `backend/app/store.py` (migration 9: `profiles` add `audience TEXT`), `backend/app/services/matching.py`, `backend/app/services/pathway.py`, `backend/app/api.py`, `backend/app/services/workforce.py` (drop the stale `"interests": []`), `backend/data/roles.json` (add `"entry_level": bool` to every role), `backend/data/demo_profiles.json` (`audience` on clerk = worker, student = graduate; new `switcher` demo), `backend/tests/test_data_integrity.py`
- Test: `backend/tests/test_audiences.py` (create; Task 18 extends it)

**Interfaces:**
- Produces: `ProfileIn.audience: Literal["worker", "graduate", "switcher"] = "worker"`; validator: worker/switcher without `current_role_id` → 422 "Choose your current role". Profile dict gains `audience`.
- Produces in `matching`: `ENTRY_BOOST = 0.05`; breakdown gains `entry_points` (graduate + `entry_level` role → 0.05, else 0.0); score = fit + outlook + preference + entry points. Each role row gains `carry_over: [{"skill_id", "name"}]` = covered skills that are also skills of the person's current role (empty when no current role). `match()` returns top-level `"current_role": <row> | None`. For `switcher` that row is removed from `roles` and excluded from robust picks; for other audiences it also stays in the list.
- Produces in `pathway.build`: for `worker`, among courses covering the same skills, prefer `hrd_corp == "claimable"`.
- Entry-level roles: data entry clerk, administrative assistant, customer service representative, data analyst, digital marketing specialist, renewable energy technician, care worker.
- New demo `switcher`: "Farid (demo)", a synthetic customer service representative moving towards UX / UI design, `audience: "switcher"`, with `survey_answers` like the other demos.

- [ ] **Step 1: Write failing tests:** `test_worker_and_switcher_need_a_current_role` (422), `test_graduate_gets_entry_boost_on_entry_roles_only`, `test_switcher_current_role_is_set_apart` (not in `roles`, not robust, present as `current_role`), `test_carry_over_lists_shared_skills`, `test_worker_pathway_prefers_claimable_courses`, integrity `test_every_role_has_entry_level`; update the breakdown-sum test to include `entry_points`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `python -m pytest -q` → PASS.

- [ ] **Step 5: Commit** `git commit -m "Let people say whether they are working, graduating or switching, and adapt results"`

---

### Task 15: Audience in the app

**Files:**
- Modify: `frontend/src/screens/Intake.tsx` (first question, three large choices), `frontend/src/screens/Review.tsx` (current role required for worker/switcher), `frontend/src/screens/Home.tsx` (lead block per audience: worker → current-role outlook + "My job, task by task"; graduate → "Roles you can start in"; switcher → "Where you are now" card + top role with carry-over skills), `frontend/src/components/RoleCard.tsx` and `frontend/src/screens/RoleDetail.tsx` ("Skills you bring from <current role>" chips; "+ open to new graduates" line in Why this rank?), `frontend/src/screens/Roles.tsx` (switcher: current role card above the list), `frontend/src/components/Sidebar.tsx` (My profile: change "I'm …"), `frontend/src/screens/landing/*` (third demo "Farid, changing careers"), `frontend/src/App.tsx` (`?demo=switcher`), `frontend/src/lib/api.ts`, `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: Task 14 `audience`, `why.entry_points`, `carry_over`, `Matches.current_role`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npm run build`; open all three individual demos and confirm each Today screen leads with its own block; intake as "changing careers" won't continue without a current role.
- [ ] **Step 3: Commit** `git commit -m "Show each group what matters to them first"`

---

### Task 16: Class view for career centres

**Files:**
- Create: `backend/app/services/classview.py`, `backend/data/sample_class.csv` (40 synthetic students, columns `programme,skills`, e.g. diploma in business, diploma in electrical, degree in computing)
- Modify: `backend/app/api.py`, `backend/app/services/workforce.py` (expose `FORBIDDEN` and a skills-parsing helper for reuse instead of copying)
- Test: `backend/tests/test_classview.py` (create)

**Interfaces:**
- Produces: `classview.SMALL = 3`; `classview.analyse(ref, text: str, scenario_id: str) -> dict` returning `{"scenario", "students": int, "programmes": [{"name", "students"}], "best_fit": [{"role_id", "title", "students", "outlook"}], "top_gaps": [{"skill_id", "name", "students", "course": {...} | None}], "courses": [{"course", "students_helped", "hours"}], "sdg_contribution": [...], "problems": [str], "signal_source": {...}}`, where every count below `SMALL` is the string `"fewer than 3"`. Each student is matched as `audience="graduate"`; `top_gaps` = missing skills of each student's top role, counted; `courses` = catalogue courses ranked by the number of students whose gap they close. Raises `workforce.WorkforceError` on identifying columns, a missing `skills` column, or no readable rows.
- Routes: `GET /api/class/sample` (CSV text), `POST /api/class/analyse` with the existing `WorkforceRequest` body.

- [ ] **Step 1: Write failing tests:** `test_class_view_is_totals_only` (`students == 40` for the sample; no list in the output has one entry per student), `test_small_counts_are_hidden` (4-student CSV where one role has 1 student → `"fewer than 3"`), `test_class_view_rejects_identifying_columns` (`name` column → 422), `test_top_gaps_come_with_courses`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `python -m pytest -q` → PASS.
- [ ] **Step 5: Commit** `git commit -m "Add a class view so career centres can see a cohort's fit and gaps"`

---

### Task 17: Class view screen

**Files:**
- Modify: `frontend/src/screens/Workforce.tsx` (tabs "Company (HR)" and "Class (career centre)"; the class tab mirrors the HR layout: upload or sample, best-fit roles, top gaps with courses, courses helping most students, SDG contribution, the "totals only" notice), `frontend/src/App.tsx` (`?demo=class` opens the class tab with the sample), `frontend/src/screens/landing/*` (career-centre entry point), `frontend/src/lib/api.ts`, `frontend/src/lib/i18n.ts`

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Verify** `npm run build`; `?demo=class` shows the sample with no student-level rows and "fewer than 3" renders as text.
- [ ] **Step 3: Commit** `git commit -m "Add the career-centre class tab to the workforce screen"`

---

### Task 18: A guarantee test and a person's evaluation per group

**Files:**
- Modify: `backend/tests/test_audiences.py`, `docs/EVALUATION.md`, `frontend/src/screens/ReviewKit.tsx` (pathway tab covers the three demos plus the HR and class samples), `README.md` (feature table and suggested demo cover all four groups)

**Interfaces:**
- Consumes: demo profiles (Task 14), `workforce.analyse`, `classview.analyse`.

- [ ] **Step 1: Write the group tests**, each through the API with the demo persona or sample file, so they test what judges see:
  - `test_group_working_adult`: Aisyah's `current_role` carries an outlook label, and her top 5 has a non-declining role with fit ≥ 0.4 whose pathway has at least one step.
  - `test_group_graduate`: Wei Jie's top 5 has at least one `entry_level` role with `why.entry_points > 0`.
  - `test_group_switcher`: Farid's current role is not in the top 5, and his top role has ≥ 2 `carry_over` skills.
  - `test_group_hr`: the sample analysis has no per-person rows; every move has `people ≥ 1` and `avg_hours`.
  - `test_group_career_centre`: the class sample is totals only, has ≥ 3 `top_gaps`, each with a course.
- [ ] **Step 2: Run** `python -m pytest tests/test_audiences.py -v` → PASS. If one fails, fix the data or logic in the owning task's files, never loosen the test, and record why in `docs/DECISIONS.md`.
- [ ] **Step 3: Extend EVALUATION.md** section 2 to five rows (Aisyah, Wei Jie, Farid, HR sample, class sample); update the review kit's pathway tab to produce that table.
- [ ] **Step 4: Run** `python -m pytest -q` and `npm run build` → pass.
- [ ] **Step 5: Commit** `git commit -m "Guard each of the four groups with a test and a person's review"`

---

### Task 19: Signal X-ray

Tap any outlook number and see the chain that produced it.

**Files:**
- Create: `backend/app/services/xray.py`, `frontend/src/components/SignalXray.tsx`
- Modify: `backend/app/api.py`, `frontend/src/lib/api.ts`, `frontend/src/components/RoleCard.tsx`, `frontend/src/screens/RoleDetail.tsx`, `frontend/src/lib/i18n.ts`
- Test: `backend/tests/test_xray.py` (create)

**Interfaces:**
- Consumes: `scenario.outlook`, `scenario.year_fraction`, `scenario.AI_SWING`, builder constants `CAP_POINTS`; snapshot signal rows (trend-adjusted rows carry `baseline_growth_pct`, `demand_points`, `ai_points`; the WEF snapshot has only `net_growth_pct`).
- Produces: `xray.explain(ref, role_id: str, scenario_id: str, year: int | None, adoption: float | None = None) -> dict` returning `{"role_id", "steps": [{"label", "value", "running_total", "source", "cap": str | None}], "final": float, "label": str}`. Steps in order: published baseline (source + snapshot id) → job-posting demand points (cap ±15, or "no trend refresh approved yet") → AI research momentum points (cap ±15, same fallback) → scenario swing `(adoption − 1) × 40 × (complementarity − exposure)` with both values and "team estimate" note → year scaling (fraction, base and horizon year) → final index and label. `final` must equal `scenario.outlook(...).index` for the same inputs.
- Route: `GET /api/roles/{role_id}/xray?scenario=baseline&year=2030&adoption=` (adoption overrides the scenario, used by Task 20).

- [ ] **Step 1: Write failing tests:** `test_xray_final_matches_the_ranked_outlook` (every role × every scenario, equals the `match()` outlook index), `test_xray_shows_trend_steps_when_snapshot_has_them` (approve a trend-adjusted snapshot via the Task 2 test helper and see non-zero demand/research steps with caps), `test_xray_says_when_no_refresh_is_approved`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** backend, then a drawer opened from the outlook number on role cards and the role page, showing each step as a row with its source.
- [ ] **Step 4: Run** `python -m pytest -q` → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `git commit -m "Add Signal X-ray: show how each forecast number is built"`

---

### Task 20: Your own AI future and tipping points

**Files:**
- Create: `backend/app/services/tipping.py`, `frontend/src/components/AdoptionSlider.tsx`
- Modify: `backend/app/services/matching.py`, `backend/app/api.py`, `backend/app/schemas.py`, `frontend/src/screens/Roles.tsx`, `frontend/src/screens/Home.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/route.ts` (`adoption` in the query string), `frontend/src/lib/i18n.ts`
- Test: `backend/tests/test_tipping.py` (create)

**Interfaces:**
- Produces: `matching.match(ref, profile, scenario_id, year=None, adoption: float | None = None)`; when `adoption` is given, the chosen scenario's outlooks use it (label "Your AI future: 1.3× adoption"); the other scenarios stay as they are, so robust picks keep their meaning. `/profiles/{id}/matches` accepts `adoption` (0.5–2.0, `Query(ge=0.5, le=2.0)`).
- Produces: `tipping.ADOPTION_RANGE = (0.5, 2.0)`, `tipping.STEP = 0.05`; `tipping.find(ref, profile, year: int | None) -> dict` returning `{"current_role": {"role_id", "declining_at": float | None, "declining_below": bool} | None, "overtakes": [{"role_id", "title", "overtakes_role_id", "overtakes_title", "above": float}]}`. `declining_at` is solved from the outlook formula (index = −10) and kept only inside the range. `overtakes` scans the range in `STEP`s and records where two of the baseline top-5 roles swap rank; at most 3, smallest adoption change from 1.0 first.
- Copy, generated from those fields: "Your job becomes Declining at 0.8× adoption." / "Data analyst overtakes AI operations specialist above 1.7× adoption."
- Route: `GET /api/profiles/{id}/tipping?year=`.

- [ ] **Step 1: Write failing tests:** `test_custom_adoption_matches_preset_at_same_value` (adoption 1.6 == accelerated outlooks), `test_declining_point_solves_the_formula` (at `declining_at` the clerk's index is −10 ± 0.5), `test_overtake_is_real` (just below `above` the first role ranks lower, just above it higher), `test_adoption_out_of_range_is_refused` (422), `test_no_tipping_point_returns_none` (a role whose label never changes in range).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** backend, then a slider under the three scenario buttons on Roles (0.5×–2×, 0.05 steps; moving it selects "Your AI future"), live re-ranking (debounced 200 ms), and the tipping sentences on Roles and on Today for workers and switchers.
- [ ] **Step 4: Run** `python -m pytest -q` → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `git commit -m "Let people set their own AI adoption speed and see their tipping points"`

---

### Task 21: "What if I learn…?"

**Files:**
- Modify: `backend/app/api.py` (`extra` on matches), `backend/app/services/matching.py`, `frontend/src/screens/Roles.tsx`, `frontend/src/screens/RoleDetail.tsx`, `frontend/src/components/RoleCard.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/i18n.ts`
- Test: `backend/tests/test_whatif.py` (create)

**Interfaces:**
- Produces: `GET /api/profiles/{id}/matches?extra=sql,python` (≤ 10 known skill ids, 422 otherwise). `match()` gains `extra_skills: set[str] = frozenset()` added to effective skills for this call only; nothing is saved. Each role row gains `rank_without_extra` when `extra` is given.
- UI: a "What if I learn…?" picker on Roles and the role page listing skills the person doesn't have (role's missing skills first). Ticking one re-ranks live; cards show ▲3 / ▼1 rank moves and the readiness bar animates. "Add to my skill tree" goes to the tree for that role; nothing changes on the profile until a proof check is passed.

- [ ] **Step 1: Write failing tests:** `test_what_if_moves_rank_without_saving` (data analyst rank improves with `extra=sql,python`; `GET /profiles/{id}` unchanged), `test_what_if_rejects_unknown_or_too_many_skills`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `python -m pytest -q` → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `git commit -m "Add a what-if skill picker that re-ranks roles live without saving"`

---

### Task 22: Pay jump in ringgit (DOSM)

**Files:**
- Create: `backend/data/salaries.json`
- Modify: `backend/data/roles.json` (add `"masco_major"` to every role), `backend/app/reference.py`, `backend/app/services/matching.py`, `backend/app/services/cards.py` (Future Card shows the pay line), `frontend/src/screens/RoleDetail.tsx`, `frontend/src/components/RoleCard.tsx`, `frontend/src/lib/api.ts`, `frontend/src/lib/i18n.ts`, `backend/tests/test_data_integrity.py`, `README.md` (data note), `docs/DECISIONS.md`
- Test: `backend/tests/test_pay.py` (create)

**Data (verified 20 Oct 2026 against the official PDF):** DOSM, *Salaries & Wages Survey Report, Malaysia, 2025*, released 21 Sep 2026, Appendix table A10 (report page 77), Malaysian citizens, MASCO 2020 major groups, <https://storage.dosm.gov.my/labour/salaries_wages_2025.pdf>. Copy these exact values into `salaries.json` as `{"source", "source_url", "table", "year": 2025, "note": "Group medians for Malaysian citizens, not job offers", "groups": [{"id", "name", "median_rm", "mean_rm"}]}`:

| id | MASCO major group | Median 2025 (RM) | Mean 2025 (RM) |
|---|---|---|---|
| `1` | Managers | 6,186 | 7,344 |
| `2` | Professionals | 6,124 | 6,747 |
| `3` | Technicians and associate professionals | 3,852 | 4,256 |
| `4` | Clerical support workers | 2,693 | 3,029 |
| `5` | Service and sales workers | 2,035 | 2,687 |
| `6` | Skilled agricultural, forestry, livestock and fishery workers | 1,992 | 2,658 |
| `7` | Craft and related trades workers | 2,173 | 2,619 |
| `8` | Plant and machine-operators and assemblers | 2,083 | 2,488 |
| `9` | Elementary occupations | 1,758 | 2,184 |
| `all` | All employees | 2,940 | 3,803 |

The report's text on page 29 says Professionals RM6,153, but its own Exhibit 4 and table A10 say RM6,124. Use the table and record this in DECISIONS.md.

Role → `masco_major` (my call, team to review): data entry clerk, administrative assistant, customer service representative → `4`; data analyst, AI and ML specialist, AI operations specialist, software developer, cybersecurity analyst, digital marketing specialist, UX / UI designer, sustainability and ESG analyst → `2`; renewable energy technician → `3`; care worker → `5`.

**Interfaces:**
- Produces: `Reference.salaries: dict`; each role row in `match()` gains `pay: {"group", "median_rm", "mean_rm", "year", "source", "table"}` and, when the person has a current role, `pay_change_rm: int | None` (= role median − current role median; `None` when both are in the same group, shown as "Same occupation group: DOSM has no finer figure").
- UI copy: "Clerical support workers median RM2,693 → Professionals median RM6,124: about +RM3,400 a month. Group medians for Malaysian citizens (DOSM 2025), not job offers." Round the change to the nearest RM100 in copy.

- [ ] **Step 1: Write failing tests:** integrity `test_every_role_maps_to_a_dosm_group` and `test_salaries_match_dosm_table_a10` (hard-coded expected medians above), `test_pay_change_for_clerk_to_analyst_is_3431`, `test_same_group_gives_no_pay_change`, extend `test_every_recommendation_carries_a_source` so every `pay` has `source` and `table`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `python -m pytest -q` → PASS; `npm run build` → succeeds.
- [ ] **Step 5: Commit** `git commit -m "Show the pay difference in ringgit from DOSM group medians"`

---

### Task 23: Final check

- [ ] `cd backend && python -m pytest -q` → all pass. `cd frontend && npm run build` → succeeds.
- [ ] Deploy to Replit with the Supabase secrets; start the app so migrations run; open the clerk, student, switcher, HR and class demos with no login; log in with Google from a second account; take the survey and one proof check; restart the deployment and confirm both are still there.
- [ ] Update `docs/REVIEW_LOG.md` with what was checked and what still needs team review (prerequisites, work context, survey cards, entry-level flags, MASCO mapping, BM / 中文), and ask a lecturer or counsellor to fill EVALUATION.md section 2 through the review kit.
- [ ] Run the demo path once end to end: X-ray on Aisyah's current role, drag the adoption slider to her tipping point, "What if I learn SQL?", pay jump on the data analyst page.
- [ ] Update `docs/REVIEW_LOG.md` with what was checked and what still needs team review (prerequisites, work context, survey cards, entry-level flags, BM / 中文), and ask a lecturer or counsellor to fill EVALUATION.md section 2 through the review kit.
