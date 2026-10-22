# 1. Product Requirements (PRD)

> Status: AI-assisted draft. Reviewed by ______ on ______. Problem statement to be rewritten by the team in its own words.
> Source of requirements: *XMUM Hack, Domain 1: The Aiversecity Future-Ready Workforce, Problem Statement & Marking Rubric*.

## Idea

**Laluan** (Malay for "path") takes a person from "who I am today" to "where I can be in the AI era".
It turns **dated AI-advancement and job-market signals** into skill and role forecasts under more
than one scenario, matches the person to future roles with an **explainable score**, and gives
them an ordered, **free or low-cost** reskilling plan in which every role and skill is linked to
the SDGs. Laluan supports career decisions; it never makes them.

## Users (from the brief)

| User | Example | Moment of need |
|---|---|---|
| Working adult at risk of displacement (hero) | Aisyah, data-entry clerk, 9 years' experience | Her team just started using an AI tool that reads invoices |
| Fresh graduate / career switcher | Wei Jie, final-year business student | Choosing a first job |
| HR and L&D manager | HR team of a 200-person company | Planning which roles to reskill, and for what |
| TVET / university career centre | Career counsellor | Advising a class on what to learn |

## Problem (brief, section 1)

AI changes which jobs exist faster than training programmes and skill frameworks can be updated.
In Malaysia 56% of professionals use AI tools at work but only 26% have had formal training (Hays
Asia Salary Guide 2025, as cited in the brief), and over 600,000 workers will need reskilling within
three to five years (MOSTI, as cited in the brief). Pathways are static lists that go out of date,
and a one-time assessment is not enough.

**Domain SDG targets:** 4.3 lifelong technical and vocational learning · 4.4 relevant skills for
decent jobs · 8.2 productivity through innovation · 8.5 full and productive employment.

## Success (brief, section 7)

| What the organisers expect | How we measure it |
|---|---|
| Profile → ranked roles → actionable pathway **in minutes** | ≤ 5 minutes in a timed run |
| Every recommendation **transparent about its source** | Every role card, skill trend, task label, course and salary shows source and date (test enforced) |
| Output **visibly changes when the trend data changes** | Live demo: run the trend refresh, rankings move |
| SDG link **meaningful, not decorative** | A person's chosen SDGs change their ranking, and the app says by how much |

## Must-have features (brief, section 4)

| # | Must-have | What the brief expects | Our design | Status |
|---|---|---|---|---|
| M1 | Skills profile intake | Skills **and potential**, via **CV upload**, form or questionnaire | Paste or **upload PDF/DOCX** CV, guided questionnaire, or pick skills; current role, years of experience, goals | ✅ upload (PDF/DOCX/TXT), paste, questionnaire, pick, experience, goals |
| M2 | AI-trend signal layer | ≥ 1 **updatable** source; show source and date; **hard-coded lists alone do not count** | Re-runnable pipeline: **arXiv API** (AI advancement by capability), **public job postings** (skill demand per month), **WEF Future of Jobs 2025 + O\*NET** (baseline). Each run writes a dated snapshot | ✅ pipeline and refresh · ✅ WEF FoJ 2025 baseline (Figure 2.3) · ✅ every update approved by a person |
| M3 | Future-role matching | Ranked roles, **explainable** match score, clear skills gap | Score = 0.6 fit + 0.4 outlook (+ SDG preference); "Why this rank?" breakdown; covered vs missing skills | ✅ |
| M4 | Personalised pathway | Ordered plan, **estimated time**, **free or low-cost** resources, HRD Corp-claimable | Steps only from the course catalogue; hours, RM cost, free / HRD Corp flags | ✅ order, hours, free / free-to-audit / paid labels, progress · ✅ RM prices and HRD Corp status where providers publish them; "ask the provider" otherwise |
| M5 | SDG mapping | **Each role and skill** → ≥ 1 SDG; show how the chosen path contributes | All 23 roles and 51 skills tagged with an SDG target and reason (test enforced); Impact screen | ✅ |
| M6 | Handling uncertainty | > 1 scenario; make clear **predictions are estimates** | Slow / baseline / accelerated + year slider; each role shows a low–high estimate range and the word "estimate" | ✅ scenarios, range, year slider to the horizon year |

