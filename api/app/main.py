from fastapi import FastAPI

from .db import get_db  # noqa: F401
from .models import Base  # noqa: F401
from .routers import materials, receipts, issues, lot_balances

app = FastAPI(title="Stock Control API")

app.include_router(materials.router)
app.include_router(receipts.router)
app.include_router(issues.router)
app.include_router(lot_balances.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "stock-control"}
