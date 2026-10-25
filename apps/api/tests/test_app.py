async def test_openapi_served(client):
    r = await client.get("/openapi.json")
    assert r.status_code == 200
    paths = r.json()["paths"]
    for p in ("/api/v1/health", "/api/v1/auth/login", "/api/v1/venues", "/api/v1/owner/venues", "/api/v1/admin/users"):
        assert p in paths


async def test_health_hits_database(client):
    r = await client.get("/api/v1/health")
    assert r.json() == {"status": "ok", "database": "up"}


async def test_validation_errors_are_structured(client):
    r = await client.post("/api/v1/auth/register", json={"email": "nope", "password": "x", "full_name": ""})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert {d["field"] for d in body["details"]} >= {"email", "password"}
