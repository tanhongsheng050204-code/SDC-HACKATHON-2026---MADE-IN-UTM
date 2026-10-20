"""Guided intake: a few short questions that build a skills profile without a form.

Scripted questions, so it runs with no LLM configured. Each answer goes through skills.extract(), so the profile fills in as the
person talks. This scripted version needs no key; a Gemini follow-up question can replace
SCRIPTED_QUESTIONS later (task 3.7).
"""

from app.services import skills
from app.services.deid import scrub

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
    # Drafted with AI assistance; needs a native speaker's check. Skills are matched against the
    # English dictionary, so tool names (Excel, Python ...) are found in Chinese answers too.
    "zh": [
        "您现在的工作是什么？或者您在读什么专业？",
        "您平时最常用哪些工具或软件？例如 Excel、CRM、社交媒体或编程语言。",
        "说说一件您在工作或学校里感到自豪的事。您做了什么？",
        "有没有上过课程、考过证书或做过副业项目？",
        "您关心哪些议题？例如气候、健康、教育或公平就业。",
    ],
}
DONE = {
    "en": "Thanks! Check the skills we found, then see your future roles.",
    "ms": "Terima kasih! Semak kemahiran yang kami jumpa, kemudian lihat peranan masa depan anda.",
    "zh": "谢谢！请核对我们找到的技能，然后查看您的未来职位。",
}

def _lang(language: str) -> str:
    lang = language.strip().lower()
    if lang in {"ms", "bm", "malay", "bahasa melayu"}:
        return "ms"
    return "zh" if lang in {"zh", "zh-hans", "zh-cn", "chinese", "中文"} else "en"


def turn(messages: list[dict], language: str = "en") -> dict:
    lang = _lang(language)
    questions = SCRIPTED_QUESTIONS[lang]
    # Never more answers than questions, and dictionary matching only: a chat turn makes no LLM call.
    answers = [m["content"] for m in messages if m.get("role") == "user"][: len(questions)]
    found: list[str] = []
    for answer in answers:
        for skill_id in skills.dictionary_extract(scrub(answer)):
            if skill_id not in found:
                found.append(skill_id)
    complete = len(answers) >= len(questions)
    return {
        "next_question": DONE[lang] if complete else questions[len(answers)],
        "is_complete": complete,
        "skills_found": found,
        "mode": "scripted",
    }
