# Evaluation by people

> To be filled in by the team (Implementation Plan, M5). The quickest way is the **Review kit** in the app (`/?view=review-kit`, also linked from Sources). Tab 2 lets a teammate mark the CVs without seeing the app's answers and downloads `person_marked.json`; tab 3 gives a lecturer or counsellor both personas' real results and produces the table for section 2. **Use synthetic CVs only**: the hackathon rules forbid real personal data and real CVs. Write five varied CVs yourselves (different jobs, levels and writing styles).

## 1. Skill extraction: 5 synthetic CVs

The five CVs are in `backend/data/eval/` (all invented). A teammate who did not write the skill dictionary lists the skills they see in `backend/data/eval/person_marked.json`; then `python scripts/eval_extraction.py` prints this table with recall filled in.

The app's column below is the offline dictionary (`eval_extraction.py`, no API key, 23 Oct 2026). The live site reads CVs with Qwen on RunPod first, so re-run with the keys set if you want the live reader's numbers.

| CV | Skills a person found | Skills the app found | Both | Recall (both ÷ person) | Notes |
|---|---|---|---|---|---|
| 1 | | office_admin, excel, data_entry | | | |
| 2 | | marketing_analytics, statistics, machine_learning, sql, communication, data_visualization, genai_tools, python | | | |
| 3 | | customer_service, excel | | | |
| 4 | | problem_solving, solar_pv, electrical_systems, safety_compliance | | | |
| 5 | | risk_assessment, critical_thinking, excel, scheduling, carbon_accounting, power_bi, project_management, esg_reporting | | | |

Target: average recall ≥ 80%. Write down which skills were missed and whether aliases were added.

## 2. Pathway review

Top 3 roles are the live app's Baseline ranking on 22 Oct 2026 (forecast snapshot 2026-10-22-trend-092120); the reviewer fills the other columns.

Reviewer: ______ (role: lecturer / career counsellor) · Date: ______

| Persona | Top 3 roles shown | Reviewer agrees? | Pathway sensible? | Reviewer comments | What we changed |
|---|---|---|---|---|---|
| Aisyah (working adult) | AI operations specialist (47% fit); Engineering drafting and BIM technician (40%); Supply chain and logistics specialist (38%) | | | | |
| Wei Jie (graduate) | Digital marketing specialist (64% fit); Engineering drafting and BIM technician (40%); AI operations specialist (40%) | | | | |
| Farid (career switcher) | Digital marketing specialist (36% fit); AI operations specialist (26%); UX / UI designer (46%, after the first two because it uses none of his core skills; DECISIONS #62) *(live app, 23 Oct 2026)* | | | | |
| HR sample company | 190 staff, 89 at risk, 18,093 training hours. Largest moves: data entry clerk → supply chain and logistics specialist (34 people); administrative assistant → engineering drafting and BIM technician (31); accounts and payroll clerk → supply chain and logistics specialist (16) *(live app, 23 Oct 2026)* | | | | |
| Career-centre sample class | 52 students in 5 programmes. Best fit: engineering drafting and BIM technician (19 students); AI and machine learning specialist (9); digital marketing specialist (7) *(live app, 23 Oct 2026)* | | | | |

One row per group in the brief: working adults, graduates and career switchers, HR and L&D teams, and TVET / university career centres. Each group also has an automated guarantee in `backend/tests/test_audiences.py` (`test_group_*`), so a change that stops serving a group fails the build.

## 2b. Organisations

One sentence from someone who would use the HR view or the class view.

| Name and role | Organisation | Which view | What they said | Date |
|---|---|---|---|---|
| | | | | |

## 3. Task labels

Number of O\*NET tasks reviewed: ______ · labels changed by the team: ______ (examples in REVIEW_LOG.md)

## 4. Timed runs with first-time users

The brief's first success measure is "profile to ranked roles and a pathway in minutes". Ask five people who have not seen Laluan to start from the landing page with **Start with my skills** (no help from the team), and time them until the Pathway shows courses. Use synthetic or their own non-sensitive skills only; never a real CV.

| Tester (first name or initials) | Who they are (worker / student / switcher) | Minutes to a pathway | Got stuck at | One thing they said |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |

Median: ______ minutes (target ≤ 5). Changes made after the runs: ______

## 5. Bahasa Malaysia and 中文 check

Reviewer (BM): ______ · Date: ______ · strings checked in the Review kit, tab 1: ______ · fixed: ______
Reviewer (中文): ______ · Date: ______ · strings checked: ______ · fixed: ______

Start with the main journey: landing, onboarding, Today, Future roles, a role page, Pathway.
