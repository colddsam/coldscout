from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_pipeline_status_unauthorized():
    response = client.get("/api/v1/pipeline/status")
    assert response.status_code == 403

def test_pipeline_trigger_unauthorized():
    response = client.post("/api/v1/pipeline/trigger")
    assert response.status_code == 403
    
# In a real environment with the API key, these tests would assert 200/202 status codes
