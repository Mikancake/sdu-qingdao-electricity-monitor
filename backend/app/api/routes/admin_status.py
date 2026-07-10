from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import current_admin, db_session
from app.models.admin_user import AdminUser
from app.schemas.admin import AdminStatusOut
from app.services.admin_stats import build_admin_status


router = APIRouter()


@router.get("/status", response_model=AdminStatusOut)
def get_admin_status(
    _: AdminUser = Depends(current_admin),
    db: Session = Depends(db_session),
) -> AdminStatusOut:
    return build_admin_status(db)
