from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_user, db_session
from app.core.config import settings
from app.core.security import generate_numeric_code, hash_password, sign_access_token, verify_password
from app.models.email_verification_code import EmailVerificationCode
from app.models.user import User
from app.schemas.auth import EmailVerifyRequest, RegisterOut, TokenOut, UserCreate, UserLogin, UserOut
from app.services.emailer import send_verification_code
from app.services.users import delete_user_account


router = APIRouter()
VERIFICATION_EMAIL_COOLDOWN = timedelta(minutes=30)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def ensure_email_shape(email: str) -> None:
    if "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="invalid email")


def create_verification_code(
    db: Session,
    email: str,
    purpose: str = "register",
    password_hash: str | None = None,
) -> tuple[EmailVerificationCode, str]:
    code = generate_numeric_code()
    record = EmailVerificationCode(
        email=email,
        code_hash=hash_password(code),
        password_hash=password_hash,
        purpose=purpose,
        expires_at=datetime.now() + timedelta(minutes=15),
    )
    db.add(record)
    return record, code


def consume_pending_register_codes(db: Session, email: str) -> None:
    db.execute(
        update(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == "register",
            EmailVerificationCode.consumed_at.is_(None),
        )
        .values(consumed_at=datetime.now())
    )


def clean_legacy_unverified_user(db: Session, user: User | None) -> None:
    if user is not None and not user.is_verified:
        delete_user_account(db, user)


def ensure_verification_email_not_cooling(db: Session, email: str, purpose: str) -> None:
    now = datetime.now()
    latest_delivered_at = db.scalar(
        select(EmailVerificationCode.delivered_at)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == purpose,
            EmailVerificationCode.delivered_at.is_not(None),
        )
        .order_by(EmailVerificationCode.delivered_at.desc())
        .limit(1)
    )
    if latest_delivered_at is None:
        return
    available_at = latest_delivered_at + VERIFICATION_EMAIL_COOLDOWN
    if now < available_at:
        raise HTTPException(
            status_code=429,
            detail={
                "kind": "verification_email_cooldown",
                "message": "verification email is cooling down",
                "retry_after_seconds": max(1, int((available_at - now).total_seconds())),
                "available_at": available_at.isoformat(),
            },
        )


def mark_verification_email_delivered(db: Session, record: EmailVerificationCode, email_sent: bool) -> None:
    if email_sent:
        record.delivered_at = datetime.now()
        db.commit()


def deliver_verification_code(email: str, code: str) -> bool:
    result = send_verification_code(email, code)
    if not result.ok and not settings.debug:
        raise HTTPException(status_code=503, detail=f"verification email failed: {result.error}")
    return result.ok


@router.post("/register", response_model=RegisterOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(db_session)) -> RegisterOut:
    email = normalize_email(payload.email)
    ensure_email_shape(email)
    existing_user = db.scalar(select(User).where(User.email == email))
    if existing_user is not None and existing_user.is_verified:
        raise HTTPException(status_code=409, detail="email already registered")

    ensure_verification_email_not_cooling(db, email, "register")
    clean_legacy_unverified_user(db, existing_user)
    consume_pending_register_codes(db, email)
    try:
        record, code = create_verification_code(db, email, password_hash=hash_password(payload.password))
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="email already registered") from exc
    email_sent = deliver_verification_code(email, code)
    mark_verification_email_delivered(db, record, email_sent)
    return RegisterOut(dev_verification_code=code if settings.debug else None, email_sent=email_sent)


@router.post("/request-verification-code", response_model=RegisterOut)
def request_verification_code(payload: UserLogin, db: Session = Depends(db_session)) -> RegisterOut:
    email = normalize_email(payload.email)
    ensure_email_shape(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        if not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="invalid email or password")
        if not user.is_verified:
            clean_legacy_unverified_user(db, user)
        else:
            return RegisterOut(user=user, dev_verification_code=None)

    ensure_verification_email_not_cooling(db, email, "register")
    consume_pending_register_codes(db, email)
    record, code = create_verification_code(db, email, password_hash=hash_password(payload.password))
    db.commit()
    email_sent = deliver_verification_code(email, code)
    mark_verification_email_delivered(db, record, email_sent)
    return RegisterOut(dev_verification_code=code if settings.debug else None, email_sent=email_sent)


@router.post("/verify-email", response_model=UserOut)
def verify_email(payload: EmailVerifyRequest, db: Session = Depends(db_session)) -> User:
    email = normalize_email(payload.email)
    ensure_email_shape(email)
    now = datetime.now()
    stmt = (
        select(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == "register",
            EmailVerificationCode.consumed_at.is_(None),
            EmailVerificationCode.expires_at >= now,
        )
        .order_by(EmailVerificationCode.created_at.desc())
        .limit(5)
    )
    records = list(db.scalars(stmt))
    matched = next((record for record in records if verify_password(payload.code, record.code_hash)), None)
    if matched is None:
        raise HTTPException(status_code=400, detail="invalid or expired verification code")

    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        if matched.password_hash is None:
            raise HTTPException(status_code=400, detail="registration code is no longer valid")
        user = User(email=email, password_hash=matched.password_hash, is_verified=True)
        db.add(user)
    else:
        user.is_verified = True
    user.notification_email = user.email
    user.notification_email_verified_at = now
    db.execute(
        update(EmailVerificationCode)
        .where(
            EmailVerificationCode.email == email,
            EmailVerificationCode.purpose == "register",
            EmailVerificationCode.consumed_at.is_(None),
        )
        .values(consumed_at=now)
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="email already registered") from exc
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(db_session)) -> TokenOut:
    email = normalize_email(payload.email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="invalid email or password")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="email not verified")
    return TokenOut(access_token=sign_access_token(user.id, kind="user"), user=user)


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(current_user)) -> User:
    return user
