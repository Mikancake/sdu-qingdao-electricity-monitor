from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.admin_user import AdminUser
from app.models.user import User


bearer_scheme = HTTPBearer(auto_error=False)


def db_session() -> Generator[Session, None, None]:
    yield from get_db()


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(db_session),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired token")
    if payload.get("kind", "user") != "user":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid user token")

    user = db.get(User, int(payload["sub"]))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user not found")
    return user


def verified_user(user: User = Depends(current_user)) -> User:
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="email not verified")
    return user


def current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(db_session),
) -> AdminUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    payload = decode_access_token(credentials.credentials)
    if payload is None or payload.get("kind") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid or expired admin token")

    admin = db.get(AdminUser, int(payload["sub"]))
    if admin is None or not admin.enabled:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="admin not found")
    return admin
