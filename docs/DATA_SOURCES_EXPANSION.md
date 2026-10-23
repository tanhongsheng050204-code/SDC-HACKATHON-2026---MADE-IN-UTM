# More supporting data: what was added, and what it does to the system

**Date:** 23 October 2026 · **Scope:** `backend/app/trends/` · **Status:** built, tested, not yet published (a refresh still waits for a person's approval)

The brief was "the supporting data is too thin". This note first measures how thin, then records
what was added, the formula each new source feeds, the effect measured against today's live APIs,
and what was deliberately left out.

---

## 1. The audit: where the evidence was thin

| Part of the forecast | Before | Why it was thin |
| --- | --- | --- |
| Role outlook, published baseline | 23 roles from **WEF Future of Jobs 2025**, one global employer survey | Global, not Malaysian; one number per role, 2025→2030 |
| Skill demand | **Hacker News "Who is hiring?"**, 32 skills × 13 quarters | Tech jobs in the US and Europe; 19 of 51 skills had no term at all |
| Malaysian job ads (skills) | **freehire.me**, 42 of 51 skills, **one** dated count | A second count 28 days later was needed before any trend existed; 9 skills (the 10 roles added on 22 Oct) were never counted |
| Malaysian employment | **OpenDOSM `wages_occupation`**, 9 MASCO groups, **2 annual points** + 8-year series | One reading a year, and nine groups for 23 roles — a cashier and a hotel clerk share a group |
| Malaysian demand **per role** | none | Live postings were shown on the role page but never entered a forecast |
| AI momentum | arXiv/OpenAlex, 8 capabilities, global | No Malaysian slice |
| Pay | DOSM 2025 medians, **nominal ringgit** | A plan that runs to 2030 compared today's salary with tomorrow's prices |
| Prices | none | — |

So the Malaysian half of the story rested on **two annual points for nine coarse groups** and a
single job-ad count. That is the gap this change fills.

---

## 2. What was added

All three sources are public, keyless, official or open-source, and dated on every use. None of them
needs a new environment variable.

### 2.1 Monthly Malaysian labour force — `app/trends/labour.py`

- **Source:** OpenDOSM (DOSM) `lfs_month`, one request, monthly since 2010.
- **Fields read:** `lf_employed`, `u_rate`, `p_rate`, `lf_unemployment`.
- **History now available:** **200 monthly points** (2010-01 → 2026-08 at the time of writing)
  against **2 annual points** before. The snapshot keeps the last 36 months.
- **Feeds:** `market_points`, a market-wide adjustment on every role.
- **Freshness guard:** if the newest month is more than 120 days old, the block is still reported but
  scores **0** — a missing publication must never look like a collapse.

### 2.2 Live Malaysian postings **per role** — `mypostings.collect_roles()`

- **Source:** freehire.me, the same search the role page's "Open now in Malaysia" already uses
  (`data/role_openings.json`), so the number a person sees and the number the forecast reads are the
  same call.
- **Volume:** 23 role queries + 1 total, about 10 seconds on 4 workers.
- **Feeds:** `openings_points` per role, capped at ±8.
- **First run scores nothing on purpose:** it publishes 23 dated counts and reports "a trend needs a
  second count at least a month later". The points start from the second refresh **28+ days** later.

### 2.3 Prices — `app/trends/prices.py`

- **Source:** OpenDOSM `cpi_headline`, division `overall`, monthly since 1980 (561 months).
- **Feeds:** no score at all. It supplies `deflator` and `average_inflation_pct`, so the role page can
  show the DOSM median in horizon-year money: *"RM2,693 a month · about RM2,930 in 2030 money"*.
- **Rates are read month against the same month a year (and three years) earlier**, never from yearly
  averages: the newest year is only partly published, and averaging it understated inflation by about
  0.3 points in testing.

### 2.4 Coverage fix in the existing Malaysian source

`data/my_posting_terms.json` went from **42 to 51 skills** — the nine that had no term are exactly the
skills of the ten roles added on 22 October: electronic assembly, POS operations, crop harvesting,
crop care and spraying, CAD/BIM, bookkeeping, payroll, inventory, vocational pedagogy. Those skills
previously showed "no data" in the Malaysian source and could not move their roles.

---

## 3. How each one is scored

Added to `net_growth_pct` in `app/trends/builder.py`:

```
net_growth_pct = baseline
               + 15 × weighted skill trend            (±15)   [existing]
               + Malaysian employment, MASCO group    (±10)   [existing]
               + AI research momentum                 (±15)   [existing]
               + live Malaysian postings for the role  (±8)   [new, 2.2]
               + labour market                        (±3)   [new, 2.1]
```

**Labour market (2.1):**

```
points = clip( (employment growth y/y − its own five-year median)
               − 2 × (change in the unemployment rate over twelve months), ±3 )
```

It is **deliberately small and identical for every role**. A national figure says how the job market
is doing, not which job is doing better; letting it reorder roles would be inventing precision. It
moves the level of every outlook and leaves the ranking alone.

**Live postings (2.2):** the change in the role's **share** of all Malaysian postings, not the raw
count, so a bigger job market does not look like rising demand for everything. Needs ≥15 postings in
the two counts together, otherwise it reports "too few" and scores 0.

Every new number appears in the **forecast x-ray** as its own step with its source and cap, so the
promise that "each number can be rebuilt" still holds. Old snapshots without the new fields render
exactly as before (the steps are only added when the field exists).

---

## 4. Measured effect, against the live APIs today (23 Oct 2026)

### 4.1 Labour market

| Reading | Value |
| --- | --- |
| Latest month | 2026-08 (83 days old, not stale) |
| Employed | 16.87 million |
| Growth year on year | **+1.14%**, against a five-year median of **2.12%** |
| Unemployment rate | 2.9%, **−0.1 pp** on a year earlier |
| `market_points` | **−0.8** (raw −0.78, inside the ±3 cap) |

### 4.2 Prices

| Reading | Value |
| --- | --- |
| Latest month | 2026-09 |
| Inflation, year on year | 1.78% |
| Three-year average (used for the projection) | **1.70% a year** |
| Deflator, 2025 → 2030 | **1.0881** |
| Clerical median, 2025 | RM2,693 → **RM2,930 in 2030 money** |

### 4.3 Live postings per role (first count, so 0 points yet)

21,365 open Malaysian postings at the time of the call. Share of all postings, top of the list:

| Role | Postings | Share |
| --- | --- | --- |
| Customer service representative | 2,307 | 10.80% |
| Software developer | 1,400 | 6.55% |
| AI/ML engineer | 586 | 2.74% |
| AI operations specialist | 352 | 1.65% |
| Digital marketing specialist | 331 | 1.55% |
| Data analyst | 231 | 1.08% |
| UX designer | 153 | 0.72% |
| Renewable energy technician | 137 | 0.64% |

### 4.4 Effect on the outlooks

Building the same snapshot twice — once as the code stood yesterday, once with the new sources —
against the approved WEF baseline:

| Role | Before | After | Change |
| --- | --- | --- | --- |
| AI/ML engineer | +86.9 | +86.1 | −0.8 |
| AI operations specialist | +43.7 | +42.9 | −0.8 |
| Data entry clerk | −35.7 | −36.5 | −0.8 |
| Bank teller | −40.1 | −40.9 | −0.8 |
| …all 23 roles | — | — | **−0.8 each** |

**Today's ranking is unchanged** (the demo worker's top five stay AI operations specialist,
engineering technician, supply chain specialist, sustainability analyst, data analyst). That is the
correct result, not a disappointment: one market-wide number cannot justify reordering careers, and
the role-specific channel cannot score until it has a second count.

