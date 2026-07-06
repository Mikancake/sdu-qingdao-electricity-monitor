from fastapi import APIRouter

from app.electricity.buildings import BUILDINGS
from app.schemas.room import BuildingOut


router = APIRouter()


@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings() -> list[BuildingOut]:
    return [BuildingOut(key=item.key, name=item.name, param=item.param) for item in BUILDINGS]
