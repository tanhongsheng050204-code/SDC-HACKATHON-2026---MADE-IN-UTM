# Evaluation by people

> To be filled in by the team (Implementation Plan, M5). The quickest way is the **Review kit** in the app (`/?view=review-kit`, also linked from Sources). Tab 2 lets a teammate mark the CVs without seeing the app's answers and downloads `person_marked.json`; tab 3 gives a lecturer or counsellor both personas' real results and produces the table for section 2. **Use synthetic CVs only**: the hackathon rules forbid real personal data and real CVs. Write five varied CVs yourselves (different jobs, levels and writing styles).

## 1. Skill extraction: 5 synthetic CVs

The five CVs are in `backend/data/eval/` (all invented). A teammate who did not write the skill dictionary lists the skills they see in `backend/data/eval/person_marked.json`; then `python scripts/eval_extraction.py` prints this table with recall filled in.

| CV | Skills a person found | Skills the app found | Both | Recall (both ÷ person) | Notes |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

Target: average recall ≥ 80%. Write down which skills were missed and whether aliases were added.

## 2. Pathway review

Reviewer: ______ (role: lecturer / career counsellor) · Date: ______

| Persona | Top 3 roles shown | Reviewer agrees? | Pathway sensible? | Reviewer comments | What we changed |
|---|---|---|---|---|---|
| Aisyah (working adult) | | | | | |
| Wei Jie (graduate) | | | | | |
| Farid (career switcher) | | | | | |
| HR sample company | | | | | |
| Career-centre sample class | | | | | |

One row per group in the brief: working adults, graduates and career switchers, HR and L&D teams, and TVET / university career centres. Each group also has an automated guarantee in `backend/tests/test_audiences.py` (`test_group_*`), so a change that stops serving a group fails the build.

## 3. Task labels

Number of O\*NET tasks reviewed: ______ · labels changed by the team: ______ (examples in REVIEW_LOG.md)
