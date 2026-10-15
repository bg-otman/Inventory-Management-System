"""A small server-side backup worker. Never run PostgreSQL restoration inside an HTTP request."""
import os, json, time, uuid, hashlib, subprocess, re, fcntl, threading
from pathlib import Path
from datetime import datetime, timezone, timedelta
from sqlalchemy.engine import make_url
from fastapi import HTTPException

ROOT=Path(os.environ.get("BACKUP_DIR","/backup-store"))
CONTROL=Path(os.environ.get("CONTROL_DIR","/tmp/mizan-control"))
def utc():return datetime.now(timezone.utc)
def write_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_suffix(".tmp");temp.write_text(json.dumps(data,indent=2));temp.replace(path)
def enabled():
    heartbeat=CONTROL/"heartbeat"
    return heartbeat.exists() and time.time()-heartbeat.stat().st_mtime<150

def list_backups():
    items=[]
    if ROOT.exists():
        for p in ROOT.glob("*.json"):
            try:
                m=json.loads(p.read_text())
                if m.get("status")=="success" and (ROOT/m["name"]).is_file():items.append(m)
            except (ValueError,KeyError):pass
    jobs=[]
    if (CONTROL/"jobs").exists():
        for p in sorted((CONTROL/"jobs").glob("*.json"),key=lambda p:p.stat().st_mtime,reverse=True)[:10]:
            try:jobs.append(json.loads(p.read_text()))
            except ValueError:pass
    return {"enabled":enabled(),"schedule":"Sunday 02:00 UTC","retention":4,
        "backups":sorted(items,key=lambda x:x["created_at"],reverse=True),"jobs":jobs}

def enqueue(kind,actor,backup=None,key=None):
    if not enabled():raise HTTPException(503,"The backup worker is not running. Check server configuration.")
    if kind=="restore":
        if not backup or not re.fullmatch(r"mizan-[A-Za-z0-9_-]+\.dump",backup) or not (ROOT/backup).is_file():
            raise HTTPException(404,"Backup not found.")
    jobid=hashlib.sha256((actor+str(key or uuid.uuid4())).encode()).hexdigest()[:32]
    p=CONTROL/"jobs"/(jobid+".json")
    if not p.exists():write_json(p,{"id":jobid,"kind":kind,"actor":actor,"backup":backup,"status":"queued","created_at":utc().isoformat()})
    return {"job_id":jobid,"status":"queued"}

def pg_env(database=None):
    url=make_url(os.environ["BACKUP_DATABASE_URL"])
    env=os.environ.copy()
    env.update(PGHOST=url.host or "db",PGPORT=str(url.port or 5432),PGUSER=url.username or "postgres",
               PGPASSWORD=url.password or "",PGDATABASE=database or url.database or "mizan")
    return env
def pg_run(args,database=None):
    result=subprocess.run(args,env=pg_env(database),capture_output=True,text=True)
    if result.returncode:raise RuntimeError(result.stderr[-1500:] or "Database utility failed.")
    return result

