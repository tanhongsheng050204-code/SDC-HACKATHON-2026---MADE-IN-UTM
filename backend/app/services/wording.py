"""Catalogue names inside an English sentence: "Data analyst" reads "a data analyst", but
"AI operations specialist" stays "an AI operations specialist" and "SQL" or "Python" keep their capitals."""

KEEP = {"Python", "JavaScript", "Power"}  # proper nouns that start a skill name ("Power BI")


def mid_sentence(name: str) -> str:
    first = name.split(" ", 1)[0]
    if first in KEEP or len(first) < 2 or not first[1:].islower():  # an acronym (AI, SQL, MLOps) or a name
        return name
    return name[0].lower() + name[1:]


def with_article(name: str) -> str:
    """'a' or 'an' and the name, by how it sounds: an AI ..., an ESG ..., a UX ..., an administrative ..."""
    text = mid_sentence(name)
    first = text.split(" ", 1)[0]
    if first.isupper():  # read letter by letter: "an" before A, E, F, H, I, L, M, N, O, R, S, X
        vowel_sound = first[0] in "AEFHILMNORSX"
    else:
        vowel_sound = first[0].lower() in "aeiou" and not first.lower().startswith(("uni", "use", "user"))
    return f"{'an' if vowel_sound else 'a'} {text}"
