"""The skill tree: prerequisites below, the target role on top, levels proven by checks."""

from app import store
from app.reference import get_reference
from app.services import skilltree


def _node(tree: dict, skill_id: str) -> dict:
    return next(n for n in tree["nodes"] if n["skill_id"] == skill_id)


def test_tree_layers_prereqs_below_skills():
    profile = {"skills": ["communication"], "skill_levels": {}, "completed_courses": []}
    tree = skilltree.build(get_reference(), profile, "data_analyst")
    assert tree["role"]["role_id"] == "data_analyst"
    assert _node(tree, "sql")["depth"] > _node(tree, "excel")["depth"]
    assert "excel" in _node(tree, "sql")["prereqs"]
    assert _node(tree, "communication")["from_cv"] is True
    assert _node(tree, "sql")["course"]["url"].startswith("http")


def test_locked_until_prereqs_basic(client):
    pid = client.post("/api/profiles", json={"skills": ["communication"]}).json()["id"]
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    assert _node(tree, "sql")["unlocked"] is False
    assert _node(tree, "excel")["unlocked"] is True
    store.set_skill_level(pid, "excel", 1)
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    assert _node(tree, "sql")["unlocked"] is True
    assert _node(tree, "excel")["level"] == 1


def test_cv_skill_unlocks_what_depends_on_it(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    assert _node(tree, "sql")["unlocked"] is True and _node(tree, "excel")["level"] == 0


def test_basic_level_counts_toward_fit(client):
    pid = client.post("/api/profiles", json={"skills": ["excel", "communication"]}).json()["id"]
    fit = lambda: next(r["fit"] for r in client.get(f"/api/profiles/{pid}/matches").json()["roles"]  # noqa: E731
                       if r["role_id"] == "data_analyst")
    before = fit()
    store.set_skill_level(pid, "sql", 1)
    assert fit() > before


def test_tree_unknown_role_is_404(client):
    pid = client.post("/api/profiles", json={"skills": ["excel"]}).json()["id"]
    assert client.get(f"/api/profiles/{pid}/tree", params={"role": "astronaut"}).status_code == 404


def test_nodes_carry_their_pathway_step_and_course_progress(client):
    pid = client.post("/api/profiles", json={"skills": ["excel", "communication"]}).json()["id"]
    plan = client.get(f"/api/profiles/{pid}/pathway", params={"role": "data_analyst"}).json()
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    for step in plan["steps"]:
        for skill in step["skills"]:
            node = _node(tree, skill["skill_id"])
            assert node["step"] == step["step"] and node["course"]["id"] == step["course"]["id"]
    assert _node(tree, "excel")["step"] is None  # already have it: no step
    first = plan["steps"][0]
    client.post(f"/api/profiles/{pid}/complete", json={"course_id": first["course"]["id"], "done": True})
    tree = client.get(f"/api/profiles/{pid}/tree", params={"role": "data_analyst"}).json()
    assert all(_node(tree, s["skill_id"])["course_done"] for s in first["skills"])