**Where the ranking will start to move:** from the second refresh, 28+ days after this one. A role
whose share of Malaysian postings rises 10% can gain up to 8 points, enough to cross another role;
the ±8 cap keeps one noisy month from dominating the ±15 skill channel.

---

## 5. What changes elsewhere in the system

| Area | Effect |
| --- | --- |
| **Refresh cost** | +2 OpenDOSM requests (about 1 s each) and +24 freehire requests (about 10 s). A refresh is still dominated by the arXiv history (~5 minutes). |
| **Snapshot size** | +36 monthly labour points and 8 yearly CPI points, about 3 KB. Existing snapshots are untouched. |
| **Approval flow** | Unchanged: a refresh saves a pending snapshot, nothing reaches users until a person approves it. The review panel now prints a "market-wide" line so a reviewer seeing 23 roles move by −0.8 at once knows why, instead of rejecting it as suspicious. |
| **X-ray** | Two new steps: *Malaysian labour market* (±3) and *Live postings for this role* (±8). The last line still equals the role card. |
| **Role page** | The pay tile reads *"a month · about RM2,930 in 2030 money"* once a snapshot with a price block is approved. Without one, it shows the old "per month" line. |
| **API** | `pay.real` is a new optional field; `signals[]` rows gain `market_points` / `openings_points`; the snapshot gains `labour_market` and `prices` blocks. All additive. |
| **Tests** | 12 new tests in `tests/test_sources_expansion.py`; `conftest.py` now keeps every test offline for the three new sources. Full suite green (about 420 tests). |
| **Offline mode** | Unchanged. Each new source fails soft: if OpenDOSM or freehire is down, the snapshot is built without that channel and the refresh log says so. |

