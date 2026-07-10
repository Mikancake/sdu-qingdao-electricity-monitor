from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.core.http_security import RequestBodyLimitMiddleware, SecurityHeadersMiddleware, resolve_trusted_hosts


def test_trusted_hosts_are_derived_from_cors_origins() -> None:
    hosts = resolve_trusted_hosts("", "http://192.0.2.10,https://monitor.example.edu", debug=False)

    assert "192.0.2.10" in hosts
    assert "monitor.example.edu" in hosts
    assert "localhost" in hosts
    assert "*" not in hosts


def test_security_headers_and_sensitive_cache_policy() -> None:
    app = FastAPI()
    app.add_middleware(SecurityHeadersMiddleware, strict_csp=True)

    @app.get("/api/auth/example")
    def example() -> dict[str, bool]:
        return {"ok": True}

    response = TestClient(app).get("/api/auth/example")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_request_body_limit_rejects_oversized_payload() -> None:
    app = FastAPI()
    app.add_middleware(
        RequestBodyLimitMiddleware,
        default_max_bytes=16,
        appearance_upload_max_bytes=32,
    )

    @app.post("/api/example")
    async def example(request: Request) -> dict[str, int]:
        return {"size": len(await request.body())}

    response = TestClient(app).post("/api/example", content=b"x" * 17)

    assert response.status_code == 413
    assert response.json()["detail"]["kind"] == "request_too_large"

    misleading_length = TestClient(app).post(
        "/api/example",
        content=b"x" * 17,
        headers={"Content-Length": "1"},
    )
    assert misleading_length.status_code == 413
