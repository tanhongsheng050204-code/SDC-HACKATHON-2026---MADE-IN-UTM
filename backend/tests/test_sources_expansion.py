"""The sources added in October 2026: monthly labour force, live role postings, and prices.

Each one is optional and fails soft in a refresh, so the tests here also pin the fallbacks: a
missing source must never look like a zero, and must never silently change a score.
"""

import copy
import datetime as dt

import httpx

from app import store
from app.reference import get_reference, reload_reference
from app.services import matching, xray
from app.trends import builder, labour, mypostings, prices

TODAY = dt.date(2026, 10, 23)
collect_roles = mypostings.collect_roles  # the real one, before the offline fixture patches it


def _months(end: dt.date, count: int) -> list[dt.date]:
    """`count` month starts ending at `end` (inclusive), oldest first."""
    out, year, month = [], end.year, end.month
    for _ in range(count):
        out.append(dt.date(year, month, 1))
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
    return out[::-1]


def labour_rows(growth: float = 0.01, last_year_growth: float | None = None,
                unemployment: float = 3.0, last_unemployment: float | None = None,
                months: int = 36) -> list[dict]:
    """Three years of monthly rows: steady growth, then optionally a different final year."""
    rows = []
    for i, month in enumerate(_months(dt.date(2026, 8, 1), months)):
        last_year = i >= months - 12
        rate = last_year_growth if last_year and last_year_growth is not None else growth
        u = last_unemployment if last_year and last_unemployment is not None else unemployment
        rows.append({"date": str(month), "lf_employed": 1000 * (1 + rate) ** (i / 12),
                     "u_rate": u, "p_rate": 70.0})
    return rows


def test_labour_points_are_zero_when_the_market_grows_as_usual():
    out = labour.summarise(labour_rows(), TODAY)
    assert out["stale"] is False
    assert abs(out["employment_growth_yoy_pct"] - 1.0) < 0.2
    assert abs(out["points"]) <= 0.2
    assert len(out["series"]) == labour.SERIES_MONTHS


def test_labour_points_react_to_a_slower_year_and_rising_unemployment():
    out = labour.summarise(labour_rows(growth=0.01, last_year_growth=-0.04,
                                       unemployment=3.0, last_unemployment=3.5), TODAY)
    assert out["employment_growth_yoy_pct"] < -3
    assert out["unemployment_change_pp"] == 0.5
    assert out["points"] == -labour.CLIMATE_CAP  # (-5 - 1) clipped, and never past the cap


def test_labour_points_are_capped_and_stale_data_scores_nothing():
    wild = labour.summarise(labour_rows(growth=0.01, last_year_growth=0.30,
                                        unemployment=3.0, last_unemployment=1.0), TODAY)
    assert wild["points"] == labour.CLIMATE_CAP
    stale = labour.summarise(labour_rows(), dt.date(2027, 6, 1))
    assert stale["stale"] is True and stale["points"] == 0.0
    assert stale["employment_growth_yoy_pct"] != 0  # reported, just not scored


def test_labour_needs_a_year_of_months():
    try:
        labour.summarise(labour_rows()[:6], TODAY)
    except labour.SourceUnavailable as error:
        assert "13" in str(error)
    else:
        raise AssertionError("short series should be refused")


def price_rows() -> list[dict]:
    rows = []
    for i, month in enumerate(_months(dt.date(2026, 9, 1), 60)):
        rows.append({"date": str(month), "index": 100 * 1.02 ** (i / 12), "division": "overall"})
        rows.append({"date": str(month), "index": 50.0, "division": "01"})  # other divisions ignored
    return rows


def test_prices_give_an_inflation_rate_and_a_2030_value():
    out = prices.summarise(price_rows(), TODAY)
    assert out["base_year"] == 2025 and out["horizon_year"] == 2030
    assert abs(out["average_inflation_pct"] - 2.0) < 0.15
    assert abs(out["deflator"] - 1.02 ** 5) < 0.01
    assert prices.real_value(2693, out) == round(2693 * 1.02 ** 5)
    assert prices.real_value(2693, None) is None


