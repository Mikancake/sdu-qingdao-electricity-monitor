from fastapi import APIRouter

from app.electricity.buildings import selectable_buildings
from app.schemas.room import BuildingOut


router = APIRouter()


@router.get("/buildings", response_model=list[BuildingOut])
def list_buildings() -> list[BuildingOut]:
    return [
        BuildingOut(key=item.key, name=item.name, param=item.param, provider=item.provider)
        for item in selectable_buildings()
    ]
