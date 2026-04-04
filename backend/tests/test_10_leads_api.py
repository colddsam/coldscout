from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_leads_unauthorized():
    response = client.get("/api/v1/leads")
    assert response.status_code == 403

def test_get_campaigns_unauthorized():
    response = client.get("/api/v1/campaigns")
    assert response.status_code == 403
