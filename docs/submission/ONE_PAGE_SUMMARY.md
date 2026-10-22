# Laluan: see where your career goes before AI changes it

**Team:** Made in UTM · **Domain 1:** The Aiversecity Future-Ready Workforce · **Live:** https://laluan-psi.vercel.app · **Code:** https://github.com/tanhongsheng050204-code/XMUM-HACKATHON

## The problem

AI is changing jobs faster than people can plan. In Malaysia 56% of professionals already use AI
tools at work but only 26% have had formal training (Hays Asia Salary Guide 2025), and more than
600,000 workers will need reskilling within three to five years (MOSTI) *(both as cited in the
Domain 1 brief)*. The forecasts that exist are long reports about whole economies, not answers for
one person.

## One person, before and after

**Before.** Aisyah has keyed invoices into a logistics system for nine years. Her team has started
using an AI tool that reads invoices. She does not know if her job will exist in 2030, where she
could go, or what to learn first.

**After about five minutes in Laluan** *(figures from the live app, forecast snapshot
2026-10-22-trend-092120)*:
- Her job declines by 2030 in every future: about −14% (slow AI adoption), −32% (baseline), −53% (accelerated).
- Her best match in all three futures is **AI operations specialist**: 47% skill fit, about +44% by 2030 under Baseline.
- Three free or free-to-audit courses, about **71 hours**, cover the skills she is missing, in order, with progress tracking and a calendar plan.
- Every number shows its source and date. She decides; Laluan never decides for her.

## What makes it different: three proof points

1. **A forecast you can open up.** Tap any percentage to see how it was built, source by source:
   the published baseline (WEF Future of Jobs 2025), Malaysian job ads, AI research momentum. A
   backtest is published with every forecast: hiding the last year, the direction was right for
   14 of 19 skills with a clear trend, against 12 for guessing "everything rises" (sizes are rougher, so the app says to read the direction). Three AI-adoption futures and a year slider
   make the uncertainty visible.
2. **Privacy before any AI reads a word.** Names, emails, phone and IC numbers are removed first,
   and the person sees what was removed. CVs, chats, voice and interview answers are never stored.
   The coach checks its own answer against its sources and drops anything unsupported.
3. **Built for whole organisations, not only individuals.** HR teams upload an anonymous staff file
   and get a reskilling heatmap and an HRD Corp training-grant plan; career centres run classes with
   check-ins where students accept or decline each proposed next step. Groups under three are hidden.

## Results so far

| Measure | Result |
|---|---|
| Minutes from landing page to a pathway (5 first-time testers, median) | ____ *(docs/EVALUATION.md §4)* |
| Skills found in 5 synthetic CVs (recall vs a person) | ____ *(EVALUATION.md §1)* |
| Expert review of persona routes | ____, ____ *(name, role; EVALUATION.md §2)* |
| Live API under load | 25 people at once: 550 requests, 0 failed, 95% within 5.9 s on the free plan *(backend/scripts/load_test.py, 23 Oct)* |
| Fairness | Rankings, scores, pathways and CV reading identical across names from Malaysia's communities (public check on the Sources page) |
| Engineering | Automated tests on every push, run on SQLite and Postgres, plus accessibility checks |

**Languages:** English, Bahasa Malaysia, 中文. **Cost to a person:** free. **SDGs:** 4.3, 4.4, 8.2, 8.5, with each link naming its UN target.
