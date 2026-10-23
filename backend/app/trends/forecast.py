"""Forecasts: where each skill's demand, each AI capability's research and each Malaysian occupation
group's employment are heading by the horizon year, with an 80% range, under every scenario.

One method for every series, so each number can be explained and checked:

  1. y = log(level) per period. Skill: share of job postings that mention it. AI capability: its
     papers divided by the median capability that quarter (only acceleration relative to AI
     research overall counts, as in builder.momentum). Occupation group: its share of all employees.
  2. Ordinary least squares, y = a + b*t with t in years: b is the yearly log growth, se its
     standard error. Noisy trends are shrunk towards no change: b * t2 / (t2 + 1), t2 = (b / se)**2,
     so a clear trend keeps nearly all of its slope and an unclear one keeps little. Projections
     start from the average of the last four points, not from one noisy quarter. Quarters with far
     fewer postings than usual (only a month or two of threads, at either end) are left out.
  3. Damped projection, because no trend grows for ever:
         log change by the horizon = b * D(h),   D(h) = phi * (1 - phi**h) / (1 - phi),  phi = DAMPING
     h is the years from the last data point to the middle of the horizon year. The 80% range uses
     b +/- Z80 * se. The range covers uncertainty in the trend, not one-off shocks.
  4. A skill combines job-posting demand with AI research and developer attention, the same parts the
     snapshot builder adds together:
         L(scenario) = D * b_jobs + adoption * D * 0.5 * (sum of b for capabilities that boost it
                                                         - sum of b for capabilities that automate it)
                       + 0.15 * ln(2) * attention
     with adoption from data/scenarios.json (slow 0.5, baseline 1.0, accelerated 1.6). Only
     capabilities growing faster than average (b > 0) count, as in the builder. Attention is a
     log2 ratio over a year, so it is converted to a yearly log rate (x ln 2) and weighted at 0.15,
     well below job postings and research.
  5. Label from the projected change: rising above +THRESHOLD_PCT, declining below -THRESHOLD_PCT,
     else steady. "sure" only when the whole 80% range is on the same side. A skill is "emerging"
     when it is rising and its share grew faster in the recent half of the history than the first.
  6. Backtest: refit each skill without its last BACKTEST_PERIODS quarters and forecast that year.
     Direction: for skills whose history showed a clear trend (|b| > Z80 * se), how often the next
     year moved that way, next to the simple guess "everything rises". Size: the error of the
     forecast year average against "no change from last year's average". Reported as it comes out,
     good or bad.

Every forecast is an estimate from rough public proxies; the screens say so.
"""

import math
import statistics

DAMPING = 0.8
Z80 = 1.2816
THRESHOLD_PCT = 15.0
MIN_PERIODS = 6
PARTIAL_SHARE = 0.6  # a quarter with fewer postings than this share of the median is incomplete
MIN_SKILL_MENTIONS = 40  # postings mentioning the skill over the whole history
BACKTEST_PERIODS = 4
AI_SHARE = 0.5  # weight of research momentum in a skill's forecast, as in builder.skill_signals
ATTENTION_SHARE = 0.15  # weight of developer attention, as in builder.ATTENTION_WEIGHT
EMERGING_SPEEDUP = 0.05  # recent-half yearly log growth above the first half's


def period_time(period: str) -> float:
    """'2025Q3' -> 2025.625 (middle of the quarter); '2024' -> 2024.5."""
    if "Q" in period:
        year, q = period.split("Q")
        return int(year) + (int(q) - 1) / 4 + 0.125
    return int(period) + 0.5


