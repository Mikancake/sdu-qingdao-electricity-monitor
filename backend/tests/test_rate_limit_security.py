from starlette.requests import Request

from app.core.config import settings
from app.services.rate_limit import InMemoryRateLimiter, _trusted_proxy_networks, account_rate_limit_key, get_client_ip


def make_request(client_ip: str, **headers: str) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(key.lower().encode("ascii"), value.encode("ascii")) for key, value in headers.items()],
        "client": (client_ip, 12345),
        "server": ("testserver", 80),
    }
    return Request(scope)


def set_trusted_proxies(monkeypatch, value: str) -> None:
    monkeypatch.setattr(settings, "trusted_proxy_cidrs", value)
    _trusted_proxy_networks.cache_clear()


def test_untrusted_peer_cannot_spoof_forwarded_headers(monkeypatch) -> None:
    set_trusted_proxies(monkeypatch, "127.0.0.1/32")
    request = make_request(
        "198.51.100.20",
        **{"x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.98"},
    )

    assert get_client_ip(request) == "198.51.100.20"


def test_trusted_proxy_uses_nearest_untrusted_address(monkeypatch) -> None:
    set_trusted_proxies(monkeypatch, "127.0.0.1/32")
    request = make_request("127.0.0.1", **{"x-forwarded-for": "203.0.113.99, 198.51.100.20"})

    assert get_client_ip(request) == "198.51.100.20"


def test_trusted_proxy_chain_skips_known_intermediate_proxies(monkeypatch) -> None:
    set_trusted_proxies(monkeypatch, "127.0.0.1/32,10.0.0.0/8")
    request = make_request("127.0.0.1", **{"x-forwarded-for": "203.0.113.99, 10.2.3.4"})

    assert get_client_ip(request) == "203.0.113.99"


def test_account_limit_key_does_not_depend_on_client_ip() -> None:
    assert account_rate_limit_key("auth:login", "User@Example.com") == "auth:login:account:user@example.com"


def test_rate_limiter_caps_unique_keys() -> None:
    test_limiter = InMemoryRateLimiter(max_keys=2)

    test_limiter.hit("first", limit=2, window_seconds=60)
    test_limiter.hit("second", limit=2, window_seconds=60)
    test_limiter.hit("third", limit=2, window_seconds=60)

    assert len(test_limiter._events) == 2
    assert "third" in test_limiter._events
