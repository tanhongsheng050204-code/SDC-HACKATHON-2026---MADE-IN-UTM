# Synthetic CVs for evaluation

Five **made-up** CVs for the human evaluation in docs/EVALUATION.md. The hackathon rules forbid
real CVs and real personal data, so every name, phone number, email and employer here is invented.
They differ on purpose: job, seniority, language mix and writing style, including phrasings that
are not in the skill dictionary, so the evaluation measures real recall rather than a test we
wrote the answers for.

How to evaluate:

1. A teammate who did **not** write the skill dictionary reads each CV and lists the skills they
   see, using IDs from `data/skills.json`, in `person_marked.json`.
2. Run `python scripts/eval_extraction.py`. It runs the app's extraction on each CV and prints
   recall per CV and on average, as a table for EVALUATION.md section 1.
