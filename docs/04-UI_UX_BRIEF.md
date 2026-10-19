# 4. UI and UX Brief

> Status: AI-assisted draft. Reviewed by ______ on ______.

## Tone

For anxious workers and curious students. **Calm, honest, hopeful.** Show uncertainty openly and
always end a screen on a next step. Never use alarm red for a whole screen.

## Look

Deep green on a pale mint-grey background, white cards with large rounded corners and soft shadows,
pill-shaped buttons, small uppercase labels above headings, light and dark themes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F3F6F4` | `#0C1714` | Page |
| `--surface` | `#FFFFFF` | `#12201C` | Cards |
| `--surface-2` | `#E9EFEC` | `#182924` | Inset panels, chips |
| `--ink` | `#10241F` | `#EAF2EF` | Text |
| `--ink-soft` | `#4F625C` | `#A7B8B2` | Secondary text, sources and dates |
| `--line` | `#DCE4E0` | `#24352F` | Borders |
| `--accent` | `#086759` | `#2BB59F` | Buttons, selected states, covered skills |
| `--gold` | `#B7860F` | `#E0B23A` | Highlights: robust pick, readiness |
| `--red` | `#C0392B` | `#F07163` | Declining outlook, errors (sparingly) |
| radii | 28 / 18 / 12 px | | Hero cards / cards / chips and inputs |
| shadow | `0 30px 60px -28px rgba(16,36,31,.28)` | darker | Cards |

SDG tiles use the official UN colours and nothing else does. Outlook is always a word and an arrow
as well as a colour (▲ Growing, ▬ Stable, ▼ Declining).

## Type

Headings **Manrope** 600–700; text **Inter** 400–500. Eyebrow labels 11 px uppercase, letter-spacing .1em.
Scale: 32 / 24 / 18 / 16 / 13 px. Figures use tabular numbers.

## Components

| Component | Notes |
|---|---|
| Top bar | Logo, persona switch (Worker · Student · Organisation), steps, **Ask the coach** button |
| Hero card | Large rounded card at the top of each screen: eyebrow, headline number (e.g. "N% of your tasks can be automated", always computed from cited data), one sentence |
| Pill button | Primary (green fill), secondary (outline), text link; min height 44 px |
| Year slider | 2026–2035 with tick labels; scenario presets as a segmented pill group above it |
| Role card | Rank + movement arrow, title, fit bar, outlook word, **estimate range** ("−8% to +20% to 2030, estimate"), "Serves your goals" badge, SDG tiles, source line, **Why this rank?** link, job links |
| Radar | Skills and roles as rising / steady / declining bands; the user's skills highlighted; every point has a source and date on tap |
| Task row | Checkbox, task text, Automate / Assist / Human tag, source |
| Grounding chip | Small chip on AI text: "Backed by catalogue" or "Check sentence 2" |
| Side drawer | Coach chat from the right; proposal cards with **Apply** / **Dismiss** |
| Proposal card | Used by the coach and the admin inbox: what changes, why, source, Approve/Apply |
| Status banner | Server down, illustrative data, out-of-date snapshot |
| Empty state | Illustration-free: one sentence + one button |

## Honesty in the interface

Every forecast says "estimate" and shows a range, never one number alone. Every recommendation has a source line. The footer says which AI model is in use and that Laluan supports decisions rather than making them.

## Layout

8 px grid; content max 1240 px; < 640 px one column, 640–1024 two, > 1024 three; 16 px gutter on
phones; the coach drawer becomes a full-screen sheet on phones. **Lite mode** (low bandwidth): system fonts, no images, same content.

## Accessibility

AA contrast (check white on every SDG tile), visible focus ring, keyboard-operable slider (arrow keys
by year), labels on every icon and chip, 44 px touch targets, `prefers-reduced-motion` turns off card
animation, `lang` attribute follows the language toggle.

## Assets

Word-mark logo, one open-source icon set, UN SDG icons used under the UN's guidelines, two demo
personas with a short story each, screenshots of S3, S4 and S6 for the pitch.
