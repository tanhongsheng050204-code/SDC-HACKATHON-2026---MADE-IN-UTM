# Review log

One row per thing reviewed: generated code, data, or text. Write what was wrong and what changed.
"Found by" says who or what spotted it; "Confirmed by" is the teammate who checked the fix.

| # | Date | Item | Found by | Problem | Change | Confirmed by |
|---|---|---|---|---|---|---|
| 1 | 2026-10-19 | `matching.py` ranking | Demo run with the clerk persona (AI-assisted) | The clerk's own declining jobs (administrative assistant, data-entry clerk) ranked #1–#3 as "future roles" because skill fit outweighed outlook; they were also marked "robust pick" | Roles declining in the chosen scenario now rank last; robust pick excludes any role that declines in any scenario; test added | ______ |
| 2 | 2026-10-19 | `App.tsx` role detail | Code read-through (AI-assisted) | The outlook table overwrote the scenario name with the outlook label, so rows showed "growing" instead of "Slow" | Fields renamed (`name`, `outlook`) so they no longer collide | ______ |
| 3 | 2026-10-19 | Seed data | Planning review | Forecast figures are illustrative, not real | Flagged `illustrative: true` with a warning banner in the app; replacement is task 2.1 | ______ |
| 4 | 2026-10-19 | Plan vs official brief | Check against the Domain 1 brief (AI-assisted) | Only 12 of 42 skills had an SDG tag; the brief says every role **and skill** | All skills tagged with an SDG target; test added | ______ |
| 5 | 2026-10-19 | Plan vs official brief | Same check | Evaluation planned to use real CVs; the rules forbid real CVs | Changed to synthetic CVs | ______ |
| 6 | 2026-10-19 | Plan vs official brief | Same check | Trend layer was a hand-typed list; "hard-coded lists alone do not count" | Plan: arXiv + job-posting collectors + WEF/O\*NET baseline, dated snapshots (M2) | ______ |
| 7 | 2026-10-19 | Plan vs official brief | Same check | SDG interests were stored but unused (decorative); no estimate range; model not named; no fairness check | SDG boost with explanation, estimate range per role, model shown in footer, demographic fields rejected; tests added | ______ |
| 8 | 2026-10-19 | `deid.py`, `skills.py` | Automated security review | Names in a CV could reach the LLM when the caller did not supply them, although the UI promised names are removed | `scrub_cv()` also removes a "Name:" line and a first line made only of capitalised words; test added | ______ |
| 9 | 2026-10-19 | `intake.py` | Automated security review | Each chat turn re-ran full extraction (possibly an LLM call) over every earlier answer: cost grows with message count | Chat turns use dictionary matching only and at most one answer per question; test asserts no LLM call | ______ |
| 10 | 2026-10-19 | Research collector | Live run | arXiv returned 429 (rate limit) and later 500 | Automatic fallback to OpenAlex for the whole run; test added | ______ |
| 11 | 2026-10-19 | Signal builder | Reading the first live results | Raw year-on-year paper growth hit the +1 cap for 5 of 8 capabilities, because all research grows | Momentum now relative to the median capability (log2) | ______ |
| 12 | 2026-10-19 | Signal builder | Same | With relative momentum, a capability growing slower than average *raised* the outlook of roles it threatens (marketing +12.7) | Only acceleration counts in adjustments; signed value still displayed; test added | ______ |
| 13 | 2026-10-19 | Job collector | Same | Search matched prefixes and typos ("excel" counted "excellent") | Whole-word, exact matching; phrases quoted | ______ |
| 14 | 2026-10-19 | Skills Radar | Browser check | Tiny counts gave ±100% swings (Power BI 1 → 0) | Minimum 20 mentions before a job trend counts; otherwise "too few postings"; test added | ______ |
| 15 | 2026-10-19 | `api.py` refresh status | Automated security review | Anyone could read refresh progress, and errors could echo full source URLs | Status endpoint now needs the admin token; errors are stripped of URLs and cut to 200 characters; test added | ______ |
| 16 | | | | | | |