---

## 6. Risks and honest limits

1. **The labour channel cannot differentiate roles.** Nine MASCO groups and one national series are
   all DOSM publishes at this frequency. Hence ±3 and no effect on ranking. If role-level
   differentiation is wanted, it must come from job ads (2.2) or a paid occupation-level source.
2. **Role-title searches also match descriptions.** "Data entry" in a description counts, so the
   number is "postings that mention the role", not vacancies. The app already words it that way.
3. **freehire places a few postings in the wrong country** and its coverage is mostly JobStreet. A
   share change is more robust than a raw count, which is why only the share is scored.
4. **The 2030 pay figure assumes 1.7% a year for five years.** The UI says "about", the block carries
   the assumption in `note`, and it never enters a score.
5. **Nine new Malaysian terms are unreviewed against live counts.** They are the right skills for the
   new roles, but the first refresh will show whether each phrase is too broad or too narrow; the
   file's own note asks the team to review terms.
6. **A stale labour month scores 0, not "unknown".** This is stated in the x-ray source line and in
   the snapshot, so a gap is visible rather than silent.

---

## 7. What was considered and not added

| Candidate | Why not |
| --- | --- |
| **OpenAlex Malaysia-affiliated research** | Added in the second round (section 9). |
| **Google Trends** | No official API; scraping breaks and cannot be cited as a dated public source. |
| **Adzuna / Jooble** | Need API keys, and Adzuna does not cover Malaysia. |
| **ILOSTAT occupation series** | Works keyless, but the Malaysia occupation series stops at 2014 — worse than what we have. |
| **World Bank indicators** | Reachable but slow (5–45 s per indicator), annual, and overlaps DOSM. Left out on purpose: the same story is already told monthly by the Labour Force Survey, and a slow source in a refresh that already takes five minutes is a cost without a new signal. |
| **IMF DataMapper** | Returns 403 to this client; no keyless access. |
| **More roles and skills** | That is static catalogue work, not a dynamic source; it also needs courses, translations and review. |

---

## 8. Rollout

1. Deploy, then **Admin → Refresh trend data**. The log now shows the three extra collectors; the
   review panel shows the market-wide line.
2. **Approve** the snapshot: every role moves by the labour-market points (today −0.8), the pay tile
   gains its 2030 figure, and the x-ray shows the two new steps.
3. **28+ days later**, refresh again: the role-posting channel scores for the first time. This is the
   refresh that can reorder roles.
4. Review the nine new Malaysian terms against their counts; tighten any phrase that is clearly too
   broad.
