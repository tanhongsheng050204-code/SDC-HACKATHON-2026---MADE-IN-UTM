"""SDG contribution for a region: Malaysia, from every Laluan profile that chose a destination.

Counts only: how many people are heading for roles that serve each goal, and for which roles.
Demo copies are left out, and any number under MIN_GROUP is shown as "fewer than 3" so no one can
be picked out of a small group (the same rule as the class view).
"""

from app import store
from app.reference import Reference

MIN_GROUP = 3


def view(ref: Reference) -> dict:
    counts = {r: n for r, n in store.destination_counts().items() if r in ref.roles}
    people = sum(counts.values())
    by_sdg: dict[int, dict] = {}
    for role_id, n in counts.items():
        for tag in ref.role_sdgs(role_id):
            entry = by_sdg.setdefault(tag["sdg"], {"people": 0, "roles": set()})
            entry["people"] += n
            entry["roles"].add(role_id)
    hide = lambda n: n if n >= MIN_GROUP else None
    goals = [{"sdg": s, "name": ref.sdgs[s]["name"], "colour": ref.sdgs[s]["colour"],
              "people": hide(e["people"]), "roles": sorted(ref.roles[r]["title"] for r in e["roles"])}
             for s, e in sorted(by_sdg.items(), key=lambda kv: -kv[1]["people"])]
    roles = sorted(({"role_id": r, "title": ref.roles[r]["title"], "people": hide(n)} for r, n in counts.items()),
                   key=lambda x: -(x["people"] or 0))
    return {"region": "Malaysia", "people": hide(people), "min_group": MIN_GROUP, "goals": goals, "roles": roles,
            "note": "Laluan profiles with a destination, demo copies excluded; groups under 3 hidden."}
