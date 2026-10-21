"""Turn raw research and job-posting counts into a new dated signal snapshot.

Pure functions, so every number can be traced and tested. The baseline (the published WEF/O*NET
figures) is never edited; each refresh writes a new snapshot that adjusts it within capped ranges:

  capability momentum m   = log2(growth of this capability / median growth of all capabilities),
                            clipped to [-1, 1]. All research grows every year (and so does the
                            index), so only acceleration *relative to AI research overall* counts;
                            overall speed is what the slow / baseline / accelerated scenarios model.
                            Only acceleration (m > 0) moves roles and skills: a capability growing
                            slower than average does not undo automation that already happened.
  skill trend             = job-posting trend (change in share of postings mentioning the skill;
                            the mean of Hacker News and Malaysian postings when both have one)
                            + 0.5 x (momentum of capabilities that boost it - momentum of those that automate it)
                            clipped to [-1, 1]; "rising" above +0.15, "declining" below -0.15
  role demand adjustment  = 15 x weighted mean skill trend of the role's skills, capped at +/-15 points
  role AI adjustment      = 15 x (mean momentum of capabilities that complement the role
                                  - mean momentum of capabilities that expose it), capped at +/-15
  automation_exposure     += 0.3 x mean momentum of exposing capabilities   (clipped 0..1)
  ai_complementarity      += 0.3 x mean momentum of complementing capabilities (clipped 0..1)
  Malaysian employment    = employee growth in the role's MASCO group - growth of all employees
                            (OpenDOSM, percentage points over 3 years), capped at +/-10 points
  net_growth_pct          = baseline + demand adjustment + Malaysian employment + AI adjustment

With history (quarterly job postings and research, yearly OpenDOSM; see forecast.py), each skill's
trend becomes its forecast instead: the yearly rate of its baseline-scenario projection to the
horizon, and the Malaysian employment points become the projected change in the group's share of
employees by the horizon (same caps). The two-period comparison is the fallback without history.
"""

import datetime as dt
import math
import statistics

from app.trends import forecast

MOMENTUM_RANGE = (-1.0, 1.0)
MIN_MENTIONS = 20  # postings mentioning a skill, both periods together, before its trend counts
TREND_THRESHOLD = 0.15
CAP_POINTS = 15.0
EXPOSURE_STEP = 0.3
LOCAL_CAP = 10.0  # Malaysian employment points; nine coarse groups, so a smaller cap


