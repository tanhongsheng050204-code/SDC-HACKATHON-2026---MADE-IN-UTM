# 4. UI and UX Brief

> Status: AI-assisted draft. Reviewed by ______ on ______.

## Tone

For anxious workers and curious students. **Calm, honest, hopeful.** Show uncertainty openly and
always end a screen on a next step. Never use alarm red for a whole screen.

## Look

Two surfaces. The **landing page** is white with a black announcement bar, a centered pill tag,
a very large tight headline and ink buttons. The **app** is a pale porcelain canvas with a 250 px
sidebar (grouped links, current item on a soft grey), a sticky top bar, and white cards with a
hairline border and a barely visible shadow. Status is shown with small pill badges. Deep teal is
the accent for links, progress and "covered" skills; primary buttons are ink, not teal.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--canvas` | `#F3F6F4` | `#0C1714` | App background |
| `--page` | `#FFFFFF` | `#0C1714` | Landing background |
| `--surface` | `#FFFFFF` | `#12201C` | Cards |
| `--surface-2` | `#F4F6F5` | `#182924` | Segmented tracks, neutral badges |
| `--hover` | `#ECEFEE` | `#1D2D28` | Sidebar hover and current item |
| `--ink` | `#10241F` | `#EAF2EF` | Text and primary buttons |
| `--ink-soft` | `#5A6B66` | `#A7B8B2` | Secondary text, labels |
| `--line` | `#E6EAE8` | `#22332D` | Card borders, dividers |
| `--accent` | `#086759` | `#2BB59F` | Links, progress bars, selected states |
| good badge | `#E8F3EF` / `#0B5B4F` | tinted | Growing, covered, cited |
| risk badge | `#F9EBE7` / `#9A2617` | tinted | Declining, illustrative data |
| gold badge | `#FBF3DF` / `#7A5A06` | tinted | Robust pick, warnings |
| radii | cards 14 px, buttons 10 px, links 8 px, pills 99 px | | |
| shadows | card `0 1px 2px rgba(16,36,31,.04)`; ink button inset highlight | | |

SDG tiles use the official UN colours and nothing else does. Outlook always shows a word and an
arrow as well as a colour (▲ Growing, ▬ Stable, ▼ Declining).

## Type

**Inter** (variable, self-hosted) for everything. Landing headline 4.96 rem, weight 600, letter-spacing
−0.045em; page titles 1.6 rem / 650; card titles 1 rem / 650; stat numbers 1.65 rem / 750 with
−0.035em tracking; labels and pills 0.76 rem / 600. Tabular figures throughout.

## Components

| Component | Notes |
|---|---|
| Sidebar | Logo, profile chip, grouped links (My profile · Signals · My future), model line, Delete my profile; becomes a scrolling strip on phones |
| Top bar | Page title, persona badge, theme toggle |
| Stat card | Label, big number, one pill badge (Top match, Robust picks, Your current role, Forecast data) |
| Hero card | Large rounded card at the top of each screen: eyebrow, headline number (e.g. "N% of your tasks can be automated", always computed from cited data), one sentence |
| Button | Primary ink with inset highlight, quiet white with hairline border, text link; 10 px radius |
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

8 px grid; app content max 1200 px beside a 250 px sidebar (stacks under 900 px); < 640 px one column, 640–1024 two, > 1024 three; 16 px gutter on
phones; the coach drawer becomes a full-screen sheet on phones. **Lite mode** (low bandwidth): system fonts, no images, same content.

## Accessibility

AA contrast (check white on every SDG tile), visible focus ring, keyboard-operable slider (arrow keys
by year), labels on every icon and chip, 44 px touch targets, `prefers-reduced-motion` turns off card
animation, `lang` attribute follows the language toggle.

## Assets

Word-mark logo, one open-source icon set, UN SDG icons used under the UN's guidelines, two demo
personas with a short story each, screenshots of S3, S4 and S6 for the pitch.
