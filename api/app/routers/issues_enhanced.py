from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import User
from ..schemas import (
    CancelledBatchCreate,
    IssueBatchCreate,
    IssueBatchOut,
    IssueOut,
    IssueUpdate,
)
from ..security import require_permission
from . import issues as legacy_issues


router = APIRouter(prefix="/issues", tags=["issues"])


class CustomerIssueBatchCreate(IssueBatchCreate):
    customer_name: Optional[str] = Field(None, max_length=255)


class CustomerCancelledBatchCreate(CancelledBatchCreate):
    customer_name: Optional[str] = Field(None, max_length=255)


class CustomerIssueUpdate(IssueUpdate):
    customer_name: Optional[str] = Field(None, max_length=255)


class CustomerIssueOut(IssueOut):
    customer_name: Optional[str] = None


class CustomerIssueBatchOut(IssueBatchOut):
    issues: List[CustomerIssueOut]


def _clean_customer(value: str | None) -> str | None:
    cleaned = (value or "").strip()
    return cleaned or None


def _persist_group_customer(
    db: Session,
    consumption_group_id: str,
    customer_name: str | None,
) -> None:
    customer = _clean_customer(customer_name)
    db.execute(
        text(
            """
            UPDATE consumption_batches
            SET customer_name = :customer_name,
                updated_at = now()
            WHERE consumption_group_id = :group_id
            """
        ),
        {"customer_name": customer, "group_id": consumption_group_id},
    )
    db.execute(
        text(
            """
            UPDATE stock_transactions
            SET customer_name = :customer_name
            WHERE consumption_group_id = :group_id
            """
        ),
        {"customer_name": customer, "group_id": consumption_group_id},
    )
    db.commit()


def _customer_map(db: Session, group_ids: set[str]) -> dict[str, str | None]:
    if not group_ids:
        return {}
    statement = text(
        """
        SELECT consumption_group_id, customer_name
        FROM consumption_batches
        WHERE consumption_group_id IN :group_ids
        """
    ).bindparams(bindparam("group_ids", expanding=True))
    rows = db.execute(statement, {"group_ids": sorted(group_ids)}).mappings()
    return {str(row["consumption_group_id"]): row["customer_name"] for row in rows}


def _enhanced_issue(issue: IssueOut, customer_name: str | None) -> CustomerIssueOut:
    payload = issue.model_dump()
    payload["customer_name"] = customer_name
    return CustomerIssueOut.model_validate(payload)


@router.post("/batch", response_model=CustomerIssueBatchOut, status_code=201)
def create_issue_batch_with_customer(
    payload: CustomerIssueBatchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.create")),
) -> CustomerIssueBatchOut:
    legacy_payload = IssueBatchCreate.model_validate(
        payload.model_dump(exclude={"customer_name"})
    )
    result = legacy_issues.create_issue_batch(payload=legacy_payload, db=db, user=user)
    customer = _clean_customer(payload.customer_name)
    _persist_group_customer(db, result.consumption_group_id, customer)
    return CustomerIssueBatchOut(
        consumption_group_id=result.consumption_group_id,
        issues=[_enhanced_issue(issue, customer) for issue in result.issues],
    )


@router.post("/batch/cancelled", response_model=CustomerIssueBatchOut, status_code=201)
def create_cancelled_batch_with_customer(
    payload: CustomerCancelledBatchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.record_cancelled_bmr")),
) -> CustomerIssueBatchOut:
    legacy_payload = CancelledBatchCreate.model_validate(
        payload.model_dump(exclude={"customer_name"})
    )
    result = legacy_issues.create_cancelled_batch(payload=legacy_payload, db=db, user=user)
    customer = _clean_customer(payload.customer_name)
    _persist_group_customer(db, result.consumption_group_id, customer)
    return CustomerIssueBatchOut(
        consumption_group_id=result.consumption_group_id,
        issues=[_enhanced_issue(issue, customer) for issue in result.issues],
    )


@router.get("/", response_model=List[CustomerIssueOut])
def list_issues_with_customer(
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.view")),
) -> List[CustomerIssueOut]:
    results = legacy_issues.list_issues(limit=limit, db=db, _=user)
    group_ids = {
        str(issue.consumption_group_id)
        for issue in results
        if issue.consumption_group_id
    }
    customers = _customer_map(db, group_ids)
    return [
        _enhanced_issue(
            issue,
            customers.get(str(issue.consumption_group_id))
            if issue.consumption_group_id
            else None,
        )
        for issue in results
    ]


@router.put("/{issue_id}", response_model=CustomerIssueOut)
def update_issue_with_customer(
    issue_id: int,
    payload: CustomerIssueUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("issues.edit")),
) -> CustomerIssueOut:
    legacy_payload = IssueUpdate.model_validate(
        payload.model_dump(exclude={"customer_name"})
    )
    result = legacy_issues.update_issue(
        issue_id=issue_id,
        payload=legacy_payload,
        db=db,
        user=user,
    )
    customer = _clean_customer(payload.customer_name)
    if result.consumption_group_id:
        _persist_group_customer(db, result.consumption_group_id, customer)
    else:
        db.execute(
            text("UPDATE stock_transactions SET customer_name=:customer WHERE id=:issue_id"),
            {"customer": customer, "issue_id": issue_id},
        )
        db.commit()
    return _enhanced_issue(result, customer)
