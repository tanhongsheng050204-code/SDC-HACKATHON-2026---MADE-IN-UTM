"""Signal X-ray: the chain behind one outlook number, step by step, each with its source.

published baseline -> job-posting demand -> Malaysian employment -> AI research momentum (all capped, from an approved
trend refresh) -> AI adoption swing for the scenario -> scaling to the chosen year -> the number
shown. It reuses the same formulas as the ranking (scenario.outlook), so the last step always
equals the number on the role card.
"""

from app.reference import Reference
from app.services.scenario import AI_SWING, outlook, signals_from_snapshot, year_fraction
from app.trends.builder import CAP_POINTS, LOCAL_CAP

NO_REFRESH = "no trend refresh approved yet, so this adds nothing"


def _step(label: str, value: float, running: float, source: str, cap: str | None = None) -> dict:
    return {"label": label, "value": round(value, 1), "running_total": round(running, 1), "source": source, "cap": cap}


def explain(ref: Reference, role_id: str, scenario_id: str, year: int | None = None,
            adoption: float | None = None) -> dict:
    snapshot = ref.latest_snapshot
    row = next(s for s in snapshot["signals"] if s["role_id"] == role_id)
    signal = signals_from_snapshot(snapshot)[role_id]
    adopt = float(adoption if adoption is not None else ref.scenarios[scenario_id]["adoption"])
    year_used, fraction = year_fraction(snapshot, year)
    trend = "demand_points" in row
    baseline = float(row.get("baseline_growth_pct", row["net_growth_pct"]))
    cap = f"±{CAP_POINTS:g} points"

    steps = [_step(f"Published baseline, {snapshot['published'][:4]} to {snapshot['horizon_year']}", baseline, baseline,
                   f"{snapshot['source']} (snapshot {snapshot.get('baseline_snapshot_id', snapshot['snapshot_id'])})")]
    running = baseline
    parts = [("demand_points", "Job-posting demand", "change in postings that mention this role's skills", cap)]
    if "local_points" in row:  # snapshots refreshed before OpenDOSM was added have no such step
        parts.append(("local_points", "Malaysian employment",
                      "OpenDOSM: employee growth in this role's occupation group vs all employees",
                      f"±{LOCAL_CAP:g} points"))
    parts.append(("ai_points", "AI research momentum", "research growth in capabilities that help or replace this role", cap))
    for key, label, source, limit in parts:
        value = float(row.get(key, 0.0)) if trend else 0.0
        running += value
        steps.append(_step(label, value, running, f"{source}; snapshot {snapshot['snapshot_id']}" if trend else NO_REFRESH,
                           limit if trend else None))
    running = signal.net_growth_pct
    swing = (adopt - 1.0) * AI_SWING * (signal.ai_complementarity - signal.automation_exposure)
    running += swing
    steps.append(_step(
        f"AI adoption {adopt:g}× ({'your own setting' if adoption is not None else ref.scenarios[scenario_id]['label']})",
        swing, running,
        f"({adopt:g} − 1) × {AI_SWING:g} × (works with AI {signal.ai_complementarity:g} − exposed to automation "
        f"{signal.automation_exposure:g}); both are team estimates"))
    result = outlook(signal, scenario_id, adopt, fraction)
    steps.append(_step(f"Scaled to {year_used}", result.index - running, result.index,
                       f"{fraction:.0%} of the way from {snapshot['published'][:4]} to {snapshot['horizon_year']}"))
    return {"role_id": role_id, "title": ref.roles[role_id]["title"], "scenario": scenario_id, "year": year_used,
            "adoption": adopt, "steps": steps, "final": result.index, "label": result.label}
