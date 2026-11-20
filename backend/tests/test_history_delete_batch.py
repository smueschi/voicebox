"""POST /history/delete-batch: delete several generations at once."""

import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.testclient import TestClient

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend import config
from backend.database import Base, Generation, GenerationVersion, VoiceProfile, get_db
from backend.routes.history import router as history_router


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "_data_dir", tmp_path)
    (tmp_path / "generations").mkdir()
    for name in ("a.wav", "b.wav", "b-v1.wav", "c.wav", "running.wav"):
        (tmp_path / "generations" / name).write_bytes(b"RIFF")

    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    session = Session()
    session.add(VoiceProfile(id="p", name="Test"))
    session.add_all([
        Generation(id="a", profile_id="p", text="a", audio_path="generations/a.wav", status="completed"),
        Generation(id="b", profile_id="p", text="b", audio_path="generations/b.wav", status="failed"),
        GenerationVersion(id="b-v1", generation_id="b", label="v1", audio_path="generations/b-v1.wav"),
        Generation(id="c", profile_id="p", text="c", audio_path="generations/c.wav", status="completed"),
        Generation(id="running", profile_id="p", text="r", audio_path="generations/running.wav",
                   status="generating"),
    ])
    session.commit()
    session.close()

    app = FastAPI()
    app.include_router(history_router)

    def override_db():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_db
    return TestClient(app), Session, tmp_path


def _ids(Session):
    s = Session()
    try:
        return sorted(g.id for g in s.query(Generation).all())
    finally:
        s.close()


def test_deletes_only_selected_and_their_files(env):
    client, Session, root = env
    r = client.post("/history/delete-batch", json={"ids": ["a", "b", "a"]})
    assert r.status_code == 200
    assert r.json() == {"deleted": 2}
    assert _ids(Session) == ["c", "running"]
    gen = root / "generations"
    assert not (gen / "a.wav").exists()
    assert not (gen / "b.wav").exists()
    assert not (gen / "b-v1.wav").exists()
    assert (gen / "c.wav").exists()


def test_skips_running_and_unknown(env):
    client, Session, root = env
    r = client.post("/history/delete-batch", json={"ids": ["running", "nope"]})
    assert r.json() == {"deleted": 0}
    assert _ids(Session) == ["a", "b", "c", "running"]
    assert (root / "generations" / "running.wav").exists()


def test_empty_list(env):
    client, Session, _ = env
    assert client.post("/history/delete-batch", json={"ids": []}).json() == {"deleted": 0}
    assert len(_ids(Session)) == 4


def test_too_many_ids_rejected(env):
    client, _, _ = env
    r = client.post("/history/delete-batch", json={"ids": [str(i) for i in range(1001)]})
    assert r.status_code == 422
