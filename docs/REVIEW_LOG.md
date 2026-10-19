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
| 8 | | | | | | |
