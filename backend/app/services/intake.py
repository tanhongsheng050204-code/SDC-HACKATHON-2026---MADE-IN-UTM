"""Guided intake: a few short questions that build a skills profile without a form.

Scripted questions, so it runs with no LLM configured. Each answer goes through skills.extract(), so the profile fills in as the
person talks. This scripted version needs no key; a Gemini follow-up question can replace
SCRIPTED_QUESTIONS later (task 3.7).
"""

from app.services import skills

SCRIPTED_QUESTIONS = {
    "en": [
        "What is your current job, or what are you studying?",
        "What tools or software do you use most days? For example Excel, a CRM, social media or a programming language.",
        "Tell me about something at work or school you're proud of. What did you do?",
        "Any courses, certificates or side projects?",
        "Which causes matter to you? For example climate, health, education or fair work.",
    ],
    "ms": [
        "Apakah pekerjaan anda sekarang, atau apa yang anda sedang belajar?",
        "Alat atau perisian apa yang anda guna hampir setiap hari? Contohnya Excel, media sosial atau bahasa pengaturcaraan.",
        "Ceritakan sesuatu di tempat kerja atau sekolah yang anda banggakan. Apa yang anda lakukan?",
        "Ada kursus, sijil atau projek sampingan?",
        "Isu apa yang penting bagi anda? Contohnya iklim, kesihatan, pendidikan atau pekerjaan yang adil.",
    ],
}
DONE = {
    "en": "Thanks! Check the skills we found, then see your future roles.",
    "ms": "Terima kasih! Semak kemahiran yang kami jumpa, kemudian lihat peranan masa depan anda.",
}

# Words in the last answer that point to an SDG interest.
INTEREST_WORDS = {
    3: ("health", "kesihatan", "care"), 4: ("education", "pendidikan", "teaching"),
    5: ("gender", "women", "wanita"), 7: ("energy", "tenaga", "solar"),
    8: ("fair work", "jobs", "pekerjaan"), 10: ("inequality", "poverty", "b40"),
    12: ("waste", "recycling", "consumption"), 13: ("climate", "iklim", "environment", "alam sekitar"),
}


def _lang(language: str) -> str:
    return "ms" if language.strip().lower() in {"ms", "bm", "malay", "bahasa melayu"} else "en"


def turn(messages: list[dict], language: str = "en") -> dict:
    lang = _lang(language)
    answers = [m["content"] for m in messages if m.get("role") == "user"]
    found: list[str] = []
    for answer in answers:
        for skill_id in skills.extract(answer)["skills"]:
            if skill_id not in found:
                found.append(skill_id)
    interests = []
    if len(answers) >= len(SCRIPTED_QUESTIONS[lang]):
        last = answers[-1].casefold()
        interests = [sdg for sdg, words in INTEREST_WORDS.items() if any(w in last for w in words)]
    questions = SCRIPTED_QUESTIONS[lang]
    complete = len(answers) >= len(questions)
    return {
        "next_question": DONE[lang] if complete else questions[len(answers)],
        "is_complete": complete,
        "skills_found": found,
        "interests": interests,
        "mode": "scripted",
    }
