from collections.abc import Iterable
from urllib.parse import urlparse

from starlette.datastructures import MutableHeaders
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send


def split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def resolve_trusted_hosts(explicit_hosts: str, cors_origins: str, *, debug: bool) -> list[str]:
    hosts = set(split_csv(explicit_hosts))
    if not hosts:
        for origin in split_csv(cors_origins):
            hostname = urlparse(origin).hostname
            if hostname:
                hosts.add(hostname)
    hosts.update({"127.0.0.1", "localhost", "::1"})
    if debug:
        hosts.add("testserver")
    return sorted(hosts)


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp, *, strict_csp: bool = True) -> None:
        self.app = app
        self.strict_csp = strict_csp

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers.setdefault("X-Content-Type-Options", "nosniff")
                headers.setdefault("X-Frame-Options", "DENY")
                headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
                headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
                headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
                headers.setdefault("X-Permitted-Cross-Domain-Policies", "none")
                headers.setdefault("X-XSS-Protection", "0")
                if self.strict_csp:
                    headers.setdefault(
                        "Content-Security-Policy",
                        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
                    )
                if scope.get("scheme") == "https":
                    headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
                if _is_sensitive_path(str(scope.get("path", ""))):
                    headers.setdefault("Cache-Control", "no-store")
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


class RequestBodyLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        default_max_bytes: int,
        appearance_upload_max_bytes: int,
    ) -> None:
        self.app = app
        self.default_max_bytes = default_max_bytes
        self.appearance_upload_max_bytes = appearance_upload_max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = self._limit_for_path(str(scope.get("path", "")))
        content_length = _content_length(scope)
        if content_length is not None and content_length > limit:
            response = JSONResponse(
                status_code=413,
                content={"detail": {"kind": "request_too_large", "max_bytes": limit}},
            )
            await response(scope, receive, send)
            return

        received = 0

        async def receive_limited() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise HTTPException(
                        status_code=413,
                        detail={"kind": "request_too_large", "max_bytes": limit},
                    )
            return message

        await self.app(scope, receive_limited, send)

    def _limit_for_path(self, path: str) -> int:
        if path == "/api/admin/appearance/background":
            return self.appearance_upload_max_bytes + 1024 * 1024
        return self.default_max_bytes


def _is_sensitive_path(path: str) -> bool:
    prefixes: Iterable[str] = ("/api/auth", "/api/admin", "/api/me")
    return any(path.startswith(prefix) for prefix in prefixes)


def _content_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name.lower() != b"content-length":
            continue
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return None
        return max(0, parsed)
    return None