def checksum(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
    return h.hexdigest()

def backup(recovery=False):
    ROOT.mkdir(parents=True,exist_ok=True)
    name="mizan-"+utc().strftime("%Y%m%dT%H%M%SZ")+"-"+uuid.uuid4().hex[:6]+".dump"
    target=ROOT/name;temp=ROOT/(name+".part")
    try:
        pg_run(["pg_dump","-Fc","--no-owner","--no-privileges","--file",str(temp)])
        pg_run(["pg_restore","--list",str(temp)])
        if temp.stat().st_size<100:raise RuntimeError("Backup is incomplete.")
        temp.replace(target)
        # Invoice snapshots and the bounded company-logo data URI live in PostgreSQL;
        # this release has no separately stored uploaded assets.
        meta={"name":name,"created_at":utc().isoformat(),"size":target.stat().st_size,"sha256":checksum(target),
              "status":"success","schema":"0002","app_version":"0.2.0","recovery":recovery}
        write_json(ROOT/(name+".json"),meta)
        if not recovery:
            normal=[b for b in list_backups()["backups"] if not b.get("recovery")]
            for old in normal[4:]:
                (ROOT/old["name"]).unlink(missing_ok=True);(ROOT/(old["name"]+".json")).unlink(missing_ok=True)
        return meta
    finally:temp.unlink(missing_ok=True)

def connect(database=None):
    import psycopg
    e=pg_env(database)
    return psycopg.connect(host=e["PGHOST"],port=e["PGPORT"],user=e["PGUSER"],password=e["PGPASSWORD"],dbname=e["PGDATABASE"],autocommit=True)

def restore(name):
    from psycopg import sql
    target=ROOT/name;meta=json.loads((ROOT/(name+".json")).read_text())
    if checksum(target)!=meta["sha256"]:raise RuntimeError("Backup checksum does not match.")
    if meta.get("schema")!="0002":raise RuntimeError("Restore requires the matching application/schema version.")
    shadow="mizan_restore_"+uuid.uuid4().hex[:10]
    role=os.environ.get("APP_DB_USER","mizan")
    maintenance=CONTROL/"maintenance"
    try:
        with connect("postgres") as conn:conn.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(shadow),sql.Identifier(role)))
        pg_run(["pg_restore","--no-owner","--no-privileges","--exit-on-error","--single-transaction","--role",role,"--dbname",shadow,str(target)],shadow)
        with connect(shadow) as conn:
            required={"users","products","stock","documents","payments","allocations","settings","sessions"}
            actual={r[0] for r in conn.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'")}
            if not required<=actual:raise RuntimeError("Required tables are missing.")
            if conn.execute("SELECT COUNT(*) FROM stock WHERE quantity<0").fetchone()[0]:raise RuntimeError("Invalid stock data.")
            if conn.execute("SELECT COUNT(*) FROM users WHERE role='owner' AND active").fetchone()[0]<1:raise RuntimeError("No active owner in backup.")
        CONTROL.mkdir(parents=True,exist_ok=True);maintenance.write_text(utc().isoformat())
        # Stop already-open application transactions before the recovery snapshot.
        # New API requests are blocked by the shared maintenance marker.
        with connect() as conn:
            for _ in range(20):
                active=conn.execute("SELECT COUNT(*) FROM pg_stat_activity WHERE datname=current_database() AND usename=%s AND state<>'idle'",(role,)).fetchone()[0]
                if not active:break
                time.sleep(1)
            conn.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename=%s AND pid<>pg_backend_pid()",(role,))
        recovery=backup(recovery=True)
        # All schema/data changes are one transaction. A failed restore rolls back.
        pg_run(["pg_restore","--clean","--if-exists","--no-owner","--no-privileges","--exit-on-error","--single-transaction","--role",role,"--dbname",pg_env()["PGDATABASE"],str(target)])
        with connect() as conn:conn.execute("DELETE FROM sessions")
        return {"restored":name,"recovery_backup":recovery["name"]}
    finally:
        maintenance.unlink(missing_ok=True)
        with connect("postgres") as conn:
            conn.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(shadow)))

def recover_interrupted_jobs():
    # Never automatically retry a restore: the operator must inspect its outcome.
    # A maintenance marker left by a crash deliberately stays in place.
    for path in (CONTROL/"jobs").glob("*.json"):
        job=json.loads(path.read_text())
        if job.get("status")=="running":
            job.update(status="failed",error="Worker restarted during this operation. Check database state before retrying.",finished_at=utc().isoformat())
            write_json(path,job)

def heartbeat():
    while True:
        (CONTROL/"heartbeat").touch()
        time.sleep(30)

def worker():
    CONTROL.mkdir(parents=True,exist_ok=True);(CONTROL/"jobs").mkdir(exist_ok=True)
    lock=(CONTROL/"worker.lock").open("w")
    fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    recover_interrupted_jobs()
    threading.Thread(target=heartbeat,daemon=True).start()
    while True:
        (CONTROL/"heartbeat").touch()
        scheduled=CONTROL/"last-weekly"
        now=utc()
        last_sunday=(now-timedelta(days=(now.weekday()+1)%7)).replace(hour=2,minute=0,second=0,microsecond=0)
        if now<last_sunday:last_sunday-=timedelta(days=7)
        # First run creates the initial backup; missed weekly runs catch up.
        if not scheduled.exists() or scheduled.read_text()!=last_sunday.isoformat():
            key="weekly-"+last_sunday.isoformat()
            jobid=hashlib.sha256(key.encode()).hexdigest()[:32]
            path=CONTROL/"jobs"/(jobid+".json")
            if not path.exists():write_json(path,{"id":jobid,"kind":"backup","actor":"scheduler","status":"queued","created_at":now.isoformat()})
            scheduled.write_text(last_sunday.isoformat())
        for path in sorted((CONTROL/"jobs").glob("*.json")):
            job=json.loads(path.read_text())
            if job["status"]!="queued":continue
            if (CONTROL/"maintenance").exists():
                # A previous interrupted restore needs operator attention first.
                continue
            job["status"]="running";write_json(path,job)
            try:
                result=restore(job["backup"]) if job["kind"]=="restore" else backup()
                job.update(status="success",result=result)
            except Exception as exc:
                job.update(status="failed",error=str(exc)[:1500])
            job["finished_at"]=utc().isoformat();write_json(path,job);(CONTROL/"heartbeat").touch()
        time.sleep(20)

if __name__=="__main__":
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument("command",choices=["worker","backup","restore"]);parser.add_argument("name",nargs="?")
    args=parser.parse_args()
    if args.command=="worker":worker()
    elif args.command=="backup":print(json.dumps(backup()))
    else:
        if not args.name:parser.error("restore requires a backup filename")
        if not re.fullmatch(r"mizan-[A-Za-z0-9_-]+\.dump",args.name):parser.error("Invalid backup filename")
        print(json.dumps(restore(args.name)))
