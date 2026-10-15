"""Filesystem and queue safeguards; these do not replace a real PostgreSQL restore drill."""
import json
import pytest
from app import backups as b

@pytest.fixture
def store(tmp_path,monkeypatch):
    root=tmp_path/"backups";root.mkdir()
    control=tmp_path/"control";(control/"jobs").mkdir(parents=True)
    monkeypatch.setattr(b,"ROOT",root);monkeypatch.setattr(b,"CONTROL",control)
    return root,control

def test_backup_retention_checksum_and_recovery_copy(store,monkeypatch):
    root,_=store
    def pg_run(args,database=None):
        if args[0]=="pg_dump":
            from pathlib import Path
            Path(args[-1]).write_bytes(b"verified test dump"*100)
    monkeypatch.setattr(b,"pg_run",pg_run)
    recovery=b.backup(recovery=True)
    for _ in range(5):b.backup()
    copies=b.list_backups()["backups"]
    assert len(copies)==5 and sum(not x["recovery"] for x in copies)==4
    assert (root/recovery["name"]).exists()
    for item in copies:assert item["sha256"]==b.checksum(root/item["name"])
    assert not list(root.glob("*.part"))

def test_corrupted_restore_cannot_connect_to_database(store,monkeypatch):
    root,_=store
    name="inventory-test.dump";(root/name).write_bytes(b"corrupted")
    (root/(name+".json")).write_text(json.dumps({"sha256":"wrong","schema":"0001"}))
    monkeypatch.setattr(b,"connect",lambda *args:pytest.fail("Restore connected before checksum validation"))
    with pytest.raises(RuntimeError,match="checksum"):b.restore(name)

def test_queue_idempotency_and_interrupted_restore(store):
    _,control=store;(control/"heartbeat").touch()
    a=b.enqueue("backup","owner",key="same-operation")
    assert a==b.enqueue("backup","owner",key="same-operation")
    assert len(list((control/"jobs").glob("*.json")))==1
    path=control/"jobs"/(a["job_id"]+".json")
    job=json.loads(path.read_text());job.update(kind="restore",status="running")
    b.write_json(path,job);(control/"maintenance").write_text("interrupted")
    b.recover_interrupted_jobs()
    assert json.loads(path.read_text())["status"]=="failed"
    assert (control/"maintenance").exists()