5. Optional: set `OPENALEX_API_KEY` and add the Malaysia-affiliated research slice.

Nothing in this change bypasses the rule that a person approves every new forecast.

---

## 9. Second round: five more sources (23 Oct 2026)

The first round fixed the Malaysian side. This round adds signals that do not come from job ads at
all, so a skill or a role is no longer measured by one family of evidence.

### 9.1 What was added

| # | Source | Cadence | What it measures | Where it feeds |
| --- | --- | --- | --- | --- |
| 1 | **Stack Overflow** (`api.stackexchange.com`) | daily, 12-month windows | questions asked with a skill's tag | developer attention → skill trend |
| 2 | **GitHub** (`api.github.com/search`) | daily, 12-month windows | repositories created with a skill's topic | developer attention → skill trend |
| 3 | **npm** (`api.npmjs.org`) | daily, 12-month windows | downloads of a skill's package(s) | developer attention → skill trend |
| 4 | **PyPI** (`pypistats.org`) | daily, 90-day windows | downloads of a skill's package(s) | developer attention → skill trend |
| 5 | **OpenAlex, Malaysian institutions only** | continuous, 6-month windows | papers from Malaysian institutions on each AI capability | `local_ai_points` per role |
| 6 | **OpenDOSM `employment_sector`** | annual since 2001 | share of Malaysian employment in agriculture / industry / services | `sector_points` per role |

All six are keyless. Every one is optional: if it fails, the snapshot is built without it and the
refresh log says which source was missing.

### 9.2 How each one scores

**Developer attention (sources 1–4).** Raw counts are useless here: Stack Overflow traffic falls
every year and package downloads rise every year. Each skill's growth is therefore compared with the
**median growth of the skills measured in the same source**, clipped to [-1, 1] — the same relative
trick as AI research momentum. Then:

```
skill trend += 0.15 × attention        (attention is the mean of the sources that measured it)
```

Three guards: a source needs ≥3 skills to have a median; a skill needs a minimum volume (50
questions, 20 repositories, 100k npm or 50k PyPI downloads); and attention **never creates a trend**
— it only nudges a trend that already exists from postings or research. A skill with no canonical tag
or package is absent from `data/skill_sources.json` on purpose.

**Malaysian AI research (source 5).** Same capability queries as the global series, but filtered to
`institutions.country_code:MY`. It answers a different question: not "is this capability advancing?"
but "is Malaysia working on it?". It feeds a role channel of its own:

```
local_ai_points = clip(5 × (mean local momentum of complementing capabilities
                          − mean local momentum of exposing capabilities), ±5)
```

Capabilities with fewer than **20 papers** across both windows are dropped: Malaysia's counts are
small (7 papers for document understanding last year), and a 7-vs-1 comparison is noise, not
momentum. The global series is not filtered this way because its counts are in the thousands.

**Sector shift (source 6).**

```
sector_points = clip(2 × the change in the role's sector's share over 5 years, ±4)
```

Only three sectors exist, so this separates three groups of roles, not twenty-three — hence ±4 and a
`data/role_sectors.json` mapping that the tests require to cover every role.

### 9.3 Measured today (23 Oct 2026, live APIs)

**Developer attention** — 17 skills measured, no source unavailable:

| Skill | Attention | Label | Readings |
| --- | --- | --- | --- |
| SEO | +0.84 | rising | Stack Overflow +0.84 |
| Cybersecurity fundamentals | +0.62 | rising | Stack Overflow +0.28, GitHub +0.97 |
| GenAI tools | +0.46 | rising | Stack Overflow +0.39, npm +1.00, PyPI 0.00 |
| API design | +0.28 | rising | Stack Overflow +0.67, npm +0.01, PyPI +0.15 |
| Git | +0.23 | rising | Stack Overflow +0.23 |
| Machine learning | +0.15 | rising | Stack Overflow +0.10, PyPI +0.19, GitHub +0.16 |
| Deep learning | −0.12 | steady | Stack Overflow +0.06, PyPI −0.18, GitHub −0.23 |
| Cloud computing | −0.24 | declining | Stack Overflow −0.21, npm −0.16, PyPI −0.35 |