def fit(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """(intercept, slope, standard error of the slope) by ordinary least squares."""
    n = len(points)
    mean_t = sum(t for t, _ in points) / n
    mean_y = sum(y for _, y in points) / n
    sxx = sum((t - mean_t) ** 2 for t, _ in points)
    slope = sum((t - mean_t) * (y - mean_y) for t, y in points) / sxx if sxx else 0.0
    intercept = mean_y - slope * mean_t
    if n <= 2 or not sxx:
        return intercept, slope, 0.0
    residual = sum((y - intercept - slope * t) ** 2 for t, y in points) / (n - 2)
    return intercept, slope, math.sqrt(residual / sxx)


def trend(points: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    """(level, time of that level, shrunk slope, standard error): the level is the average of the
    last four points; the slope is shrunk towards zero by how unclear it is."""
    _, slope, se = fit(points)
    if se:
        t2 = (slope / se) ** 2
        slope = slope * t2 / (t2 + 1)
    recent = points[-4:]
    return (sum(y for _, y in recent) / len(recent), sum(t for t, _ in recent) / len(recent), slope, se)


def damped(years: float) -> float:
    """D(h): how many years of today's growth rate a damped trend adds up to by h years ahead."""
    return DAMPING * (1 - DAMPING ** max(0.0, years)) / (1 - DAMPING)


def horizon_years(from_time: float, horizon_year: int) -> float:
    return max(0.0, horizon_year + 0.5 - from_time)


def _pct(log_change: float) -> float:
    return round((math.exp(max(-5.0, min(5.0, log_change))) - 1) * 100, 1)


def label(change_pct: float) -> str:
    if change_pct > THRESHOLD_PCT:
        return "rising"
    if change_pct < -THRESHOLD_PCT:
        return "declining"
    return "steady"


def band(centre: float, spread: float) -> dict:
    """Projected change, 80% range and label from a log change and its standard error."""
    low, high = centre - Z80 * spread, centre + Z80 * spread
    change = _pct(centre)
    name = label(change)
    return {"change_pct": change, "low_pct": _pct(low), "high_pct": _pct(high), "label": name,
            "sure": label(_pct(low)) == name == label(_pct(high))}


def _logs(values: dict[str, float]) -> list[tuple[float, float]]:
    return [(period_time(p), math.log(v)) for p, v in values.items() if v > 0]


def complete_periods(series: dict) -> list[str]:
    """Quarters with a usual number of postings: a quarter only partly covered is left out."""
    counts = [series["postings"].get(p, 0) for p in series["periods"]]
    typical = statistics.median(counts) if counts else 0
    return [p for p in series["periods"] if series["postings"].get(p, 0) >= PARTIAL_SHARE * typical > 0]


def skill_share(series: dict, skill_id: str) -> dict[str, float] | None:
    """Share of postings mentioning the skill per quarter, or None when there are too few mentions.
    Half a mention is added to every quarter so a quiet quarter is low, not minus infinity."""
    mentions = series["mentions"].get(skill_id)
    periods = complete_periods(series)
    if not mentions or sum(mentions.get(p, 0) for p in periods) < MIN_SKILL_MENTIONS:
        return None
    shares = {p: (mentions.get(p, 0) + 0.5) / series["postings"][p] for p in periods}
    return shares if len(shares) >= MIN_PERIODS else None


def capability_trends(series: dict) -> dict[str, dict]:
    """Yearly log growth of each capability's papers relative to the median capability, per quarter."""
    periods = series["periods"]
    median = {p: statistics.median(c[p] + 1 for c in series["counts"].values()) for p in periods}
    out = {}
    for cap_id, counts in series["counts"].items():
        relative = {p: (counts[p] + 1) / median[p] for p in periods}
        _, _, slope, se = trend(_logs(relative))
        out[cap_id] = {"slope": round(slope, 4), "se": round(se, 4),
                       "history": [{"period": p, "papers": counts[p]} for p in periods]}
    return out


def _acceleration(points: list[tuple[float, float]]) -> float:
    half = len(points) // 2
    return fit(points[half:])[1] - fit(points[:half])[1]


def skill_forecast(skill_id: str, capabilities: list[dict], jobs_series: dict | None,
                   cap_trends: dict[str, dict], scenarios: list[dict], horizon_year: int,
                   attention: float | None = None) -> dict | None:
    shares = skill_share(jobs_series, skill_id) if jobs_series else None
    pressing = lambda key: [cap_trends[c["id"]] for c in capabilities  # acceleration only, as the builder
                            if skill_id in c[key] and cap_trends.get(c["id"], {}).get("slope", 0) > 0]
    boost, automate = pressing("boosts_skills"), pressing("automates_skills")
    if shares is None and not (boost or automate):
        return None  # nothing measured: the two-period signal (or "no data") stays
    points = _logs(shares) if shares else []
    if shares:
        _, start, b_jobs, se_jobs = trend(points)
    else:
        last = complete_periods(jobs_series)[-1:] if jobs_series else []
        start, b_jobs, se_jobs = (period_time(last[0]) if last else horizon_year - 4.0), 0.0, 0.0
    years = horizon_years(start, horizon_year)
    d = damped(years)
    ai = AI_SHARE * (sum(t["slope"] for t in boost) - sum(t["slope"] for t in automate))
    ai_var = AI_SHARE ** 2 * sum(t["se"] ** 2 for t in boost + automate)
    # Attention is a log2 ratio over a year; ln(2) turns it into the log rate the band works in.
    att = ATTENTION_SHARE * (attention or 0.0) * math.log(2)
    by_scenario = {}
    for s in scenarios:
        a = float(s["adoption"])
        by_scenario[s["id"]] = band(d * (b_jobs + a * ai + att), d * math.sqrt(se_jobs ** 2 + a ** 2 * ai_var))
    baseline = by_scenario.get("baseline") or next(iter(by_scenario.values()))
    return {
        "horizon_year": horizon_year,
        "history": [{"period": p, "share_pct": round(v * 100, 2)} for p, v in shares.items()] if shares else [],
        "growth_per_year": round(b_jobs, 4) if shares else None,
        "ai_per_year": round(ai, 4),
        "attention_per_year": round(att, 4),
        "scenarios": by_scenario,
        "emerging": bool(shares) and baseline["label"] == "rising"
                    and _acceleration(points) > EMERGING_SPEEDUP,
        "annual_rate": round(math.exp(d * (b_jobs + ai + att) / max(1.0, years)) - 1, 4),
    }


def group_forecast(dosm_series: dict, masco: str, horizon_year: int) -> dict | None:
    """Projected change in an occupation group's share of all Malaysian employees by the horizon."""
    group, overall = dosm_series["groups"].get(masco), dosm_series["overall"]
    if not group:
        return None
    share = {y: group[y] / overall[y] for y in group if overall.get(y)}
    if len(share) < 4:
        return None
    _, start, slope, se = trend(_logs(share))
    d = damped(horizon_years(start, horizon_year))
    return {"group": masco, "horizon_year": horizon_year,
            "history": [{"period": y, "share_pct": round(v * 100, 2)} for y, v in share.items()],
            **band(d * slope, d * se)}


def backtest(jobs_series: dict, skill_ids: list[str]) -> dict | None:
    """Hide each skill's last BACKTEST_PERIODS quarters (one year), forecast that year from the rest
    and compare: direction for clear trends, and size against "no change from last year"."""
    checked = clear = right = rises = 0
    model_errors, naive_errors = [], []
    for skill_id in skill_ids:
        shares = skill_share(jobs_series, skill_id)
        if not shares or len(shares) < MIN_PERIODS + BACKTEST_PERIODS:
            continue
        points = _logs(shares)
        train, test = points[:-BACKTEST_PERIODS], points[-BACKTEST_PERIODS:]
        level, start, slope, se = trend(train)
        raw_slope = fit(train)[1]
        actual = statistics.mean(y for _, y in test) - level
        predicted = statistics.mean(slope * damped(t - start) for t, _ in test)
        checked += 1
        model_errors.append(abs(predicted - actual))
        naive_errors.append(abs(actual))
        if abs(raw_slope) > Z80 * se:
            clear += 1
            right += (raw_slope > 0) == (actual > 0)
            rises += actual > 0
    if not checked:
        return None
    return {"held_out_quarters": BACKTEST_PERIODS, "skills_checked": checked,
            "clear_trends": clear, "direction_right": right, "always_rising_right": rises,
            "model_error": round(statistics.mean(model_errors), 3),
            "no_change_error": round(statistics.mean(naive_errors), 3)}
