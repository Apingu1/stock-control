from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import get_db  # noqa: F401
from .models import Base  # noqa: F401
from .routers import materials, receipts, issues, lot_balances, summary


app = FastAPI(title="Stock Control API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # DEV ONLY – we’ll tighten this later
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(materials.router)
app.include_router(receipts.router)
app.include_router(issues.router)
app.include_router(lot_balances.router)
app.include_router(summary.router)


@app.get("/health")
def health():
    return {"ok": True, "service": "stock-control"}




