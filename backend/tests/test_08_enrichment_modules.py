import pytest
from unittest.mock import patch

@pytest.mark.asyncio
async def test_website_extractor_fallback():
    """Test fallback mechanism when playwright fails."""
    from app.modules.enrichment.website_content_extractor import extract_website_content
    
    # Normally this requires mocking httpx and playwright
    # For a simple structural test, we just ensure it returns the expected dict format
    
    with patch("app.modules.enrichment.website_content_extractor.async_playwright") as MockPlaywright:
        MockPlaywright.side_effect = Exception("Playwright failed")
        
        with patch("app.modules.enrichment.website_content_extractor.httpx.AsyncClient") as MockHttpc:
            client_instance = MockHttpc.return_value.__aenter__.return_value
            client_instance.get.return_value.text = "<html><title>Test Page</title></html>"
            client_instance.get.return_value.raise_for_status.return_value = None
            
            result = await extract_website_content("http://example.com")
            assert result["page_title"] == "Test Page"
            assert "is_mobile_responsive" in result
