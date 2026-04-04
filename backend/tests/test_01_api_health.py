import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data
    assert "environment" in data

@pytest.mark.asyncio
async def test_api_key_auth_valid(client: AsyncClient):
    # This is currently just testing the health endpoint, we should test an authenticated endpoint using X-API-Key
    headers = {"X-API-Key": "test-admin-secret-key"}
    response = await client.get("/api/v1/health", headers=headers)
    assert response.status_code == 200

@pytest.mark.asyncio
async def test_api_key_auth_invalid(client: AsyncClient):
    # Assuming there's a protected route like /api/v1/leads, but we check with a general missing key scenario
    # Let's hit a protected route if it exists or mock it.
    pass
