"""Tipping points on the AI-adoption slider: where this person's picture changes.

Two kinds, both real crossings inside the slider's range, never extrapolated:
- the adoption speed at which their current job becomes "declining" (solved exactly from the
  outlook formula in scenario.py);
- where one of their top-five roles overtakes another (found by re-ranking along the slider in
  STEP-sized moves away from 1x, the published forecast).
"""

from app.reference import Reference
from app.services import matching
from app.services.scenario import AI_SWING, label_for, signals_from_snapshot, year_fraction

ADOPTION_RANGE = (0.5, 2.0)
STEP = 0.05
MAX_OVERTAKES = 3
DECLINING_AT = -10.0  # label_for: anything at or below this index is "declining"


def _current(ref: Reference, profile: dict, year: int | None) -> dict | None:
    role_id = profile.get("current_role_id")
    if role_id not in ref.roles:
        return None
    snapshot = ref.latest_snapshot
    signal = signals_from_snapshot(snapshot).get(role_id)
    if signal is None:
        return None
    _, fraction = year_fraction(snapshot, year)
    slope = AI_SWING * (signal.ai_complementarity - signal.automation_exposure)
    at = None
    if slope and fraction:
        # (g + (a - 1) * slope) * fraction = DECLINING_AT, solved for a
        a = 1 + (DECLINING_AT / fraction - signal.net_growth_pct) / slope
        if ADOPTION_RANGE[0] <= a <= ADOPTION_RANGE[1]:
            at = round(a, 2)
    return {"role_id": role_id, "title": ref.roles[role_id]["title"], "declining_at": at,
            "declining_below": slope > 0,  # with a positive slope, slower adoption is what hurts
            "label_now": label_for(round(signal.net_growth_pct * fraction, 1))}


def _order(ref: Reference, profile: dict, year: int | None, adoption: float) -> list[str]:
    return [r["role_id"] for r in matching.match(ref, profile, "baseline", year, round(adoption, 2))["roles"]]


def _overtakes(ref: Reference, profile: dict, year: int | None) -> list[dict]:
    top = _order(ref, profile, year, 1.0)[:matching.ROBUST_TOP_N]
    found: dict[tuple[str, str], dict] = {}
    for direction, step in (("above", STEP), ("below", -STEP)):
        previous, a = _order(ref, profile, year, 1.0), 1.0
        while ADOPTION_RANGE[0] - 1e-9 <= a + step <= ADOPTION_RANGE[1] + 1e-9:
            a = round(a + step, 2)
            current = _order(ref, profile, year, a)
            for x in top:
                for y in top:
                    if x != y and previous.index(x) > previous.index(y) and current.index(x) < current.index(y) \
                            and (x, y) not in found:
                        found[(x, y)] = {"role_id": x, "title": ref.roles[x]["title"], "overtakes_role_id": y,
                                         "overtakes_title": ref.roles[y]["title"], "at": a, "direction": direction}
            previous = current
    return sorted(found.values(), key=lambda m: (abs(m["at"] - 1.0), m["role_id"]))[:MAX_OVERTAKES]


def find(ref: Reference, profile: dict, year: int | None) -> dict:
    return {"current_role": _current(ref, profile, year), "overtakes": _overtakes(ref, profile, year),
            "range": list(ADOPTION_RANGE), "step": STEP}
