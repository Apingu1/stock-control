# api/app/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Stock Control API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_origin_regex=r"^https:\/\/.*\.app\.github\.dev$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from .db import get_db  # noqa: F401,E402
from .models import Base  # noqa: F401,E402

from .routers import materials, receipts, issues, lot_balances, summary  # noqa: E402
from .routers import auth, admin  # noqa: E402
from .routers import audit  # ✅ NEW (additive)

app.include_router(materials.router)
app.include_router(receipts.router)
app.include_router(issues.router)
app.include_router(lot_balances.router)
app.include_router(summary.router)

app.include_router(auth.router)
app.include_router(admin.router)

# ✅ Audit API (read model for UI)
app.include_router(audit.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "stock-control"}