def _clip(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _change(recent: float, prior: float) -> float | None:
    if prior <= 0:
        return None if recent <= 0 else 1.0
    return (recent - prior) / prior


def momentum(research: dict) -> dict[str, float]:
    growth = {cap_id: (c["recent"] + 1) / (c["prior"] + 1) for cap_id, c in research["counts"].items()}
    typical = statistics.median(growth.values())
    return {cap_id: round(_clip(math.log2(g / typical), *MOMENTUM_RANGE), 4)
            for cap_id, g in growth.items()}


def _pressure(m: dict[str, float]) -> dict[str, float]:
    return {k: max(0.0, v) for k, v in m.items()}


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _posting_trend(jobs: dict, skill_id: str, earlier: str) -> tuple[float | None, str | None]:
    """Change in the share of postings that mention the skill, and the line that explains it."""
    totals, mention = jobs["postings"], jobs["mentions"].get(skill_id)
    if not mention:
        return None, None
    if mention["prior"] is None:  # first run of this source: a share today, no trend yet
        return None, (f"{jobs['source']}: {mention['recent']:,} of {totals['recent']:,} postings mention it "
                      f"({jobs['retrieved']}); a trend needs a second count at least a month later")
    seen = mention["recent"] + mention["prior"]
    if seen == 0:
        return None, None
    if seen < MIN_MENTIONS:
        return None, f"{jobs['source']}: only {seen} postings mention it, too few for a trend"
    share_recent = mention["recent"] / totals["recent"] if totals["recent"] else 0.0
    share_prior = mention["prior"] / totals["prior"] if totals["prior"] else 0.0
    trend = _clip(_change(share_recent, share_prior) or 0.0, -1.0, 1.0)
    return trend, (f"{jobs['source']}: {mention['recent']:,} of {totals['recent']:,} postings "
                   f"vs {mention['prior']:,} of {totals['prior']:,} {earlier}")


def skill_signals(skills: dict, capabilities: list[dict], research: dict, jobs: dict,
                  history: dict | None = None, scenarios: list[dict] | None = None,
                  horizon_year: int = 2030, my_postings: dict | None = None) -> dict[str, dict]:
    out = _two_period_signals(skills, capabilities, research, jobs, my_postings)
    if not history:
        return out
    cap_trends = forecast.capability_trends(history["research"]) if history.get("research") else {}
    jobs_series = history.get("jobs")
    for skill_id, signal in out.items():
        f = forecast.skill_forecast(skill_id, capabilities, jobs_series, cap_trends, scenarios or [], horizon_year)
        if f is None:
            continue
        base = f["scenarios"]["baseline"]
        quarters = len(f["history"])
        what = (f"{quarters} quarters of {jobs_series['source']}" if quarters
                else "research momentum only (too few job-posting mentions)")
        signal.update(trend=round(_clip(f["annual_rate"], -1.0, 1.0), 3), label=base["label"], forecast=f,
                      sources=[f"Forecast to {horizon_year}: damped trend over {what}; "
                               f"{base['change_pct']:+g}% (80% range {base['low_pct']:+g}% to {base['high_pct']:+g}%)",
                               *signal["sources"]])
    return out


def _two_period_signals(skills: dict, capabilities: list[dict], research: dict, jobs: dict,
                        my_postings: dict | None = None) -> dict[str, dict]:
    m = _pressure(momentum(research))
    out: dict[str, dict] = {}
    for skill_id in skills:
        sources, trends = [], []
        readings = [_posting_trend(jobs, skill_id, "a year earlier")]
        if my_postings:
            readings.append(_posting_trend(my_postings, skill_id, f"on {my_postings.get('prior_retrieved')}"))
        for value, line in readings:
            if line:
                sources.append(line)
            if value is not None:
                trends.append(value)
        trend = _mean(trends) if trends else None
        boost = [m[c["id"]] for c in capabilities if skill_id in c["boosts_skills"]]
        automate = [m[c["id"]] for c in capabilities if skill_id in c["automates_skills"]]
        if boost or automate:
            ai = 0.5 * (sum(boost) - sum(automate))
            trend = (trend or 0.0) + ai
            names = [c["name"] for c in capabilities
                     if skill_id in c["boosts_skills"] or skill_id in c["automates_skills"]]
            sources.append(f"{research['source']} research momentum: {', '.join(names)}")
        if trend is None:
            out[skill_id] = {"skill_id": skill_id, "trend": None, "label": "no_data",
                             "sources": sources or ["No mentions in this run's sources"]}
            continue
        trend = round(_clip(trend, -1.0, 1.0), 3)
        label = ("rising" if trend > TREND_THRESHOLD
                 else "declining" if trend < -TREND_THRESHOLD else "steady")
        out[skill_id] = {"skill_id": skill_id, "trend": trend, "label": label, "sources": sources}
    return out


def _growth(pair: dict) -> float:
    return (pair["recent"] - pair["prior"]) / pair["prior"] * 100 if pair["prior"] else 0.0


def local_points(dosm: dict, masco: str | None) -> float:
    """Points from Malaysian employment: the group's growth above or below all employees."""
    group = dosm["groups"].get(masco or "")
    if not group:
        return 0.0
    return round(_clip(_growth(group) - _growth(dosm["overall"]), -LOCAL_CAP, LOCAL_CAP), 1)


def role_signals(roles: dict, capabilities: list[dict], baseline: dict, research: dict,
                 skills_out: dict[str, dict], dosm: dict | None = None) -> list[dict]:
    series = (dosm or {}).get("series")
    m = _pressure(momentum(research))
    by_role = {s["role_id"]: s for s in baseline["signals"]}
    out = []
    for role_id, base in by_role.items():
        role = roles[role_id]
        weighted = [(rs["weight"], skills_out[rs["skill_id"]]["trend"]) for rs in role["skills"]
                    if skills_out.get(rs["skill_id"], {}).get("trend") is not None]
        demand = (sum(w * t for w, t in weighted) / sum(w for w, _ in weighted)) if weighted else 0.0
        exposing = [m[c["id"]] for c in capabilities if role_id in c["exposes_roles"]]
        complementing = [m[c["id"]] for c in capabilities if role_id in c["complements_roles"]]
        demand_points = round(_clip(CAP_POINTS * demand, -CAP_POINTS, CAP_POINTS), 1)
        ai_points = round(_clip(CAP_POINTS * (_mean(complementing) - _mean(exposing)),
                                -CAP_POINTS, CAP_POINTS), 1)
        local = local_points(dosm, role.get("masco_major")) if dosm else 0.0
        group = forecast.group_forecast(series, role.get("masco_major") or "", baseline["horizon_year"]) if series else None
        if group:
            local = round(_clip(group["change_pct"], -LOCAL_CAP, LOCAL_CAP), 1)
        growth = round(base["net_growth_pct"] + demand_points + local + ai_points, 1)
        extra = {"local_points": local} if dosm else {}
        if group:
            extra["malaysia_forecast"] = group
        out.append({
            "role_id": role_id,
            "net_growth_pct": growth,
            "automation_exposure": round(_clip(base["automation_exposure"] + EXPOSURE_STEP * _mean(exposing), 0, 1), 3),
            "ai_complementarity": round(_clip(base["ai_complementarity"] + EXPOSURE_STEP * _mean(complementing), 0, 1), 3),
            "baseline_growth_pct": base["net_growth_pct"],
            "demand_points": demand_points,
            "ai_points": ai_points,
            **extra,
            "note": (f"Baseline {base['net_growth_pct']:+g}% ({baseline['snapshot_id']}); "
                     f"job-posting demand {demand_points:+g}; "
                     + (f"Malaysian employment {local:+g}; " if dosm else "")
                     + f"AI research momentum {ai_points:+g}"),
        })
    return out


def build(ref, baseline: dict, research: dict, jobs: dict, now: dt.datetime,
          dosm: dict | None = None, history: dict | None = None, my_postings: dict | None = None) -> dict:
    caps = ref.capabilities
    scenarios = [{"id": k, **v} for k, v in ref.scenarios.items()]
    horizon = int(baseline["horizon_year"])
    skills_out = skill_signals(ref.skills, caps, research, jobs, history, scenarios, horizon, my_postings=my_postings)
    stamp = now.strftime("%Y-%m-%d")
    return {
        "snapshot_id": f"{stamp}-trend-{now:%H%M%S}",
        "kind": "trend-adjusted",
        "source": (f"{baseline['source']} adjusted by {research['source']} research momentum "
                   f"and {jobs['source']}" + (f" and {dosm['source']}" if dosm else "")
                   + (f" and {my_postings['source']}" if my_postings else "")),
        "source_url": baseline["source_url"],
        "published": baseline["published"],
        "imported": now.isoformat(timespec="seconds"),
        "horizon_year": baseline["horizon_year"],
        "illustrative": baseline["illustrative"],
        "baseline_snapshot_id": baseline["snapshot_id"],
        "inputs": [
            {"source": research["source"], "url": research["source_url"],
             "retrieved": research["retrieved"], "windows": research["windows"]},
            {"source": jobs["source"], "url": jobs["source_url"], "retrieved": jobs["retrieved"],
             "threads": {w: [t["title"] for t in ts] for w, ts in jobs["threads"].items()}},
            *([{"source": dosm["source"], "url": dosm["source_url"], "retrieved": dosm["retrieved"],
                "years": dosm["years"]}] if dosm else []),
            *([{"source": my_postings["source"], "url": my_postings["source_url"],
                "retrieved": my_postings["retrieved"], "compared_with": my_postings.get("prior_retrieved")}]
              if my_postings else []),
        ],
        "capability_momentum": momentum(research),
        "signals": role_signals(ref.roles, caps, baseline, research, skills_out, dosm),
        "skill_signals": list(skills_out.values()),
        **({"forecast": _forecast_meta(history, dosm, list(ref.skills), horizon)} if history else {}),
    }


def _forecast_meta(history: dict, dosm: dict | None, skill_ids: list[str], horizon: int) -> dict:
    """How the forecasts were made, what history they used and how the method did on held-out data."""
    jobs_series, research_series = history.get("jobs"), history.get("research")
    caps = forecast.capability_trends(research_series) if research_series else {}
    return {
        "method": "Damped log-linear trend per series, 80% range, under each adoption scenario",
        "horizon_year": horizon,
        "damping": forecast.DAMPING,
        "history": {
            **({"jobs": {"source": jobs_series["source"], "retrieved": jobs_series["retrieved"],
                         "periods": [forecast.complete_periods(jobs_series)[0],
                                     forecast.complete_periods(jobs_series)[-1]],
                         "threads": jobs_series["threads"]}} if jobs_series else {}),
            **({"research": {"source": research_series["source"], "retrieved": research_series["retrieved"],
                             "periods": [research_series["periods"][0], research_series["periods"][-1]]}}
               if research_series else {}),
            **({"dosm": {"source": dosm["source"], "retrieved": dosm["retrieved"],
                         "periods": [min(dosm["series"]["overall"]), max(dosm["series"]["overall"])]}}
               if dosm and dosm.get("series") else {}),
        },
        "capabilities": {k: {"growth_per_year": v["slope"], "history": v["history"]} for k, v in caps.items()},
        "backtest": forecast.backtest(jobs_series, skill_ids) if jobs_series else None,
    }
