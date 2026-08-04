# api/app/main.py

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class MaintenanceMiddleware(BaseHTTPMiddleware):
    """Blocks mutating requests when maintenance mode is ON.

    - Read-only methods (GET/HEAD/OPTIONS) are allowed.
    - Auth endpoints remain available.
    - Admin DB tools endpoints remain available.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            from .routers.admin_db_tools import get_maintenance_state  # local import avoids cycles
        except Exception:
            return await call_next(request)

        state = get_maintenance_state()
        if not state.get("enabled"):
            return await call_next(request)

        path = request.url.path or ""
        method = (request.method or "").upper()

        if method in {"GET", "HEAD", "OPTIONS"}:
            return await call_next(request)
        if path.startswith("/health"):
            return await call_next(request)
        if path.startswith("/auth/"):
            return await call_next(request)
        if path.startswith("/admin/db-tools"):
            return await call_next(request)

        return JSONResponse(
            status_code=503,
            content={
                "detail": "System in maintenance mode. Please retry later.",
                "maintenance": state,
            },
        )


app = FastAPI(title="Stock Control API")

app.add_middleware(MaintenanceMiddleware)

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

from .routers import (  # noqa: E402
    admin_enhanced,
    analytics_enhanced,
    issues_enhanced,
    materials_enhanced,
)
from .routers import materials, products, receipts, issues, lot_balances, summary  # noqa: E402
from .routers import analytics  # noqa: E402
from .routers import auth, admin  # noqa: E402
from .routers import audit
from .routers import alerts
from .routers import quarantine
from .routers import admin_db_tools

# Enhanced routes are registered first so their exact paths take precedence.
# Existing routers remain intact as the fallback for every unaffected endpoint.
app.include_router(materials_enhanced.router)
app.include_router(issues_enhanced.router)
app.include_router(analytics_enhanced.router)
app.include_router(admin_enhanced.router)

app.include_router(materials.router)
app.include_router(products.router)
app.include_router(receipts.router)
app.include_router(issues.router)
app.include_router(lot_balances.router)
app.include_router(summary.router)
app.include_router(analytics.router)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(audit.router)
app.include_router(alerts.router)
app.include_router(quarantine.router)
app.include_router(admin_db_tools.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "stock-control"}