def _freehire(request: httpx.Request) -> httpx.Response:
    query = request.url.params.get("q")
    counts = {'"data entry"': 80, '"cashier" OR "juruwang" OR "retail cashier"': 40}
    return httpx.Response(200, json={"meta": {"total": 1000 if query is None else counts.get(query, 5)},
                                     "data": []})


def test_role_postings_count_each_role_with_the_search_the_role_page_uses():
    ref = get_reference()
    client = httpx.Client(transport=httpx.MockTransport(_freehire))
    raw = collect_roles(ref.role_openings, TODAY, client=client)
    assert raw["postings"] == 1000
    assert raw["mentions"]["data_entry_clerk"] == 80
    assert raw["mentions"]["cashier"] == 40
    assert raw["queries"]["data_entry_clerk"] == ref.role_openings["data_entry_clerk"]["query"]


def test_a_first_role_count_scores_nothing_and_a_second_one_moves_the_roles():
    ref = get_reference()
    first = {"source": "test", "source_url": "x", "retrieved": str(TODAY), "postings": 1000,
             "mentions": {role_id: 40 for role_id in ref.roles}}
    points, line = builder.openings_points(mypostings.with_prior_roles(first, None), "data_entry_clerk")
    assert points == 0.0 and "second count" in line  # a share today, no trend yet
    second = {**first, "retrieved": str(TODAY + dt.timedelta(days=35)),
              "mentions": {role_id: 40 for role_id in ref.roles} | {"data_entry_clerk": 80}}
    with_prior = mypostings.with_prior_roles(second, first)
    points, line = builder.openings_points(with_prior, "data_entry_clerk")
    assert points == builder.OPENINGS_CAP and "80 of 1,000" in line
    quiet, _ = builder.openings_points({**with_prior, "mentions": {**with_prior["mentions"],
                                                                   "cashier": {"recent": 3, "prior": 2}}}, "cashier")
    assert quiet == 0.0  # too few postings to call it a trend


def _fake_labour(points: float = 1.5) -> dict:
    out = labour.summarise(labour_rows(), TODAY)
    return {**out, "points": points}


def _fake_role_postings(move: dict[str, int] | None = None) -> dict:
    ref = get_reference()
    prior = {role_id: 40 for role_id in ref.roles}
    current = {**prior, **(move or {})}
    return mypostings.with_prior_roles(
        {"source": "test role postings", "source_url": "x", "retrieved": str(TODAY),
         "postings": 1000, "mentions": current}, {"retrieved": str(TODAY - dt.timedelta(days=35)),
                                                 "postings": 1000, "mentions": prior})


def test_the_labour_market_moves_every_role_by_the_same_small_amount():
    ref = get_reference()
    plain = builder.build(ref, ref.snapshots[0], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0))
    with_labour = builder.build(ref, ref.snapshots[0], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0),
                                labour=_fake_labour(1.5))
    before = {s["role_id"]: s for s in plain["signals"]}
    after = {s["role_id"]: s for s in with_labour["signals"]}
    assert all(after[r]["market_points"] == 1.5 for r in after)
    assert all(round(after[r]["net_growth_pct"] - before[r]["net_growth_pct"], 1) == 1.5 for r in after)
    assert with_labour["labour_market"]["latest_month"] == "2026-08"
    assert any(i["source"] == with_labour["labour_market"]["source"] for i in with_labour["inputs"])