**Sector shift** (2020 → 2025): services 63.6% → 65.0% (**+2.8 points** for service roles),
industry 26.5% → 26.1% (**−0.8**), agriculture 9.9% → 8.9% (**−2.0**).

**Malaysian AI research** (papers, recent vs prior window): conversational AI 169/79 (+0.18), code
generation 85/40 (+0.16), LLM agents 35/3 (+1.00, capped), AI security 95/60 (−0.26), generative
media 24/17 (−0.44), MLOps 14/8 (−0.18). Document understanding (7/1) and automated data analysis
(2/3) were dropped by the 20-paper guard.

### 9.4 Effect on the outlooks

Same snapshot, built with and without the second-round sources:

| Role | Round 1 | Round 2 | Change | of which sector / Malaysian research |
| --- | --- | --- | --- | --- |
| Farm worker | +13.7 | +11.7 | −2.0 | −2.0 / 0.0 |
| Production operator | −5.2 | −6.0 | −0.8 | −0.8 / 0.0 |
| Renewable energy technician | +32.2 | +31.4 | −0.8 | −0.8 / 0.0 |
| Data entry clerk | −36.5 | −33.7 | +2.8 | +2.8 / 0.0 |
| Customer service representative | −5.8 | −3.7 | +2.1 | +2.8 / −0.9 |
| Software developer | +57.6 | +59.4 | +1.8 | +2.8 / −0.8 |
| Engineering technician | +34.5 | +38.7 | +4.2 | −0.8 / **+5.0** |
| AI/ML engineer | +86.1 | +90.5 | +4.4 | +2.8 / +1.9 |
| Supply chain specialist | +18.6 | +23.9 | +5.3 | +2.8 / +2.5 |
| TVET instructor | +16.3 | +21.9 | +5.6 | +2.8 / +2.5 |

Skill trends moved by up to **0.10** (cloud computing −0.13 → −0.24, cybersecurity +0.18 → +0.27,
GenAI tools +0.23 → +0.29). The demo worker's top five stay the same today, but the gaps between
them narrow or widen: engineering technician moves up 4.2 points in total, of which **+5.0 comes
from Malaysian institutions publishing on LLM agents** — a capability that role works alongside —
partly cancelled by its −0.8 sector shift.

### 9.5 What it costs

