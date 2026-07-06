from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.models.check_attempt import CheckAttempt
from app.models.email_verification_code import EmailVerificationCode
from app.models.notification import Notification
from app.models.user import User
from app.models.user_room import UserRoom


def delete_user_account(db: Session, user: User) -> None:
    binding_ids = list(db.scalars(select(UserRoom.id).where(UserRoom.user_id == user.id)))

    db.execute(update(CheckAttempt).where(CheckAttempt.user_id == user.id).values(user_id=None))
    if binding_ids:
        db.execute(update(CheckAttempt).where(CheckAttempt.user_room_id.in_(binding_ids)).values(user_room_id=None))

    db.execute(delete(Notification).where(Notification.user_id == user.id))
    db.execute(delete(UserRoom).where(UserRoom.user_id == user.id))
    db.execute(delete(EmailVerificationCode).where(EmailVerificationCode.email == user.email))
    db.delete(user)
