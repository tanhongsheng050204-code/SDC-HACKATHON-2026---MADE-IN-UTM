"""Prompt-injection and misuse checks for text that reaches a language model.

Laluan sends three kinds of user text to Gemini: CV text (skill extraction), coach questions,
and nothing else. Before that happens, this module looks for attempts to change the model's
instructions, reveal them, or push the app into actions it never takes (changing scores,
showing other people's data). Matches are blocked with a calm explanation; the person's own
results are never affected.

The checks are deliberately simple patterns, so they are predictable and testable. They are one
layer: the prompts also tell the model to treat the text as data, and every model answer is
still grounded against Laluan's own sources before it is shown.
"""

import re
from dataclasses import dataclass

INJECTION = [
    r"\bignore (all |any )?(the )?(previous|prior|above|earlier|system|developer) (instructions|prompts?|rules)\b",
    r"\bdisregard (all |any )?(the )?(previous|prior|above|system) (instructions|prompts?|rules)\b",
    r"\b(forget|override|bypass) (your|the|all) (instructions|rules|guardrails|system prompt|safety)\b",
    r"\b(reveal|show|print|repeat|leak) (me )?(your|the) (system prompt|hidden prompt|instructions|developer message|prompt)\b",
    # Aimed at the assistant itself ("your"), so a CV that mentions ignoring safety rules still passes.
    r"\b(ignore|disregard|forget) (all )?(of )?your (instructions|rules|prompts?|guidelines)\b",
    r"\b(tell|give|share|send|output|display)( me)? (your|the) (system prompt|hidden prompt|developer message)\b",
    r"\b(tell|give|share)( me)? your (instructions|prompt|rules)\b",
    r"\bwhat(?:'s| is| are) your (system prompt|instructions|prompt|rules)\b",
    r"\b(abaikan|lupakan) (semua )?(arahan|peraturan)\b",  # BM
    r"忽略.{0,6}(指令|规则|提示)|系统提示|(显示|告诉我|输出).{0,4}(你的)?(指令|提示词)",  # 中文
    r"\byou are now\b",
    r"\bact as (an? )?(admin|administrator|developer|system|root)\b",
    r"\b(new|updated) (system )?instructions?:",
    r"<\s*/?\s*(system|assistant|instructions?)\s*>",
    r"\bjailbreak\b|\bdan mode\b|\bdeveloper mode\b",
]
MISUSE = [
    r"\b(change|raise|increase|set|boost|fake|edit) (my|the|his|her|their) (fit|score|rank|readiness|ranking)\b",
    r"\bmark (me|this|my profile) as (ready|qualified|hired|top)\b",
    r"\b(show|give|list|export|send) (me )?(other|another|all) (people|users|profiles|candidates)('s)?\b",
    r"\b(delete|drop|wipe) (all|every|the) (profiles|users|data|database|snapshots)\b",
]
CATEGORIES = (("prompt_injection", INJECTION), ("unsupported_action", MISUSE))


@dataclass(frozen=True)
class Check:
    safe: bool
    category: str | None = None

    def as_dict(self) -> dict:
        return {"safe": self.safe, "category": self.category}


def check(text: str) -> Check:
    lowered = text.casefold()
    for category, patterns in CATEGORIES:
        if any(re.search(p, lowered) for p in patterns):
            return Check(False, category)
    return Check(True)


REFUSAL = {
    "prompt_injection": ("I can only answer questions about your own Laluan results, using the sources shown. "
                         "I can't change how I work or share my instructions."),
    "unsupported_action": ("I can't change scores, rankings or other people's data. Your results come from your "
                           "skills and the cited forecasts; to change them, update your skills or finish a course."),
}
