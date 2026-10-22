# Laluan: preliminary-round proposal (draft)

> Draft for the team. Follow the official submission format and length limits (not yet known), and
> rewrite the parts marked ✍️ in your own words. Every number here must stay sourced.

**Team:** ______ · **Domain:** 1, The Aiversecity Future-Ready Workforce · **Repo:** https://github.com/tanhongsheng050204-code/XMUM-HACKATHON

## 1. Problem

✍️ *Rewrite in your own words, around one person.*

Aisyah has keyed invoices into a logistics system for nine years. This year her team started using
an AI tool that reads invoices. She does not know whether her job will exist in 2030, which jobs she
could move into, or what to learn first, and the forecasts that exist are long reports about whole
economies.

She is not alone. In Malaysia 56% of professionals already use AI tools at work but only 26% have had
formal training (Hays Asia Salary Guide 2025), and more than 600,000 workers will need reskilling
within three to five years (MOSTI) *(both as cited in the Domain 1 brief)*. Learning pathways are
static lists that go out of date, and a one-time assessment cannot keep up with AI.

**Who we build for:** working adults at risk of displacement (our hero user), fresh graduates and
career switchers, and the HR and learning teams who plan reskilling for whole companies.

## 2. Approach

Laluan takes a person from "who I am today" to "where I can be in the AI era" in about five minutes,
and keeps updating as AI moves.

| Step | What the user sees | How it works |
|---|---|---|
| 1. Tell us about yourself | Upload a CV, answer five questions, or pick skills | Names, emails, phone and IC numbers removed before any AI reads it; the file is never stored |
| 2. Future Skills Radar | Which skills and roles are rising or declining, each with a source and date | Research momentum per AI capability (arXiv, OpenAlex fallback) and skill demand in public job postings adjust a published baseline (WEF Future of Jobs 2025) within capped ranges; every refresh is a new dated snapshot |
| 3. Get matched | Ranked future roles with "Why this rank?" | Score = 60% skill fit + 40% outlook, plus a small boost for roles that fit what the person enjoys; declining roles never outrank growing ones. When a new forecast is approved the ranking is re-planned automatically and Today shows what moved |
| 4. Three futures, over time | Slow / baseline / accelerated AI adoption, and a year slider to 2030 | A transparent formula: roles that work *with* AI gain under faster adoption, exposed roles lose; we never extend past the sources' horizon |
| 5. Follow a pathway | Ordered free or low-cost courses with hours, job links, progress and badges | Steps come only from a checked course catalogue, so the system cannot invent courses; AI-written text is checked sentence by sentence |
| 6. SDG impact | Which goals the chosen career serves, with targets (4.3, 4.4, 8.2, 8.5 and others) | Every role and every skill is tagged with a UN target and a reason; the SDG impact page shows what the chosen path contributes, and an "Across Malaysia" view totals it for all users |
| For employers | Workforce heatmap and cheapest reskilling moves | Anonymous CSV in, totals by role out; files with names or IDs are refused |
| Fairness | A public fairness check on the Sources page | No age, gender or ethnicity is asked; sample profiles and CVs run under names from Malaysia's communities must give identical rankings, scores, pathways and skills (re-run whenever the forecast changes) |

**Why this is more than "upload a CV and ask a chatbot":** the forecast is built from identifiable,
dated signals that anyone can re-run; the scenarios and the year slider make uncertainty visible; and
each SDG link names a UN target and the reason the role or skill serves it, and the SDG lens shows what choosing for a goal would cost or gain (study hours, fit, outlook) against the best match, so the goal changes the decision without bending the ranking. ✍️ *Add your own angle.*

**Humans stay in charge:** Laluan shows estimates and reasons, never decisions. Trend refreshes need
an admin; course steps and goal choices stay with the user; the employer view never ranks individuals.

## 3. Expected outcome

