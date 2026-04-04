import pytest
from unittest.mock import patch, AsyncMock

@pytest.mark.asyncio
async def test_classify_reply():
    """Test reply classification with a mock LLM response."""
    from app.modules.tracking.reply_classifier import classify_reply
    
    mock_response = {
        "classification": "interested",
        "confidence": 0.95,
        "key_signal": "asked for pricing"
    }
    
    with patch("app.modules.tracking.reply_classifier.GroqClient") as MockClient:
        instance = MockClient.return_value
        instance.client.chat.completions.create = AsyncMock()
        instance.client.chat.completions.create.return_value.choices = [
            type("obj", (object,), {"message": type("obj", (object,), {"content": '{"classification": "interested", "confidence": 0.95, "key_signal": "asked for pricing"}'})})()
        ]
        
        result = await classify_reply("Can you send me your pricing?", "Re: Web design")
        assert result["classification"] == "interested"
        assert result["confidence"] == 0.95
