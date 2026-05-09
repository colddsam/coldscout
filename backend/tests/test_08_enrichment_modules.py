import pytest
from unittest.mock import patch, MagicMock

@pytest.mark.asyncio
async def test_website_extractor_fallback():
    """Test fallback mechanism when playwright fails."""
    from app.modules.enrichment.website_content_extractor import extract_website_content
    
    # Normally this requires mocking httpx and playwright
    # For a simple structural test, we just ensure it returns the expected dict format
    
    with patch("app.modules.enrichment.website_content_extractor.async_playwright") as MockPlaywright:
        MockPlaywright.side_effect = Exception("Playwright failed")
        
        # Patch safe_fetch directly in the extractor module
        with patch("app.modules.enrichment.website_content_extractor.safe_fetch") as mock_safe_fetch:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = "<html><title>Test Page</title></html>"
            mock_safe_fetch.return_value = (mock_response, ["http://example.com"])
            
            result = await extract_website_content("http://example.com")
            assert result["page_title"] == "Test Page"
            assert "is_mobile_responsive" in result
