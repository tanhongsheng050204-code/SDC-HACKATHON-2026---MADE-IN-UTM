"""Write our reference JSON files in their hand-kept layout (one record per line), so a script that
adds records changes only the lines it adds. Used by scripts/add_roles.py."""

import json

_j = lambda v: json.dumps(v, ensure_ascii=False)  # noqa: E731


def dumps(value, depth: int = 0, max_depth: int = 2) -> str:
    pad, end = "  " * (depth + 1), "  " * depth
    one = _j(value)
    if isinstance(value, list) and value and (depth == 0 or (depth < max_depth and len(one) > 200
                                                             and all(isinstance(x, dict) for x in value))):
        return "[\n" + ",\n".join(pad + _j(x) for x in value) + "\n" + end + "]"
    if isinstance(value, dict) and depth < max_depth and len(one) > 200:
        return "{\n" + ",\n".join(f"{pad}{_j(k)}: {dumps(x, depth + 1, max_depth)}" for k, x in value.items()) + "\n" + end + "}"
    return one


def _split(record: dict, first: list[str], rest_groups: list[list[str]]) -> str:
    """One record over several lines: the first keys, then each group on its own indented line."""
    head = _j({k: record[k] for k in first})[:-1]
    lines = [head] + ["   " + _j({k: record[k] for k in group})[1:-1] for group in rest_groups]
    return ",\n".join(lines) + "}"


def survey_cards(cards: list[dict]) -> str:
    return "[\n" + ",\n".join("  " + _split(c, ["id", "role_ids", "dims"], [["text"]]) for c in cards) + "\n]"


def capabilities(data: dict) -> str:
    caps = ",\n".join("    " + _split(c, ["id", "name", "query"], [["exposes_roles", "complements_roles"],
                                                                     ["automates_skills", "boosts_skills"]]).replace("\n   ", "\n     ")
                      for c in data["capabilities"])
    return "{\n" + f'  "_note": {_j(data["_note"])},\n  "capabilities": [\n{caps}\n  ]\n}}'


def write(path, data, kind: str = "plain") -> None:
    text = {"plain": lambda d: dumps(d), "tasks": lambda d: dumps(d, max_depth=4),
            "cards": survey_cards, "capabilities": capabilities}[kind](data)
    path.write_text(text + "\n", encoding="utf-8")
