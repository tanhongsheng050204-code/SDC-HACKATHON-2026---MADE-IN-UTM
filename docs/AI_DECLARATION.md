# AI use declaration

> Draft. The team must check every line against the hackathon rules and complete the blanks before submission.

## Tools used

| Tool | Used for |
|---|---|
| Claude (Anthropic), coding assistant | First drafts of the planning documents, the project scaffold (backend services, tests, first frontend screens) and the illustrative seed data; later, under the team's direction: splitting the frontend into screens and components, the landing page and Today screen layout (modelled on a reference site the team chose), the Docker and deployment files, the admin review step for trend data, the what-if tools (tipping points, forecast x-ray, pros and cons), the prompt-injection guardrails, and fixes recorded in REVIEW_LOG.md |
| Google Gemini (inside the product; model set by `GEMINI_MODEL`, default `gemini-2.5-flash`, and shown in the app footer) | Reading skills from CVs, drafting task labels for later human review, coach answers, pathway summaries. Without a key the app runs offline with rules and templates |
| ______ | ______ |

## What the team decided and did

- Chose the problem framing, the three user groups, the three demo highlights, the visual direction and the Malaysia-first focus (see DECISIONS.md).
- Reviewed generated code and data; every finding and change is listed in REVIEW_LOG.md.
- Replaced illustrative data with cited figures and checked every figure, task label, course link and SDG reason (`reviewed_by` fields in `backend/data/`).
- Tested with synthetic CVs written by the team and an outside reviewer (EVALUATION.md).
- Wrote the problem statement, README story and pitch: ______

## Pre-existing code

Some utility functions were adapted from the team members' earlier personal projects. *(Keep or delete depending on the rules.)*

## Data

Only public, open or synthetic data is used. Demo profiles and test CVs were written by the team; no real CVs or personal data.

## How AI output is controlled inside the product

AI never changes data on its own: coach suggestions need the user to tap **Apply**, trend-watcher
changes need an admin to approve, and pathway text is checked against the course catalogue.