def test_live_postings_move_one_role_and_the_total_still_adds_up():
    ref = get_reference()
    snap = builder.build(ref, ref.snapshots[0], _research(), _jobs(), dt.datetime(2026, 10, 23, 9, 0),
                         role_postings=_fake_role_postings({"data_entry_clerk": 120}))
    clerk = next(s for s in snap["signals"] if s["role_id"] == "data_entry_clerk")
    assert clerk["openings_points"] == builder.OPENINGS_CAP
    assert clerk["net_growth_pct"] == round(clerk["baseline_growth_pct"] + clerk["demand_points"]
                                            + clerk["ai_points"] + clerk["openings_points"], 1)
    assert "live Malaysian postings +8" in clerk["note"]
    assert any(i["source"] == "test role postings" and i["postings"]["recent"] == 1000
               for i in snap["inputs"])


def test_xray_shows_the_new_steps_and_still_ends_on_the_role_card_number(client):
    ref = get_reference()
    live = copy.deepcopy(ref.latest_snapshot)
    live.update(snapshot_id="2099-02-01-trend-test", imported="2099-02-01",
                baseline_snapshot_id=ref.latest_snapshot["snapshot_id"])
    for s in live["signals"]:
        base = s["net_growth_pct"]
        s.update(baseline_growth_pct=base, demand_points=0.0, market_points=1.5, openings_points=-2.0,
                 ai_points=0.0, net_growth_pct=round(base - 0.5, 1))
    store.save_snapshot(live, "approved")
    ref = reload_reference()
    steps = xray.explain(ref, "data_entry_clerk", "baseline", None)["steps"]
    labels = [s["label"] for s in steps]
    assert labels[1:5] == ["Job-posting demand", "Malaysian labour market", "Live postings for this role",
                           "AI research momentum"]
    assert steps[2]["value"] == 1.5 and steps[2]["cap"] == "±3 points"
    assert steps[3]["value"] == -2.0 and steps[3]["cap"] == "±8 points"
    ranked = next(r for r in matching.match(ref, {"skills": ["data_entry", "excel"]}, "baseline")["roles"]
                  if r["role_id"] == "data_entry_clerk")
    assert steps[-1]["running_total"] == ranked["outlook"]["baseline"]["index"]


def test_pay_can_be_shown_in_2030_money(client):
    ref = get_reference()
    assert "real" not in matching.pay(ref, "data_entry_clerk")  # no price block yet: nothing invented
    live = copy.deepcopy(ref.latest_snapshot)
    live.update(snapshot_id="2099-03-01-trend-test", imported="2099-03-01",
                prices=prices.summarise(price_rows(), TODAY))
    store.save_snapshot(live, "approved")
    ref = reload_reference()
    pay = matching.pay(ref, "data_entry_clerk")
    assert pay["real"]["horizon_year"] == 2030
    assert pay["real"]["median_rm"] == round(pay["median_rm"] * prices.summarise(price_rows(), TODAY)["deflator"])
    assert pay["median_rm"] == next(g["median_rm"] for g in ref.salaries["groups"] if g["id"] == "4")


def test_every_skill_and_role_is_counted_somewhere():
    ref = get_reference()
    missing_skills = [s for s in ref.skills if s not in ref.my_posting_terms]
    missing_roles = [r for r in ref.roles if r not in ref.role_openings]
    assert not missing_skills, f"no Malaysian posting term for {missing_skills}"
    assert not missing_roles, f"no posting search for {missing_roles}"


def _research() -> dict:
    return {"source": "test", "source_url": "x", "retrieved": str(TODAY),
            "windows": {"recent": ["2026-01-01", "2026-06-01"], "prior": ["2025-01-01", "2025-06-01"]},
            "queries": {}, "counts": {c["id"]: {"recent": 100, "prior": 100} for c in get_reference().capabilities}}


def _jobs() -> dict:
    return {"source": "test postings", "source_url": "y", "retrieved": str(TODAY),
            "threads": {"recent": [{"title": "a"}], "prior": [{"title": "b"}]},
            "postings": {"recent": 100, "prior": 100},
            "mentions": {skill: {"recent": 20, "prior": 20} for skill in get_reference().job_terms}}
