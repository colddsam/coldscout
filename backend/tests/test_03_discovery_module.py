import pytest
from unittest.mock import patch, MagicMock
from app.modules.discovery.google_places import GooglePlacesClient
from app.modules.discovery.scraper import scrape_contact_email

@pytest.mark.asyncio
async def test_search_places_mock():
    with patch("app.modules.discovery.google_places.httpx.AsyncClient.post") as mock_post:
        # Mocking the response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "places": [
                {"id": "123", "displayName": {"text": "Mock Business 1"}},
                {"id": "456", "displayName": {"text": "Mock Business 2"}}
            ]
        }
        mock_post.return_value = mock_response

        client = GooglePlacesClient()
        results = await client.search_places(category="Web designers", location="New York, NY")
        
        assert len(results) == 2
        assert results[0]["displayName"]["text"] == "Mock Business 1"
        assert results[1]["id"] == "456"

from app.modules.discovery.scraper import scrape_contact_email

@pytest.mark.asyncio
async def test_scraper_mock():
    # Example test mocking playwright or requests depending on the scraper implementation
    # We will mock the external call to avoid hitting real websites
    with patch("app.modules.discovery.scraper.httpx.AsyncClient.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "<html><body>Contact us at contact@test.com and ignore example@sentry.io</body></html>"
        mock_get.return_value = mock_response

        result = await scrape_contact_email("https://example.com")
        
        assert result == "contact@test.com"
