"""Asynchronous in-app BMR extraction jobs (no database mutations)."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import RLock
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from ..models import User
from ..security import require_permission
from ..bmr_extractor_core import extract, MAX_SOURCE_BYTES

router = APIRouter(prefix="/admin/bmr-extractor", tags=["migration"])
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="stkflo-bmr-extract")
_jobs = {}
_lock = RLock()


def _purge():
    now=datetime.now(timezone.utc)
    for job_id, job in list(_jobs.items()):
        if job["state"] != "RUNNING" and now-job["started"]>timedelta(minutes=60):
            _jobs.pop(job_id,None)


def _work(job_id, raw, workbook):
    def progress(note):
        with _lock:
            _jobs[job_id]["progress"]=note
    try:
        result=extract(raw,workbook,progress)
        with _lock:
            _jobs[job_id]["state"]="COMPLETE"
            _jobs[job_id]["progress"]="BMR extraction complete — review source records and continue to validation"
            _jobs[job_id]["result"]=result
    except Exception as exc:
        with _lock:
            _jobs[job_id]["state"]="FAILED"
            _jobs[job_id]["progress"]=f"Extraction failed: {type(exc).__name__}: {exc}"


@router.post("/start")
async def start(
    archive: UploadFile = File(...),
    product_list: UploadFile | None = File(None),
    user: User = Depends(require_permission("data_migration.view")),
):
    if not (archive.filename or "").lower().endswith(".zip"):
        raise HTTPException(400,"Upload a ZIP containing your A-Z BMR Word documents")
    raw=await archive.read(MAX_SOURCE_BYTES+1)
    if len(raw)>MAX_SOURCE_BYTES:
        raise HTTPException(413,"BMR ZIP exceeds 175 MB")
    workbook=None
    if product_list is not None and product_list.filename:
        if not product_list.filename.lower().endswith((".xlsx",".xlsm")):
            raise HTTPException(400,"Product list must be XLSX or XLSM")
        workbook=await product_list.read(8_000_001)
        if len(workbook)>8_000_000:
            raise HTTPException(413,"Product list workbook exceeds 8 MB")
    with _lock:
        _purge()
        if sum(j["state"]=="RUNNING" for j in _jobs.values())>=2:
            raise HTTPException(429,"Two BMR extraction jobs are already running")
        if any(j["username"]==user.username and j["state"]=="RUNNING" for j in _jobs.values()):
            raise HTTPException(409,"You already have an active BMR extraction job")
        job_id=uuid4().hex
        _jobs[job_id]={
            "username":user.username,"started":datetime.now(timezone.utc),
            "state":"RUNNING","progress":"Queued for BMR conversion","result":None
        }
    _executor.submit(_work,job_id,raw,workbook)
    return {"job_id":job_id,"state":"RUNNING"}


@router.get("/{job_id}")
def status(job_id: str,user:User=Depends(require_permission("data_migration.view"))):
    with _lock:
        _purge()
        job=_jobs.get(job_id)
        if not job or job["username"]!=user.username:
            raise HTTPException(404,"BMR extraction job not found or expired")
        result=job["result"]
        return {"job_id":job_id,"state":job["state"],"progress":job["progress"],
                "result":result if job["state"]=="COMPLETE" else None}
