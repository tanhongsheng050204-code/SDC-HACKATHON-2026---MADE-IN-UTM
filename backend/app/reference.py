"""Reference data: skills, roles, courses, SDGs, scenarios and dated signal snapshots.

All of it is versioned JSON under backend/data/, read once and kept in memory. Snapshots are
immutable: a refresh adds a new file, and the latest by `imported` date is the one used.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.config import get_settings


@dataclass(frozen=True)
class Reference:
    skills: dict[str, dict]
    roles: dict[str, dict]
    courses: list[dict]
    sdgs: dict[int, dict]
    sdg_map: dict
    scenarios: dict[str, dict]
    snapshots: list[dict]  # oldest first
    demo_profiles: dict[str, dict]
    capabilities: list[dict]
    job_terms: dict[str, str]

    @property
    def latest_snapshot(self) -> dict:
        return self.snapshots[-1]

    def role_sdgs(self, role_id: str) -> list[dict]:
        return self.sdg_map["roles"].get(role_id, [])

    def skill_sdgs(self, skill_id: str) -> list[dict]:
        return self.sdg_map["skills"].get(skill_id, [])


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_snapshots(data_dir: Path) -> list[dict]:
    snapshots = [_read(p) for p in sorted((data_dir / "signals").glob("*.json"))]
    if not snapshots:
        raise RuntimeError(f"No signal snapshots in {data_dir / 'signals'}")
    return sorted(snapshots, key=lambda s: (s["imported"], s["snapshot_id"]))


@lru_cache
def get_reference() -> Reference:
    data_dir = get_settings().data_dir
    return Reference(
        skills={s["id"]: s for s in _read(data_dir / "skills.json")},
        roles={r["id"]: r for r in _read(data_dir / "roles.json")},
        courses=_read(data_dir / "courses.json"),
        sdgs={g["number"]: g for g in _read(data_dir / "sdgs.json")},
        sdg_map=_read(data_dir / "sdg_map.json"),
        scenarios={s["id"]: s for s in _read(data_dir / "scenarios.json")},
        snapshots=load_snapshots(data_dir),
        demo_profiles=_read(data_dir / "demo_profiles.json"),
        capabilities=_read(data_dir / "capabilities.json")["capabilities"],
        job_terms=_read(data_dir / "job_terms.json")["terms"],
    )


def reload_reference() -> Reference:
    get_reference.cache_clear()
    return get_reference()
