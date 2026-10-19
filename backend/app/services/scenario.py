"""Deterministic scenario engine: role outlooks under slow, baseline and accelerated AI adoption.

Pure functions over a dated signal snapshot: each scenario is a band of the same forecast, and
each signal is one role's demand forecast.

The formula is deliberately simple, so every number can be explained to a judge:

    outlook_index = net_growth_pct + (adoption - 1) * AI_SWING * (ai_complementarity - automation_exposure)

Baseline (adoption 1.0) is exactly the published figure. Slow adoption halves the AI effect;
accelerated adoption strengthens it. Roles that work *with* AI gain under faster adoption;
roles exposed to automation lose.

For a year before the horizon, the change is scaled linearly from the source's base year
(fraction 0) to the horizon year (fraction 1). Years after the horizon are never shown: the
sources do not cover them, and extending the line would be inventing numbers.
"""

from dataclasses import dataclass

AI_SWING = 40.0  # percentage points of extra growth or decline per unit of adoption change
INDEX_FLOOR, INDEX_CEILING = -50.0, 100.0


@dataclass(frozen=True)
class RoleSignal:
    role_id: str
    net_growth_pct: float
    automation_exposure: float
    ai_complementarity: float
    note: str | None = None


@dataclass(frozen=True)
class Outlook:
    role_id: str
    scenario: str
    index: float  # expected % change in jobs by the horizon year, under this scenario
    label: str  # emerging / growing / stable / declining
    normalised: float  # 0..1, for ranking


def signals_from_snapshot(snapshot: dict) -> dict[str, RoleSignal]:
    return {
        s["role_id"]: RoleSignal(
            role_id=s["role_id"],
            net_growth_pct=float(s["net_growth_pct"]),
            automation_exposure=float(s["automation_exposure"]),
            ai_complementarity=float(s["ai_complementarity"]),
            note=s.get("note"),
        )
        for s in snapshot["signals"]
    }


def label_for(index: float) -> str:
    if index >= 50:
        return "emerging"
    if index >= 10:
        return "growing"
    if index > -10:
        return "stable"
    return "declining"


def outlook(signal: RoleSignal, scenario_id: str, adoption: float, fraction: float = 1.0) -> Outlook:
    swing = (adoption - 1.0) * AI_SWING * (signal.ai_complementarity - signal.automation_exposure)
    index = round((signal.net_growth_pct + swing) * fraction, 1)
    clamped = min(max(index, INDEX_FLOOR), INDEX_CEILING)
    return Outlook(
        role_id=signal.role_id,
        scenario=scenario_id,
        index=index,
        label=label_for(index),
        normalised=round((clamped - INDEX_FLOOR) / (INDEX_CEILING - INDEX_FLOOR), 4),
    )


def year_fraction(snapshot: dict, year: int | None) -> tuple[int, float]:
    """(year used, share of the way from the base year to the horizon year)."""
    base, horizon = int(str(snapshot["published"])[:4]), int(snapshot["horizon_year"])
    year = horizon if year is None else max(base, min(horizon, int(year)))
    return year, (year - base) / (horizon - base) if horizon > base else 1.0


def outlooks(signals: dict[str, RoleSignal], scenarios: dict[str, dict],
             fraction: float = 1.0) -> dict[str, dict[str, Outlook]]:
    """{scenario_id: {role_id: Outlook}} for every scenario and every role with a signal."""
    return {
        scenario_id: {
            role_id: outlook(signal, scenario_id, float(scenario["adoption"]), fraction)
            for role_id, signal in signals.items()
        }
        for scenario_id, scenario in scenarios.items()
    }
