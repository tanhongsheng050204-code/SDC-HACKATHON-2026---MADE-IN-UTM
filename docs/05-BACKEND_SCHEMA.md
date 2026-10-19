# 5. Backend Schema

> Status: AI-assisted draft. Reviewed by ______ on ______.

Two kinds of data: **reference data** (versioned JSON in `backend/data/`, read-only at runtime) and
**user data** (SQLite). Every reference record carries provenance: a source, a date, and who on the
team checked it.

## Reference data

| File | One record is | Key fields | Status |
|---|---|---|---|
| `skills.json` | A skill in our standard list | `id`, `name`, `category`, `aliases[]` (unique across skills) | ✅ |
| `roles.json` | A job role | `id`, `title`, `family`, `summary`, `skills[{skill_id, weight 1–3}]`, `onet_code?`, `esco_code?` | ✅ (codes ⬜) |
| `tasks.json` | Tasks for a role from O\*NET | `role_id`, `tasks[{id, text, label: automate/assist/human, reason, source, reviewed_by}]` | ⬜ |
| `signals/<date>-<slug>.json` | One dated snapshot built from the sources below | `snapshot_id`, `source`, `source_url`, `published`, `imported`, `horizon_year`, `illustrative`, `reviewed_by`, `kind` ("trend-adjusted"), `baseline_snapshot_id`, `inputs[{source, url, retrieved, windows/threads}]`, `capability_momentum{}`, `signals[{role_id, net_growth_pct −100…300, automation_exposure 0–1, ai_complementarity 0–1, note}]`, `skill_signals[{skill_id, trend −1…1 or null, label rising/steady/declining/no_data, sources[]}]` | ✅ |
| `raw/research/<date>.json`, `raw/jobs/<date>.json` | Raw counts from one collector run (evidence) | research: `source`, `windows`, `queries`, `counts{cap: {recent, prior}}` · jobs: `threads`, `terms`, `postings`, `mentions{skill: {recent, prior}}` | ✅ |
| `capabilities.json` | An AI capability tracked in research | `id`, `name`, `query`, `exposes_roles`, `complements_roles`, `automates_skills`, `boosts_skills` | ✅ (review ⬜) |
| `job_terms.json` | The job-posting search term for a skill | `{skill_id: term}` | ✅ (review ⬜) |
| `scenarios.json` | An AI-adoption scenario | `id` slow/baseline/accelerated, `label`, `description`, `adoption` 0.5/1.0/1.6 | ✅ |
| `courses.json` | A course or project | `id`, `title`, `provider`, `url`, `skills[]`, `level`, `hours`, `cost` free/paid/free_audit, `cost_rm`, `hrd_corp_claimable`, `checked`, `reviewed_by` | ✅ (RM, HRD Corp, reviewer ⬜) |
| `salaries.json` | Monthly salary range for a role in Malaysia | `role_id`, `p25_rm`, `median_rm`, `p75_rm`, `source`, `year`, `reviewed_by` | ⬜ |
| `sdgs.json` | One of the 17 UN goals | `number`, `name`, `colour` | ✅ |
| `sdg_map.json` | Role or skill → SDG | `{roles: {id: [{sdg, target?, reason}]}, skills: {...}}` | ✅ (targets ⬜) |
| `demo_profiles.json` | A demo persona | `display_name`, `story`, `current_role_id`, `skills`, `interests` | ✅ |

Snapshots are **immutable**: a change creates a new file, and the newest `imported` date wins.

## User data (SQLite)

| Table | Columns | Notes |
|---|---|---|
| `profiles` | `id` UUID PK, `display_name?` ≤ 60, `current_role_id?`, `skills` JSON, `interests` JSON (SDG numbers, used in ranking), `experience_years?` 0–60, `tasks_done` JSON ⬜, `created_at`, `updated_at` (indexed). **No age, gender, ethnicity or background fields; unknown fields are rejected** | ✅ |
| `progress` ⬜ | `profile_id` FK cascade, `role_id`, `course_id`, `done_at` | Readiness meter |
| `watcher_proposals` ⬜ | `id`, `created_at`, `source_title`, `source_url`, `role_id`, `field`, `old_value`, `new_value`, `reason`, `status` pending/approved/rejected, `decided_by?`, `decided_at?` | Approving writes a new snapshot |
| `cards` ⬜ | `id` short random, `profile_id` FK cascade, `role_id`, `created_at` | Future Card read-only link |
| `schema_version` | `version` | Numbered migrations in `app/store.py` |

## Relationships

Role ⟷ Skill (weighted) · Role 1→many Task · Course ⟷ Skill · Snapshot 1→many RoleSignal → Role ·
Role/Skill ⟷ SDG · Profile → Role (current, optional) · Profile 1→many Progress, Card ·
Proposal → Role. `tests/test_data_integrity.py` checks every reference.

## Access rules

| Data | Read | Create / change |
|---|---|---|
| Reference data | Anyone | Git, or an approved watcher proposal (signals only) |
| Profile, progress, card | Holder of the profile UUID (card link: read-only, no name) | Holder |
| Watcher proposals | Admin token | Watcher creates; admin approves or rejects |
| HR CSV | Never stored | Processed in memory per request |

## Validation

Skill/role IDs must exist (422 otherwise) · profile fields outside the schema rejected (fairness) · 1–60 skills per profile · display name without email or
phone patterns · CV text 50–20 000 chars, never stored · HR CSV: `role`, `skills` columns, ≤ 5 000 rows,
rejected if it has a name, email or IC column · snapshot `imported` must be newer than the latest.

## Retention

Raw CV: never stored · profiles: 30 days after last update (`scripts/cleanup.py`) or on delete ·
snapshots and proposals: kept forever (they are the evidence) · HR CSV: not kept.

## Seed and change process

Seed data is **illustrative** and flagged so in the UI; it must be replaced before judging, because the rules forbid invented statistics. Demo personas and test CVs are **synthetic** (the rules forbid real CVs). `scripts/build_snapshot.py` turns a CSV of
real figures into a new snapshot. Each data change goes through a pull request that a teammate
reviews, and the reviewer's name goes into `reviewed_by`.
