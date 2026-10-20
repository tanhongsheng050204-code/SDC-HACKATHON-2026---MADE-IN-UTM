# Laluan v2: new features design

Date: 2026-10-20 · Preliminary submission deadline: 25 October 2026

Items marked **(builder's call)** or **(my call)** were not decided by the team; everything else was.

## Why

Laluan already shows people how AI could change their work and gives them a cited reskilling plan. The team wants it to go further in three directions:

1. **Know the person better** than a skill list does: what kind of work they enjoy, found through a short survey.
2. **Make progress real and provable**: a skill tree where each level is earned by answering questions, not by ticking a box.
3. **Be a product people can come back to**: accounts with verified email, data that survives restarts, and stronger protection of personal data sent to AI.

Plus forward-looking content (emerging roles, cited skill evidence, "a day in this job", voice input) once the core is in.

## Priority and phases

The team chose: **skill tree, survey and login first.**

| Phase | Target | Contents |
|---|---|---|
| 1 | Working by 25 Oct | Login + Supabase database, hosting on Replit, skill tree with proof checks, personalised survey, SDG choice removed, privacy step "send less", serving the four groups (section 11) |
| 2 | After Phase 1 | RunPod: Whisper voice input and open-model CV reading; wider scrubber; "what gets sent" preview |
| 3 | After Phase 2 | Cited skill evidence via web search, emerging roles, "a day in this job", SDG reasons for every role/skill/emerging role |

If Phase 1 runs late, the order inside it is: login + database, then skill tree, then survey, then the four-group work (section 11).

## Goals

- A logged-in user's skills, survey answers and skill-tree progress persist across devices and server restarts.
- Every skill level shown as proven was earned through a passed proof check.
- The survey discovers preferences the user didn't state, and those preferences visibly affect results.
- No raw CV text or voice audio reaches Google once Phase 2 is done.
- The existing demo links (`?demo=clerk`, `?demo=student`, `?demo=hr`) keep working without login.
- The app demonstrably works for each of the brief's four groups: working adults at risk, fresh graduates and career switchers, HR and L&D managers, TVET and university career centres. "Demonstrably" means behaviour that differs per group, an automated test per group that fails the build if that group stops being served, and a person's evaluation per group.

## Non-goals

- No change to "My job, task by task" (#11): it already shows which tasks AI is likely to automate.
- No user choice of SDGs (#3). SDG links are the system's explanation, not a user preference.
- No full move to a self-hosted LLM. Gemini stays the main model; RunPod covers only voice and CV reading.
- No live web search results feeding scores.

## Anti-goals (failure even if it works)

- A ranking that silently changes because an unchecked AI answer said so.
- Proof checks whose answers can be read from the browser before submitting.
- Judges hitting a login wall or a 60-second cold start during the demo.
- Personal data in places it doesn't need to be (logs, URLs, the LLM provider).

---

## 1. Login and database (Phase 1)

**Decided:** Supabase for login and database. Login with Google (OAuth) instead of email + password: the team has no domain to send verification emails from, and Supabase's built-in sender only reaches the project's own team. Google has already verified the email, which meets the intent of "verified email".

- **Auth:** Supabase Auth with the Google provider only. Frontend uses `@supabase/supabase-js` (`signInWithOAuth({ provider: 'google' })`, logout). No passwords, so no reset flow and no app-sent email.
- **Google setup (team task):** a Google Cloud OAuth client (web) with scopes `openid`, `email`, `profile` only; Supabase's callback URL as the authorised redirect; the Replit address in Supabase's allowed redirect URLs. The OAuth consent screen must be **published to production**: in "Testing" mode only listed test users can sign in. These basic scopes don't need Google's verification review.
- **Backend:** FastAPI verifies the Supabase access token (JWT) on each request that touches an owned profile. Admin routes keep the existing `ADMIN_TOKEN`.
- **Ownership:** a `profiles.user_id` column links a profile to a Supabase user. **(My call)** `user_id` is the Supabase user id (a UUID from the token's `sub`), not the email: it never changes if the Google email does, and it keeps the email out of app tables. One profile per user **(my call)**. Owned profiles are only readable/writable with that user's token; today's "anyone with the UUID" access stays only for demo profiles and Future Cards (cards are already read-only and minimal).
- **Anonymous use (my call):** a visitor can still try the app without an account; their profile lives as today. They can take the survey and proof checks; results are stored on their anonymous profile like everything else and expire with it. The UI invites them to log in to keep their progress at that point, not at the door.
- **Demo links:** create demo profiles as today, no login, no `user_id`. Demo profiles come with preset survey answers and preferences so the preference line in Why this rank? shows for judges; Wei Jie's story is rewritten around his preferences instead of the removed SDG boost (his SDG links still show on the impact screen) **(my call)**.
- **Database:** Supabase Postgres in production replaces SQLite on Render (whose disk is wiped on every restart). Tables: existing `profiles`, `cards`, plus new tables in sections 3 and 4.
- **Trend snapshots and admin review (my call):** these are JSON files written at runtime today (`backend/data/signals`, pending/approved/rejected folders in `trends/review.py`). Replit Deployments lose runtime file writes on redeploy, so imported/pending snapshots and every approval/rejection record move into the database in Phase 1. The committed seed snapshots stay as files and are the starting point.
- **Retention (my call):** the 30-day purge (`store.purge_older_than`, `scripts/cleanup.py`) applies only to anonymous and demo profiles. A profile owned by an account is kept until the user deletes it or their account. Update the privacy wording to say both.
- **Login with an existing anonymous profile (my call):** if the account has no profile yet, attach the browser's. If the account already has one and the browser holds a different one, ask: "Keep your saved profile" (default) or "Replace it with this one". Never merge, never drop data silently.
- **Constraint:** tests must still run offline with no Supabase. How the store supports both SQLite (tests, local) and Postgres (production) is the **builder's call**; keep the current hand-written migrations style unless that becomes painful.
- **Privacy:** don't store the CV file or text (as today). Email lives only in Supabase Auth, not copied into app tables. Deleting a profile still cascades.

## 2. Hosting (Phase 1)

**Decided:** both frontend and backend on Replit. No Vercel, no Render.

- **(My call)** One Replit Deployment: FastAPI serves the built frontend (`frontend/dist`) as static files plus `/api`. One address, no CORS setup. Use an always-on Deployment (Autoscale or Reserved VM), not a sleeping Repl; the "waking up the server" notice can stay as a safety net.
- Secrets in Replit: `GEMINI_API_KEY` (paid tier for the demo), `ADMIN_TOKEN`, Supabase URL / anon key / JWT secret (or JWKS URL), database URL, later RunPod keys.
- Remove `render.yaml` and Vercel references; update README links and run instructions. Keep `docker-compose.yml` working for local runs **(builder's call)** whether to keep it.

## 3. Skill tree with proof checks (Phase 1)

**Decided:** classic tree layout (mockup A). Each skill is a node with a ring progress bar; levels are proven by answering Gemini-generated questions on the spot; three questions, two correct to pass; on failure, retry the next day with new questions plus a link to the matching course.

**What the user sees**
- A tree for the chosen target role. Roots at the bottom are the user's confirmed skills; the target role sits at the top; branches unlock upward.
- Each node: skill name, ring with three marks (Basic, Working, Advanced), current level text. Locked nodes are greyed out.
- Tap a node → proof check panel for the next unproven level: 3 multiple-choice questions, one at a time, then a result. Pass → ring fills to that mark. Fail → "try again tomorrow" + link to the course from the pathway that teaches this skill.
- Replaces the course tick-off as the main way to record progress. Finished courses stay visible in the pathway list **(my call)**.

**Structure**
- **(My call)** Tree order comes from a new fixed file `backend/data/skill_prereqs.json` (`skill_id → [prerequisite skill_ids]`), written by the team, AI-drafted and reviewed like the task labels. A node is unlocked when every prerequisite is at least Basic (or is a confirmed skill). The tree for a role = the role's skills plus their prerequisites; nodes with no prerequisites sit at the bottom.
- **Data integrity test:** no cycles, every id exists in `skills.json`.

**How it feeds the rest (my call)**
- Confirmed skills from the CV/picker count toward fit as today (rings start empty until proven; label "from your CV").
- A missing skill counts as "have" for fit once it reaches **Basic**. Working/Advanced don't change fit in Phase 1; they show on the ring and the Future Card.
- Finished courses still count, as today, so nothing existing breaks.

**Proof check backend**
- `POST /profiles/{id}/skills/{skill_id}/check` → generates 3 questions for (skill, level) with Gemini, stores questions **and the answer key server-side**, returns questions without answers and an attempt id.
- `POST /checks/{attempt_id}/answers` → grades server-side, records the result, returns pass/fail and explanations.
- One attempt per skill-level per profile per day, enforced server-side. **(My call)** Demo profiles have no daily limit, so a judge who fails can retry at once.
- Prompt sends only skill name, level and level description: no profile data.
- Questions must be checked against the skill (grounding step like `grounding.py`): drop malformed questions (not exactly one correct option, wrong count). If Gemini fails or there's no key: the check says "proof checks are unavailable right now"; nothing else breaks.
- Level descriptions (what Basic / Working / Advanced mean) are generic in Phase 1 **(my call)**, one shared definition per level, so we don't hand-write 3 × every skill.
- Tables: `skill_progress(profile_id, skill_id, level, proven_at)` and `skill_checks(id, profile_id, skill_id, level, questions_json, answers_json, created_at, submitted_at, passed)`.

## 4. Personalised survey (Phase 1)

**Decided:** after CV upload or skill picking, a series of questions about working environment and task details, built from the roles that match the user's skills. User answers Like / Dislike / Other (own words). From the answers, discover hidden preferences. Preferences become one small factor visible in **Why this rank?** (e.g. "+ fits your preference for working with people"), and roles they surface are shown separately as "you might also like".

**Flow**
- Offered right after skills are confirmed; skippable; can be retaken from the profile.
- About 8–10 cards **(my call)**, each a concrete statement about a real task or setting, e.g. "You spend most of the day checking numbers on your own."

**Where cards come from (my call)**
- A new per-role **work context** in `roles.json`: a handful of fixed dimensions, each scored per role, e.g. people ↔ data, structured ↔ open-ended, desk ↔ field/site, fixed hours ↔ shifts, solo ↔ team. The final dimension list is the **builder's call**, kept to 5–6.
- A fixed **card bank** `backend/data/survey_cards.json`: each card has a stable id, the role(s) it comes from, the statement, and the dimension(s) and direction it reveals. Drafted by AI from the O\*NET tasks and work context, reviewed by the team (same process as task labels). Statements go through the i18n setup so BM / 中文 can be checked in the review kit.
- At survey time, pick ~8–10 cards from the bank for the user's top ~8 matched roles, so every dimension gets at least one card and the cards differ between matched roles.

**Discovering preferences**
- Deterministic, no LLM needed: Like/Dislike moves the user's score on that card's dimensions. Result: a short profile like "prefers working with people, structured days".
- "Other" free text: Gemini (or the offline dictionary) maps it to a dimension direction if it can, scrubbed before sending. **(My call)** The user confirms the reading ("We read this as: prefers working in a team. Right?") before it counts; otherwise it's kept as a note and doesn't affect the score.
- Show the result as 2–3 plain sentences with "based on your answers to…".

**Ranking**
- Replace `SDG_BOOST` with `PREFERENCE_BOOST` up to 0.05 **(my call: same size as the SDG boost it replaces)**, scaled by how well the role's work context matches the preferences. Shown as its own line in Why this rank?.
- "You might also like": up to 3 roles outside the user's top 5 with the strongest preference match and fit above a floor (builder sets the floor).
- Stored in `survey_responses(profile_id, card_id, answer, note, created_at)` and a `preferences` JSON on the profile.

## 5. SDG (Phase 1 part, Phase 3 part)

- **Phase 1:** remove the SDG picker and `interests` from the ranking. SDG impact screen stays.
- **Phase 3:** every role, emerging role and proven skill shows a short written reason for how it links to the SDGs (extends `sdg_map.json`; reasons team-reviewed). A newly proven skill shows its SDG link in the pass result.

## 6. Privacy (Phase 1 part, Phase 2 rest)

Gemini stays the model. Protection in layers:

1. **Send less (Phase 1):** raw CV text goes to a model once, for extraction. Every later call (pathway summary, coach, survey "Other", proof checks) sends only skill ids/names, role, and the user's question, scrubbed. Audit every `generate_json` call site.
2. **Wider scrubber (Phase 2):** add addresses, dates of birth and organisation names, using a local named-entity library (Presidio or spaCy: **builder's call**) running on the backend, before any text leaves.
3. **"What gets sent" preview (Phase 2):** before CV extraction, show the scrubbed text and let the user confirm.
4. **Paid-tier Gemini key** for the live demo; the privacy note says so.
5. **No logging** of CV text, audio, transcripts or survey free text.

## 7. RunPod: voice and CV reading (Phase 2)

**Decided:** spend the US$25 RunPod credit on voice input and CV reading.

- **Voice (#10):** a mic button on skill entry, survey "Other" answers and the coach. Audio goes to a RunPod Serverless endpoint running Whisper (faster-whisper); text comes back and goes through the scrubber. Fallback: the browser's Web Speech API, then typing. Audio is never stored. Languages: English, Malay, Chinese.
- **CV reading:** a RunPod Serverless endpoint running an open 7–8B instruct model (Qwen or Llama, **builder's call**, e.g. via vLLM) does the CV → skills extraction. Gemini then only ever sees confirmed skills. Fallback order: RunPod → Gemini with scrubber → offline dictionary.
- Both behind the existing "one client, timeout-bounded, offline fallback" pattern in `llm.py`. Short timeouts so a cold start (10–60 s) triggers the fallback instead of a stall; optionally warm the endpoints before a demo.
- Budget: keep min workers at 0; watch usage in the RunPod dashboard.

## 8. Cited skill evidence via web search (Phase 3)

**Decided:** every skill found links to the postings/articles it came from; skill is "confirmed" when at least two separate sources agree, else "single source". Batch refresh with person approval for catalogue roles; live search only for display.

- Uses Gemini with Google Search grounding, which returns source URLs.
- **Batch:** run per catalogue role through the existing refresh pipeline; results go to **Admin review** with a before/after view; only approved evidence affects role skills and rankings. Reason (decision #6): new data changes everyone's rankings, so a person checks it first, and the approval log is evidence for judges.
- **Live:** "Search the web for this role" on emerging-role cards shows cited findings labelled "not yet reviewed"; never feeds scores.

## 9. Emerging roles (Phase 3, covers #2 and #9)

- A panel clearly labelled as a prediction. Each card: the new role, the research/AI trend behind it (with source and date from the existing research signals), and a real role today that is the closest stepping stone, linking to its pathway.
- Generated from trend signals in batch and approved through Admin review like other trend data **(my call)**.

## 10. "A day in this job" (Phase 3, #5)

- Each role page gets a short description of the work setting, typical tasks and who you work with, built from the same O\*NET tasks and work context the survey uses, plus the role's SDG reason. Generated once per role, reviewed, stored in data, not live.

---

## Left to the builder

- How the store handles SQLite in tests and Postgres in production.
- JWT verification method (secret vs JWKS).
- Exact work-context dimensions (5–6) and preference-match formula.
- Floor for "you might also like".
- NER library, Whisper and open-model choice, serving stack on RunPod.
- Screen placement of the skill tree and survey within the current navigation; translations for new strings in EN/BM/中文 (use the existing i18n setup; BM/中文 can go through the review kit).
- Whether to keep `docker-compose.yml`.

---

## 11. Serving the four groups (Phase 1)

**Decided:** add to Phase 1, so the system works for each group the brief names, not just as a generic suggestion engine. Before this, working adults and HR were served; graduates and switchers were treated exactly like workers; career centres had only the Future Card.

**11.1 "Which describes you?" at the start.** One question before skills: *I'm working* (worker), *I'm studying or just graduated* (graduate), *I'm changing careers* (switcher). Stored on the profile as `audience`; changeable from My profile. It is a self-description of the person's situation, not a demographic, so it fits the fairness rule. It changes behaviour:
- **Worker:** current role required; Today leads with the current role's outlook and task-level risk; pathway shows HRD Corp-claimable courses first **(my call)**.
- **Graduate:** no current role needed. Roles marked `entry_level` in `roles.json` get a visible `+ open to new graduates` boost of 0.05 **(my call: same size as the other boosts)**; Today leads with "roles you can start in".
- **Switcher:** current role required. The current role is moved out of the ranked list into its own "where you are now" card, so it never takes a top-5 or robust-pick slot. Each role shows **carry-over skills**: skills the person already has that the new role needs, named "from your work as <current role>".
- `entry_level` is a team-reviewed flag on each role **(my call:** clerk, admin assistant, customer service, data analyst, digital marketing, renewable energy technician, care worker**)**.

**11.2 Class view for career centres.** A second tab in the Workforce screen, "Class (career centre)". Input: an anonymous CSV with a `skills` column (optional `programme`). Output, totals only:
- how many students fit each role best (top-1 counts), with outlook;
- the most common missing skills across the class's top roles;
- the courses that close a gap for the most students, with hours;
- SDG contribution of the class's top roles.
Same privacy rules as the HR view: identifying columns rejected; never a list of students. **(My call)** Any count under 3 shows as "fewer than 3". A synthetic 40-student sample class and a `?demo=class` link.

**11.3 A guarantee test per group.** `backend/tests/test_audiences.py`, one synthetic persona per group, each asserting the outcome that group needs (worker: current-role risk visible and a non-declining reachable role in the top 5 with a pathway; graduate: at least one entry-level role in the top 5; switcher: current role not in top 5 and the top role shows at least 2 carry-over skills; HR: output has no per-person rows; career centre: totals only, small counts suppressed, top gaps have courses). These run in CI, so a change that breaks a group breaks the build.

**11.4 A person's evaluation per group.** A third demo persona for switchers (synthetic). EVALUATION.md section 2 and the review kit's pathway tab cover all three individual personas plus the HR sample and the class sample, so a lecturer or counsellor signs off each group.

**Later (Phase 2):** progress over time for HR and career centres, as totals of proven skills.