- A new user goes from profile to ranked roles and a costed pathway **in under five minutes**.
- **Every recommendation shows its source and date**; no invented jobs, courses or statistics.
- When the trend data changes, **the output visibly changes**, with a "what changed" summary.
- Aisyah sees that her job declines by 2030 in every scenario (about −14% slow, −32% baseline, −53%
  accelerated), that "AI operations specialist" is her best match in all three futures (47% skill fit,
  about +44% by 2030 under Baseline), and that three free or free-to-audit courses, about 71 hours,
  cover the skills she is missing. *(Figures from the live app, forecast snapshot
  2026-10-22-trend-092120; they change only when a person approves a newer forecast.)*

**Does the forecast work? A test anyone can repeat.** We hid the last year of Malaysian job-ad
data and forecast it from the years before. Where the history showed a clear trend, the next year
moved the way we said for **____ of ____ skills**; guessing "everything rises" gets ____. On size,
our forecast was off by about ____% on average, against ____% for simply assuming no change.
*(Copy the four blanks from Future Skills Radar → "How well does this forecast do?" on the live
site, forecast snapshot ______. The backtest is published with every snapshot, so the claim is
re-checked each time the data changes.)*

## 4. Feasibility: what already works

Shown live from the GitHub repo: CV upload and questionnaire, the trend pipeline feeding role
matching (refresh → new dated snapshot → rankings change), explainable ranking, three scenarios and a
year slider, pathway with progress, SDG mapping, and the employer heatmap. About 430 automated tests (backend
and frontend); CI runs them on SQLite and Postgres on every push.

**Load:** with ____ people using the live API at once (each opening a demo profile and going
through Today, Future roles, a pathway, progress and plan checks), ____ requests a second, ____
failed, 95% answered within ____ ms. *(Run `python backend/scripts/load_test.py
https://laluan-api.onrender.com --users 25` after waking the server and copy the "all" line.)*

### Keeping it running after the hackathon

| | Now (free tiers) | For a real pilot |
|---|---|---|
| Hosting | Render free web service (sleeps when idle), Vercel Hobby, Supabase Free | Render Starter (always on), Supabase Pro (daily backups), Vercel Pro: about USD 52 a month at list price* |
| AI cost | Optional: everything works offline with rules and templates; only the coach, CV reading and voice call a model, each rate-limited per person and in total | The same limits cap the bill; the rules fall back if the model budget runs out |
| Cost per person | USD 0 | About USD 0.05 a month each at 1,000 active people a month (hosting only)* |
| Who pays | The team | Career centres and HR teams, who get the class and workforce views; individuals stay free |
| Who runs it | The team | A pilot partner: ______ (a career centre or TVET college) runs a class for one semester; an admin from the partner approves forecast refreshes |

\*List prices on render.com/pricing, supabase.com/pricing and vercel.com/pricing; check them
before submitting. The figure per person is the monthly hosting total divided by 1,000.

**Roadmap:** (1) a one-semester pilot with one career centre, measuring minutes to a pathway and
courses finished; (2) Malaysian job-ad history refreshed monthly and reviewed by the partner's admin;
(3) more roles and BM course options from the partner's own programmes; (4) a native-speaker review
of every BM and Chinese screen.

## 5. Hardest risks and our fallbacks

| Risk | Fallback |
|---|---|
| Reliable, updatable trend data | Several public sources; arXiv falls back to OpenAlex automatically; each run saved with its raw counts; a failed refresh keeps the last good snapshot |
| Noisy signals | Momentum measured relative to all AI research; skills need ≥ 20 job-post mentions; adjustments capped at ±15 points |
| Matching quality | Human evaluation with synthetic CVs and a lecturer's review of pathways (docs/EVALUATION.md) |
| AI inventing jobs or courses | Roles and courses come only from reference data; AI text is grounding-checked |
| Bias | No age, gender or background inputs; the API refuses them; tests show names do not change rankings |

## 6. Data and AI disclosure

Public, open or synthetic data only; demo profiles and test CVs are written by the team. Language
model: Google Gemini (optional; the app runs fully offline without it). Coding assistant used in
development: see docs/AI_DECLARATION.md.
