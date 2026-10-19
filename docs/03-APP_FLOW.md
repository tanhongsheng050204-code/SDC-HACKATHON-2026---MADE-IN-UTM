# 3. App Flow

> Status: AI-assisted draft. Reviewed by ______ on ______.

## Entry points

Landing page (`/`) · demo links (`/?demo=clerk`, `/?demo=student`, `/?demo=hr`) · a saved profile (ID in the browser) · a Future Card QR (read-only view).

## Persona switch

The top bar has **Worker · Student · Organisation**. Worker and Student share one journey with
different demo data; Organisation opens the HR view.

## Screens

| # | Screen | Purpose | API |
|---|---|---|---|
| S0 | Landing | One-line promise, persona switch, demo buttons | — |
| S1 | Intake | Upload CV (PDF/DOCX) / paste CV / questionnaire / pick skills | `POST /intake/upload`, `POST /intake/extract`, `POST /intake/turn`, `GET /skills` |
| S2 | Review | Confirm skills, current job, years of experience, goals (SDGs) | `POST /profiles` |
| S2b | **Future Skills Radar** | Which skills and roles are rising or declining, each with source and date; the user's own skills highlighted | `GET /radar?profile_id=` |
| S3 | Your job, task by task | Tick tasks you do → % automate / assist / human | `GET /roles/{id}/tasks?done=` ✅ |
| S4 | Future roles | Stat cards, scenario presets, year slider (today → horizon), ranked cards | `GET /profiles/{id}/matches?scenario=&year=` |
| S5 | Role detail | Outlook over time, covered vs missing skills, **Why this rank?** | same + `GET /roles/{id}` |
| S6 | Pathway | Job links, readiness meter, badges, steps with hours and cost labels, "I finished this" | `GET /profiles/{id}/pathway?role=`, `POST /profiles/{id}/complete` |
| S7 | Impact | SDG tiles and reasons for the role and its skills | `GET /roles/{id}` |
| S8 | Future Card | Shareable read-only summary + QR, opened at `/?card=ID` | `POST /profiles/{id}/cards`, `GET /cards/{card_id}` ✅ |
| S9 | Sources | Every snapshot: source, date, reviewer | `GET /signals` |
| H1 | HR workforce | Upload or paste anonymous CSV (or the synthetic sample) → heatmap, cheapest moves, hours, SDG totals | `POST /workforce/analyse`, `GET /workforce/sample` |
| A1 | Admin | **Refresh trend data** (runs collectors, writes a new snapshot, shows what changed); approve / reject proposals | `POST /signals/refresh`, `GET /signals/refresh` (progress) |
| — | Coach drawer | Opens from any screen; cited answers; **Apply** on proposed changes | `POST /coach` ⬜ |

## Primary journey (worker)

S0 → **Start** → S1 → **Read my skills** → S2 → **Continue** → S2b Future Skills Radar → S3 tick tasks → **See my future** →
S4 drag slider / pick scenario → open role → S5 → **Build my pathway** → S6 → **See my impact** → S7 → **Make my card** → S8

## Actions

| Action | Validation | Loading | Success | Error |
|---|---|---|---|---|
| Read my skills | 50–20 000 chars | "Reading…" in button | Chips | "Couldn't read that. Pick skills instead." |
| Save profile | ≥ 1 skill | Skeleton cards | Go to S3 | "Couldn't save. Try again." + retry |
| Tick task | — | — | % updates instantly | — |
| Drag year / pick scenario | 2026–2035; slow/baseline/accelerated | Cards dim < 300 ms | Re-ranked, ▲▼ arrows | Keep last list, toast |
| Build pathway | Role has missing skills | "Building your plan…" | Steps + badge | Template plan (always works offline) |
| Coach: ask | 1–500 chars | Typing dots | Cited answer or a proposal card | "The coach is offline" + suggested questions |
| Coach: Apply | — | Spinner on the card | Plan or filters update; toast "Applied" | Nothing changes; error toast |
| Refresh trend data | Admin token | Progress message per source | New snapshot; "What changed" list; users see "Your plan changed because …" | Source down: last good snapshot kept, date shown |
| HR: upload CSV | CSV with `role,skills`; no name column accepted | Progress bar | Heatmap | Row-level errors listed |

## Navigation

Steps in the top bar are disabled until a profile exists. Browser back works on every screen. Scenario
and year live in the URL (`?scenario=accelerated&year=2032`). **Sources** and **Delete my profile** in the footer.

## Empty and blocked states

No profile → "Start with your skills" · no close roles → "Roles you can reach fastest" · role fully covered → stretch-role suggestion ·
snapshot older than 12 months or illustrative → yellow banner · server down → red banner, demo data still viewable read-only.

## First use

No account. Landing explains three steps and the privacy line: "We remove names, emails and phone
numbers before any AI reads your CV, and keep only your skills." A one-time tip explains the slider.
