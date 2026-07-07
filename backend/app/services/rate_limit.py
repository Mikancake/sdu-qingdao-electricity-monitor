import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import HTTPException, Request


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int) -> int | None:
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return max(1, int(window_seconds - (now - events[0])))
            events.append(now)
        return None

    def clear_matching(
        self,
        *,
        bucket: str | None = None,
        client_ip: str | None = None,
        identity: str | None = None,
    ) -> int:
        normalized_bucket = bucket.strip().lower() if bucket else None
        normalized_ip = client_ip.strip().lower() if client_ip else None
        normalized_identity = identity.strip().lower() if identity else None
        with self._lock:
            keys = list(self._events.keys())
            matched_keys = []
            for key in keys:
                normalized_key = key.lower()
                if normalized_bucket and not normalized_key.startswith(f"{normalized_bucket}:"):
                    continue
                if normalized_ip and f":{normalized_ip}" not in normalized_key:
                    continue
                if normalized_identity and normalized_identity not in normalized_key:
                    continue
                matched_keys.append(key)
            for key in matched_keys:
                self._events.pop(key, None)
            return len(matched_keys)


limiter = InMemoryRateLimiter()


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client is not None:
        return request.client.host
    return "unknown"


def rate_limit_key(request: Request, bucket: str, *parts: object) -> str:
    identity = ":".join(str(part).strip().lower() for part in parts if part is not None)
    return f"{bucket}:{get_client_ip(request)}:{identity}"


def enforce_rate_limit(key: str, *, limit: int, window_seconds: int) -> None:
    retry_after_seconds = limiter.hit(key, limit=limit, window_seconds=window_seconds)
    if retry_after_seconds is None:
        return
    raise HTTPException(
        status_code=429,
        detail={
            "kind": "rate_limited",
            "message": "too many requests",
            "retry_after_seconds": retry_after_seconds,
        },
        headers={"Retry-After": str(retry_after_seconds)},
    )
