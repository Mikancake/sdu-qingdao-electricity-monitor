from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import db_session
from app.schemas.appearance import AppearanceSettingsOut
from app.services.appearance import get_appearance_settings


router = APIRouter()


@router.get("/appearance", response_model=AppearanceSettingsOut)
def get_public_appearance_settings(db: Session = Depends(db_session)) -> AppearanceSettingsOut:
    return get_appearance_settings(db)