Also required: the **Future Skills Radar** screen (brief, section 3, step 2), showing which **skills**
and roles are rising or declining. ✅

## Good-to-have features (brief, section 5)

| Feature | Plan | Priority |
|---|---|---|
| Employer / HR view: workforce skills-gap heatmap and reskilling plan | Anonymous CSV → heatmap, cheapest moves, learning hours, SDG totals; **aggregate only, no per-employee ranking** | ✅ |
| Automatic re-planning when trend data changes | After a refresh: "Your plan changed because …" with the roles that moved | ✅ |
| Inclusive design: EN / BM / 中文, low-bandwidth, mobile-friendly | Responsive (checked at 375 px); "lite mode" (no web fonts or photos); BM + 中文 interface strings, native-speaker check pending | ✅ |
| Learner motivation: progress tracking, skill badges | Tick steps → readiness meter; a badge per skill earned | ✅ |
| Fairness checks | No age, gender or background inputs; API rejects them; tests prove names don't change rankings | ✅ |
| SDG contribution for a person, company or region | Person ✅ (Impact screen); company ✅ (HR view); region out of scope | ✅ |

Lower priority, since the rubric asks for more than "a chatbot for jobs": an AI coach that answers
questions about the user's own results, with citations, and proposes changes the user applies.

## Rules we must follow (brief, section 6)

| Rule | How we comply |
|---|---|
| Public, open or synthetic data only; **no real personal data or real CVs** | Demo personas and test CVs are written by the team; sources are public datasets and APIs |
| Name the language model | Footer and README name the model (Google Gemini, or offline mode) |
| Every recommendation cites a source; never invent jobs, courses or statistics | Roles come from O\*NET/ESCO-coded list; steps only from the course catalogue; grounding check on AI text; figures without a source are not shown |
| Human-centred | "Supports your decision; it does not make it" on every screen; coach and watcher changes need a person to approve; HR view is aggregate-only |
| Out of scope | No course content, payments or real recruitment integrations (job links are plain searches) |

## User stories and acceptance criteria

| As a… | Given | When | Then |
|---|---|---|---|
| Worker | A synthetic CV file | I upload it | Skills appear as chips; email, phone and IC never reach the LLM; the file is not stored |
| Worker | My profile | I open the Future Skills Radar | I see which of my skills are rising or declining, each with source and date |
| Worker | Ranked roles | I open **Why this rank?** | Fit, outlook and SDG points add up to the score; the signal source and date are shown |
| Worker | Roles screen | I switch scenario or year | Rankings change; each card shows a low–high estimate |
| Worker | I chose SDG 13 | Roles load | Climate roles move up and say "Serves your goals: SDG 13" |
| Worker | A target role | I build my pathway | Ordered steps from the catalogue with hours, RM cost and free / HRD Corp flags |
| Admin | New arXiv and job-posting data | I run the refresh and approve the preview | A new dated snapshot with my name on it; rankings change; affected users see "Your plan changed because …". If I reject it, nothing changes |
| HR manager | An anonymous CSV of roles and skills | I upload it | A heatmap by role and the cheapest reskilling moves; columns with names, emails or IC numbers are rejected |

## Hardest risks and fallbacks (rubric: Feasibility)

| Risk | Fallback |
|---|---|
| Reliable, updatable trend data | Several sources; every run saved as a dated snapshot; if a source is down, the last good snapshot is used and its date shown |
| Mapping papers and job posts to skills is noisy | Fixed keyword lists per skill, reviewed by the team; signals only adjust the WEF/O\*NET baseline within a capped range |
| Matching quality | Human evaluation with synthetic CVs and a lecturer's review of pathways; weights tuned and recorded |
| AI inventing jobs, courses or numbers | Jobs, courses and figures come only from reference data; AI text is grounding-checked |

## Out of scope

Course content, payments, recruitment integrations, region-level SDG view, accounts and passwords,
training our own forecasting model, signal changes without human approval.

## Open questions

1. Preliminary submission format, length limits and deadline (the brief refers to them but does not state them).
2. Team size and roles.
3. A citable Malaysian salary source, or drop salary from the pathway.
4. Final product name.
