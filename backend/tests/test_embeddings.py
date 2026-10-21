"""Embedding lookups for phrases the alias dictionary does not know: batched, cached, one source."""

from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.services import embeddings, skills


class FakeModels:
    def __init__(self, fail: bool = False):
        self.calls: list[list[str]] = []
        self.fail = fail

    def embed_content(self, model, contents, config):
        self.calls.append(list(contents))
        if self.fail:
            raise RuntimeError("quota")
        # Same vector for every text containing "spread", another for the rest: enough to test matching.
        return SimpleNamespace(embeddings=[
            SimpleNamespace(values=[1.0, 0.0] if "spread" in t or "excel" in t else [0.0, 1.0]) for t in contents])


@pytest.fixture
def gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    get_settings.cache_clear()
    embeddings.clear_cache()
    models = FakeModels()
    monkeypatch.setattr(embeddings, "gemini_client", lambda: SimpleNamespace(models=models))
    yield models
    embeddings.clear_cache()
    get_settings.cache_clear()


def test_unknown_phrase_embeds_the_whole_catalogue_in_a_few_batched_calls(gemini):
    terms = len(skills._alias_index())
    assert skills.match_phrase("spreadsheet wizardry") == "excel"
    assert len(gemini.calls) <= terms // embeddings.BATCH + 1
    assert all(len(batch) <= embeddings.BATCH for batch in gemini.calls)
    before = len(gemini.calls)
    skills.match_phrase("spreadsheet modelling")  # catalogue cached: only the new phrase is sent
    assert len(gemini.calls) == before + 1 and gemini.calls[-1] == ["spreadsheet modelling"]


def test_a_failed_batch_falls_back_to_offline_vectors_for_everything(gemini):
    gemini.fail = True
    vectors, source = embeddings.embed_many(["spreadsheet wizardry", "excel"])
    assert source == "offline" and len(vectors) == 2
    gemini.fail = False
    _, source = embeddings.embed_many(["spreadsheet wizardry", "excel"])
    assert source == "gemini"  # offline results are never cached, so a later call can use Gemini


def test_without_a_key_embeddings_are_offline_and_deterministic(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    embeddings.clear_cache()
    first, source = embeddings.embed_many(["python"])
    assert source == "offline" and first == embeddings.embed_many(["python"])[0]
    get_settings.cache_clear()
