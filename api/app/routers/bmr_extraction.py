"""Asynchronous in-app BMR extraction jobs (no database mutations)."""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
from threading import RLock
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from ..models import User
from ..security import require_any_permission
from ..bmr_extractor_core import extract, MAX_SOURCE_BYTES

router = APIRouter(prefix="/admin/bmr-extractor", tags=["migration"])
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="stkflo-bmr-extract")
_jobs = {}
_lock = RLock()

IMPORT_DIR = Path(os.getenv("BMR_IMPORT_DIR", "/bmr-imports"))


class ServerExtractionRequest(BaseModel):
    archive_name: str = Field(min_length=1, max_length=255)
    product_list_name: str | None = Field(default=None, max_length=255)


def _get_server_file(name: str, extensions: tuple[str, ...], limit: int) -> bytes:
    """Read only a top-level, regular, non-symlink file from the dedicated mount."""
    if not name or Path(name).name != name or name in {".", ".."} or name.startswith("."):
        raise HTTPException(400, "Choose a file listed in the StkFlo BMR import folder")
    if Path(name).suffix.casefold() not in extensions:
        raise HTTPException(400, "Unsupported BMR source file type")
    root = IMPORT_DIR.resolve()
    candidate = IMPORT_DIR / name
    if candidate.is_symlink() or not candidate.is_file() or candidate.resolve().parent != root:
        raise HTTPException(404, f"File not found in the StkFlo BMR import folder: {name}")
    if candidate.stat().st_size > limit:
        raise HTTPException(413, f"{name} exceeds StkFlo's source file size limit")
    return candidate.read_bytes()


def _enqueue(username: str, raw: bytes, workbook: bytes | None) -> dict:
    with _lock:
        _purge()
        if sum(j["state"] == "RUNNING" for j in _jobs.values()) >= 2:
            raise HTTPException(429, "Two BMR extraction jobs are already running")
        if any(j["username"] == username and j["state"] == "RUNNING" for j in _jobs.values()):
            raise HTTPException(409, "You already have an active BMR extraction job")
        job_id = uuid4().hex
        _jobs[job_id] = {
            "username": username, "started": datetime.now(timezone.utc),
            "state": "RUNNING", "progress": "Queued for BMR conversion", "result": None
        }
    _executor.submit(_work, job_id, raw, workbook)
    return {"job_id": job_id, "state": "RUNNING"}


@router.get("/server-files")
def server_files(
    _user: User = Depends(require_any_permission("admin.full", "data_migration.view")),
):
    """List permitted input files only; never expose arbitrary server paths."""
    archives, workbooks = [], []
    if IMPORT_DIR.is_dir():
        for file in sorted(IMPORT_DIR.iterdir(), key=lambda p: p.name.casefold()):
            if not file.is_file() or file.is_symlink() or file.name.startswith("."):
                continue
            kind = (archives if file.suffix.casefold() == ".zip"
                    else workbooks if file.suffix.casefold() in {".xlsx", ".xlsm"} else None)
            if kind is not None:
                kind.append({"name": file.name, "size_bytes": file.stat().st_size})
    return {"archives": archives, "workbooks": workbooks}


@router.post("/start-server")
def start_server(
    body: ServerExtractionRequest,
    user: User = Depends(require_any_permission("admin.full", "data_migration.view")),
):
    """Start the same extraction job using a complete ZIP already in Codespaces.

    No browser upload, HTTP multipart transfer, file splitting or chunking.
    """
    raw = _get_server_file(body.archive_name, (".zip",), MAX_SOURCE_BYTES)
    workbook = (_get_server_file(body.product_list_name, (".xlsx", ".xlsm"), 8_000_000)
                if body.product_list_name else None)
    return _enqueue(user.username, raw, workbook)



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
    user: User = Depends(require_any_permission("admin.full", "data_migration.view")),
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
    return _enqueue(user.username, raw, workbook)


@router.get("/{job_id}")
def status(job_id: str,user:User=Depends(require_any_permission("admin.full", "data_migration.view"))):
    with _lock:
        _purge()
        job=_jobs.get(job_id)
        if not job or job["username"]!=user.username:
            raise HTTPException(404,"BMR extraction job not found or expired")
        result=job["result"]
        return {"job_id":job_id,"state":job["state"],"progress":job["progress"],
                "result":result if job["state"]=="COMPLETE" else None}
