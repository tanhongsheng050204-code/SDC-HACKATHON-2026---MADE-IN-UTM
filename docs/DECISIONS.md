# Decisions

> Decisions made by the team during planning on 19 Oct 2026. Add the reason in your own words where it says ______.

| # | Decision | Alternatives considered | Reason |
|---|---|---|---|
| 1 | Serve three groups: workers at risk (hero), students, organisations (who pay) | One group only | ______ |
| 2 | Three demo highlights: job broken into tasks, year slider through 2035, AI coach | Live job data; coach only | ______ |
| 3 | Task labels come from O\*NET, drafted by AI, every label reviewed by the team | Live AI labels per user; hand-written tasks | Same answer every time, has a source, checkable |
| 4 | Year slider 2026–2035 plus the three scenario presets | Adoption slider only; three buttons only | ______ |
| 5 | Coach can propose changes, but only the user applies them | Chat only; coach acts directly | ______ |
| 6 | Trend watcher proposes signal changes; an admin approves | Manual updates only; fully automatic | Meets "continuously tracks" while keeping a person in control |
| 7 | Organisations get an HR workforce view from an anonymous CSV | Cohort view; policy map; slide only | ______ |
| 8 | Malaysia-first: RM, HRD Corp, MYFutureJobs; English + BM + 中文 interface | Global; add Tamil | ______ |
| 9 | Green, calm visual design with cards and a side drawer | — | ______ |
| 10 | Declining roles rank below growing ones, whatever the fit | Rank by score only | A close fit to a shrinking job should not be the top "future" recommendation (found in review, see REVIEW_LOG #1) |
| 11 | Ranking = 60% skill fit + 40% outlook | Other weights | ______ (tune after the human evaluation) |
| 12 | Build the trend layer first (arXiv + job postings + WEF/O\*NET) | Visual design first | The rubric names "the trend signal layer feeding role matching" as the feature to show live |
| 13 | A person's chosen SDGs add a small boost (+0.05) to roles that serve them | SDG tags as labels only | The brief asks for SDG links that are "meaningful rather than decorative" |
| 14 | No age, gender or background inputs; the API rejects them | Collect them for analytics | Fairness checks (brief, good-to-have) |
| 15 | AI coach moved to a lower priority | Coach as a headline feature | The rubric wants more than "upload a CV and ask a chatbot for jobs" |
| 16 | Synthetic CVs only for testing | Friends' real CVs | The rules forbid real CVs |
| 17 | Research signal from arXiv with OpenAlex fallback | arXiv only | arXiv returned 429 and 500 errors during development |
| 18 | Capability momentum measured relative to the median capability, and only acceleration counts | Raw year-on-year growth | All research grows every year; raw growth saturated the cap for 5 of 8 capabilities. Overall speed is what the scenarios model. Team to confirm (______) |
| 19 | A skill needs ≥ 20 job-posting mentions before its trend counts | Use every count | 0 → 1 mentions produced ±100% swings |
| 20 | Refreshes write new snapshots and never edit the baseline | Update in place | History shows how forecasts changed; refreshes never compound |
