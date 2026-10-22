"""Reference data: skills, roles, courses, SDGs, scenarios and dated signal snapshots.

Roles also carry their latest approved skill evidence (app/evidence), stored in the database, and
"a day in this job" is the committed file version unless a richer one has been approved.

All of it is versioned JSON under backend/data/, read once and kept in memory. Snapshots are
immutable: committed ones are files; ones imported or approved at runtime are rows in the database.
The latest by `imported` date is the one used.
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
    my_posting_terms: dict[str, dict]
    tasks: dict  # {"source", "source_url", "labels_note", "roles": {role_id: {...}}}
    skill_prereqs: dict[str, list[str]]
    skill_levels: list[dict]
    work_dimensions: list[dict]
    survey_cards: dict[str, dict]
    salaries: dict
    programmes: list[dict]  # common Malaysian programmes and the skills they usually teach (data/programmes.json)
    ai_upgrade: dict[str, dict]  # role_id -> {"ai_skills": [{skill_id, why}], "reviewed_by"} (Your job, with AI)
    translations: dict[str, dict]  # English text -> {"ms", "zh"}, AI-drafted (scripts/build_translations.py)
    day_in_job: dict[str, dict]  # role_id -> {"text": {en, ms, zh}, "basis", "drafted", "reviewed_by"}
    role_occupations: dict[str, dict]  # role_id -> {"soc", "onet", "isco08", "note"}
    ai_exposure: dict  # published exposure estimates and AI usage (scripts/build_ai_exposure.py)
    entry_requirements: dict  # usual education by MASCO group and licences per role (data/entry_requirements.json)
    malaysia_programmes: dict  # MyCOL, MyMahir and Jelajah AI links on role pages (data/malaysia_programmes.json)

    @property
    def latest_snapshot(self) -> dict:
        return self.snapshots[-1]

    def role_sdgs(self, role_id: str) -> list[dict]:
        return self.sdg_map["roles"].get(role_id, [])

    def skill_sdgs(self, skill_id: str) -> list[dict]:
        return self.sdg_map["skills"].get(skill_id, [])

    def sdg_view(self, tags: list[dict]) -> list[dict]:
        """SDG tags as sent to the app: the goal, its target, and the reason in each language (BM
        and 中文 are AI-drafted; English is shown where a translation is missing)."""
        return [{**self.sdgs[t["sdg"]], "target": t.get("target"), "reason": t["reason"],
                 "reasons": {"en": t["reason"], "ms": t.get("reason_ms") or t["reason"],
                             "zh": t.get("reason_zh") or t["reason"]}} for t in tags]


def _read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_snapshots(data_dir: Path) -> list[dict]:
    """The committed snapshot files plus every snapshot approved at runtime (kept in the database)."""
    from app import store

    snapshots = [_read(p) for p in sorted((data_dir / "signals").glob("*.json"))]
    snapshots += store.list_snapshots("approved")
    if not snapshots:
        raise RuntimeError(f"No signal snapshots in {data_dir / 'signals'}")
    return sorted(snapshots, key=lambda s: (s["imported"], s["snapshot_id"]))


def _tasks(path: Path) -> dict:
    raw = _read(path)
    return {**raw, "roles": {r["role_id"]: r for r in raw["roles"]}}


@lru_cache
def get_reference() -> Reference:
    from app import store  # imported here, like load_snapshots, to avoid an import cycle
    from app.evidence.apply import apply as apply_evidence

    data_dir = get_settings().data_dir
    return Reference(
        skills={s["id"]: s for s in _read(data_dir / "skills.json")},
        roles=apply_evidence({r["id"]: r for r in _read(data_dir / "roles.json")},
                             store.latest_approved_evidence("role")),
        courses=_read(data_dir / "courses.json"),
        sdgs={g["number"]: g for g in _read(data_dir / "sdgs.json")},
        sdg_map=_read(data_dir / "sdg_map.json"),
        scenarios={s["id"]: s for s in _read(data_dir / "scenarios.json")},
        snapshots=load_snapshots(data_dir),
        demo_profiles=_read(data_dir / "demo_profiles.json"),
        capabilities=_read(data_dir / "capabilities.json")["capabilities"],
        job_terms=_read(data_dir / "job_terms.json")["terms"],
        my_posting_terms=_read(data_dir / "my_posting_terms.json")["terms"],
        tasks=_tasks(data_dir / "tasks.json"),
        skill_prereqs=_read(data_dir / "skill_prereqs.json")["prereqs"],
        skill_levels=_read(data_dir / "skill_levels.json"),
        work_dimensions=_read(data_dir / "work_dimensions.json"),
        survey_cards={c["id"]: c for c in _read(data_dir / "survey_cards.json")},
        salaries=_read(data_dir / "salaries.json"),
        programmes=_read(data_dir / "programmes.json")["programmes"],
        ai_upgrade=_read(data_dir / "ai_upgrade.json")["roles"],
        translations=_read(data_dir / "translations.json")["strings"],
        day_in_job={**_read(data_dir / "day_in_job.json")["roles"], **store.latest_approved_evidence("day")},
        role_occupations=_read(data_dir / "role_occupations.json")["roles"],
        ai_exposure=_read(data_dir / "ai_exposure.json"),
        entry_requirements=_read(data_dir / "entry_requirements.json"),
        malaysia_programmes=_read(data_dir / "malaysia_programmes.json"),
    )


def reload_reference() -> Reference:
    get_reference.cache_clear()
    return get_reference()
