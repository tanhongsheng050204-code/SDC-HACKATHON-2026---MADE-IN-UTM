"""Automatic re-planning: when a newer approved forecast changes this person's recommendations,
say what moved. The ranking is worked out under the forecast before the latest one and under the
latest one; only roles whose rank changed are reported. Nothing is switched for the person: a new
best fit is offered as a suggestion they can open (human in charge)."""

from dataclasses import replace

from app.reference import Reference
from app.services import matching
from app.services.scenario import signals_from_snapshot

TOP = 5  # moves within the top five are the ones a person acts on


def _previous(ref: Reference) -> int | None:
    """Index of the latest earlier snapshot that covers every role and differs from the latest."""
    latest = signals_from_snapshot(ref.latest_snapshot)
    for i in range(len(ref.snapshots) - 2, -1, -1):
        older = signals_from_snapshot(ref.snapshots[i])
        if set(ref.roles) <= set(older) and older != latest:
            return i
    return None


def compare(ref: Reference, profile: dict, scenario: str = "baseline") -> dict:
    latest = ref.latest_snapshot
    i = _previous(ref)
    base = {"changed": False, "to_snapshot": {"id": latest["snapshot_id"], "imported": latest["imported"][:10],
                                              "source": latest["source"]},
            "from_snapshot": None, "moves": [], "destination": None, "new_top": None}
    if i is None:
        return base
    older = ref.snapshots[i]
    before = {r["role_id"]: r for r in matching.match(replace(ref, snapshots=ref.snapshots[: i + 1]), profile, scenario)["roles"]}
    after = {r["role_id"]: r for r in matching.match(ref, profile, scenario)["roles"]}
    moves = [{"role_id": rid, "title": r["title"], "before": before[rid]["rank"], "after": r["rank"]}
             for rid, r in after.items()
             if rid in before and before[rid]["rank"] != r["rank"] and min(before[rid]["rank"], r["rank"]) <= TOP]
    moves.sort(key=lambda m: m["after"])
    target = profile.get("target_role_id")
    destination = None
    if target in after and target in before:
        b, a = before[target], after[target]
        destination = {"role_id": target, "title": a["title"], "rank_before": b["rank"], "rank_after": a["rank"],
                       "outlook_before": b["outlook"][scenario]["index"], "outlook_after": a["outlook"][scenario]["index"],
                       "label_before": b["outlook"][scenario]["label"], "label_after": a["outlook"][scenario]["label"]}
    top_before = min(before.values(), key=lambda r: r["rank"])["role_id"]
    top_after = min(after.values(), key=lambda r: r["rank"])
    new_top = ({"role_id": top_after["role_id"], "title": top_after["title"]}
               if top_after["role_id"] != top_before and top_after["role_id"] != target else None)
    changed = bool(moves) or bool(destination and (destination["rank_before"] != destination["rank_after"]
                                                    or destination["label_before"] != destination["label_after"]))
    return {**base, "changed": changed, "from_snapshot": {"id": older["snapshot_id"], "imported": older["imported"][:10]},
            "moves": moves, "destination": destination, "new_top": new_top}
