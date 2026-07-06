from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class EmailVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)


class NotificationEmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)


class NotificationEmailVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=4, max_length=12)


class UserPreferencesUpdate(BaseModel):
    notify_cooldown_hours: int | None = Field(default=None, ge=0, le=24 * 30)
    daily_report_enabled: bool | None = None
    daily_report_interval_days: int | None = Field(default=None, ge=1, le=30)


class VerificationCodeOut(BaseModel):
    email: str
    dev_verification_code: str | None = None
    email_sent: bool = False


class UserOut(BaseModel):
    id: int
    email: str
    is_verified: bool
    notification_email: str | None = None
    notification_email_verified: bool = False
    manual_check_cooldown_seconds: int | None = None
    notify_cooldown_hours: int | None = None
    test_email_sent_at: datetime | None = None
    daily_report_enabled: bool = True
    daily_report_interval_days: int = 1
    daily_report_last_sent_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RegisterOut(BaseModel):
    user: UserOut | None = None
    dev_verification_code: str | None = None
    email_sent: bool = False


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TestEmailOut(BaseModel):
    email: str
    email_sent: bool = False
