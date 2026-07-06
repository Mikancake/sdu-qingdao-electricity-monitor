from pydantic import BaseModel


class RuntimeLimitsOut(BaseModel):
    manual_check_cooldown_seconds: int
    notify_cooldown_hours: int
