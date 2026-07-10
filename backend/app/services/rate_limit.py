import time
from collections import OrderedDict, deque
from functools import lru_cache
from ipaddress import IPv4Address, IPv6Address, ip_address, ip_network
from threading import Lock

from fastapi import HTTPException, Request

from app.core.config import settings


class InMemoryRateLimiter:
    def __init__(self, *, max_keys: int = 50_000, stale_after_seconds: int = 24 * 60 * 60) -> None:
        self._events: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = Lock()
        self._max_keys = max_keys
        self._stale_after_seconds = stale_after_seconds
        self._operations = 0

    def hit(self, key: str, *, limit: int, window_seconds: int) -> int | None:
        if limit < 1 or window_seconds < 1:
            raise ValueError("rate limit and window must be positive")
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            self._operations += 1
            if self._operations % 256 == 0:
                self._remove_stale_keys(now)
            if key not in self._events and len(self._events) >= self._max_keys:
                self._remove_stale_keys(now)
                if len(self._events) >= self._max_keys:
                    self._events.popitem(last=False)
            events = self._events.setdefault(key, deque())
            self._events.move_to_end(key)
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= limit:
                return max(1, int(window_seconds - (now - events[0])))
            events.append(now)
        return None

    def _remove_stale_keys(self, now: float) -> None:
        cutoff = now - self._stale_after_seconds
        stale_keys = [key for key, events in self._events.items() if not events or events[-1] <= cutoff]
        for key in stale_keys:
            self._events.pop(key, None)

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


@lru_cache(maxsize=16)
def _trusted_proxy_networks(raw_value: str):
    networks = []
    for item in raw_value.split(","):
        value = item.strip()
        if not value:
            continue
        try:
            networks.append(ip_network(value, strict=False))
        except ValueError:
            continue
    return tuple(networks)


def _parse_ip(value: str | None) -> IPv4Address | IPv6Address | None:
    if not value:
        return None
    candidate = value.strip()
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1 : candidate.index("]")]
    try:
        return ip_address(candidate)
    except ValueError:
        return None


def _is_trusted_proxy(address: IPv4Address | IPv6Address) -> bool:
    networks = _trusted_proxy_networks(settings.trusted_proxy_cidrs)
    return any(address.version == network.version and address in network for network in networks)


def get_client_ip(request: Request) -> str:
    peer = _parse_ip(request.client.host if request.client is not None else None)
    if peer is None:
        return "unknown"

    if _is_trusted_proxy(peer):
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            chain = [_parse_ip(item) for item in forwarded_for.split(",")]
            for address in reversed([item for item in chain if item is not None]):
                if not _is_trusted_proxy(address):
                    return str(address)

        real_ip = _parse_ip(request.headers.get("x-real-ip"))
        if real_ip is not None and not _is_trusted_proxy(real_ip):
            return str(real_ip)

    return str(peer)


def account_rate_limit_key(bucket: str, *parts: object) -> str:
    identity = ":".join(str(part).strip().lower() for part in parts if part is not None)
    return f"{bucket}:account:{identity}"


def client_rate_limit_key(request: Request, bucket: str) -> str:
    return f"{bucket}:{get_client_ip(request)}:all"


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
