# api/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Create app FIRST
app = FastAPI(title="Stock Control API")

# CORS (DEV-friendly, Codespaces-safe)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    # Allow any Codespaces origin like:
    # https://<name>-5173.app.github.dev
    allow_origin_regex=r"^https:\/\/.*\.app\.github\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure DB/models are imported so metadata exists (if needed elsewhere)
from .db import get_db  # noqa: F401,E402
from .models import Base  # noqa: F401,E402

# Routers
from .routers import materials, receipts, issues, lot_balances, summary  # noqa: E402
from .routers import auth, admin  # noqa: E402

# Core app routes
app.include_router(materials.router)
app.include_router(receipts.router)
app.include_router(issues.router)
app.include_router(lot_balances.router)
app.include_router(summary.router)

# Phase A: auth + admin
app.include_router(auth.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "stock-control"}
