from fastapi import APIRouter

from app.api.routes import admin, appearance, auth, buildings, health, me


api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(appearance.router, prefix="/api", tags=["appearance"])
api_router.include_router(buildings.router, prefix="/api", tags=["buildings"])
api_router.include_router(auth.router, prefix="/api/auth", tags=["auth"])
api_router.include_router(me.router, prefix="/api/me", tags=["me"])
api_router.include_router(admin.router, prefix="/api/admin", tags=["admin"])