| | |
| --- | --- |
| Requests per refresh | ~101: Stack Overflow 46, GitHub 16, npm 8, PyPI 14, OpenAlex 16, OpenDOSM 1 |
| Time these six add | **92 s measured** — developer attention 81 s (GitHub's 10-requests-a-minute limit is 6.5 s spacing) + Malaysian research 10 s + sector under 1 s |
| Time a full refresh takes | **10 min 45 s measured** (16:56:46 → 17:07:31). The rest is the pre-existing job-posting history pass (2 min 26 s) and the AI research history pass (5 min 36 s, arXiv asks for 3.1 s between calls). Do not schedule this as a two-minute job. |
| Snapshot size | +about 20 KB (attention counts, Malaysian research counts, 10 years of sector shares) |
| Keys | none |

### 9.6 Risks and limits

1. **GitHub search is rate limited without a token.** A 403 drops the whole GitHub reading for that
   refresh (never half of it); the other three sources still count and the refresh log says so.
2. **OpenAlex without a key shares a small daily budget.** A 429 drops the Malaysian slice; the
   global series is unaffected.
3. **Downloads and questions measure developers, not jobs.** That is why attention is weighted at
   0.15 and cannot create a trend on its own.
4. **A tag can double count** a question carrying two tags of the same skill, and a package can be
   pulled by CI rather than people. Both are noted in `attention.py`.
5. **Malaysian research counts are small.** The 20-paper guard removes the worst of it, but a
   35-vs-3 quarter still hits the cap; treat `local_ai_points` as a hint, not a measurement.
6. **Three sectors is coarse.** The sector channel says "services is absorbing employment", not
   "this occupation is growing".

### 9.7 Verified end to end against the live APIs (23 Oct 2026)

A full `scripts/refresh_trends.py` run with no `--approve-as`, so nothing was published. Every source
answered: `attention.unavailable` was empty, all 19 skills had at least one source, 8 Malaysian
capabilities were measured (2 dropped by the 20-paper guard), 10 years of sector shares arrived, and
the snapshot `2026-10-23-trend-165646` went to the review queue.

**Live per-role demand, first real measurement.** 21,365 Malaysian postings, 22 of 23 roles named at
least once:

| Role | Postings | Share | | Role | Postings | Share |
| --- | --- | --- | --- | --- | --- | --- |
| Customer service rep | 2,307 | 10.80% | | Cashier | 85 | 0.40% |
| Software developer | 1,400 | 6.55% | | Admin assistant | 77 | 0.36% |
| AI/ML engineer | 586 | 2.74% | | Cybersecurity analyst | 69 | 0.32% |
| AI operations specialist | 352 | 1.65% | | Production operator | 46 | 0.22% |
| Digital marketing specialist | 331 | 1.55% | | Engineering technician | 11 | 0.05% |
| Data analyst | 231 | 1.08% | | TVET instructor | 1 | 0.00% |
| UX designer | 153 | 0.72% | | **Farm worker** | **0** | **0.00%** |

Farm worker is the honest hole: freehire.me is a technology-leaning board, so it never names that
role, and the openings channel can never score it. Its outlook therefore rests on the WEF baseline,
the sector shift and the labour market alone. The channel correctly contributed 0.0 points on the
first count (no prior to compare against), so no false signal was created.

**The x-ray still adds up.** With eight channels the chain is long, so the invariant was checked
against the pending snapshot for all 23 roles: the last line of every x-ray equals the role card,
0 mismatches. Engineering drafting and BIM, the largest mover:

| Step | Points | Running | Cap |
| --- | --- | --- | --- |
| Published baseline, 2025 to 2030 | +20.8 | +20.8 | — |
| Job-posting demand | −0.2 | +20.6 | ±15 |
| Malaysian employment | −0.6 | +20.0 | ±10 |
| Malaysian sector shift | −0.8 | +19.2 | ±4 |
| Malaysian labour market | −0.8 | +18.4 | ±3 |
| Live postings for this role | 0.0 | +18.4 | ±8 |
| Malaysian AI research | +5.0 | +23.4 | ±5 |
| AI research momentum | +15.0 | **+38.4** | ±15 |
| AI adoption 1× (Baseline) | 0.0 | +38.4 | — |
| Scaled to 2030 | 0.0 | +38.4 | — |

The first line used to read "… adjusted by A and B and C and D and E and F and G and H and I", which
named freehire.me twice and was unreadable with nine sources. It is now a proper list
(`builder._adjusted_by`), deduplicated and tested.

**Attribution: the new sources are not what moves the forecast.** The currently published snapshot
(`2026-10-22-wef-foj-2025`) is a bare WEF import — each role carries only `role_id` and
`net_growth_pct`, with no capability momentum and no channels at all. Approving the pending snapshot
would therefore be the **first time AI momentum reaches users**, and that is where the large numbers
come from:

| Contribution | Mean absolute | Largest |
| --- | --- | --- |
| New channels (sector, Malaysian research) | 2.69 points | +5.3 |
| Pre-existing channels (AI momentum, demand, Malaysian postings, labour market) | 5.16 points | +13.4 |

So the +17.6 on engineering drafting and BIM is 4.2 points of new evidence and 13.4 points of AI
momentum arriving for the first time — not drift, and not the six sources added here. Two roles change
label if approved (TVET instructor stable → growing, +8.5 → +22.3; UX/UI designer growing → emerging,
+47.8 → +50.7), and 19 skills still have no data.
