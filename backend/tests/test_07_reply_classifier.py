import pytest
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_classify_reply():
    """Test reply classification with a mock LLM response.

    The classifier now uses ``with_key_failover`` + a fresh AsyncGroq client
    per call instead of a shared ``GroqClient.client`` instance. The test
    patches ``AsyncGroq`` at the import site of ``reply_classifier`` so the
    failover wrapper receives our mock and never reaches the network.
    """
    from app.modules.tracking.reply_classifier import classify_reply

    fake_completion = type(
        "obj",
        (object,),
        {
            "choices": [
                type(
                    "obj",
                    (object,),
                    {
                        "message": type(
                            "obj",
                            (object,),
                            {
                                "content": '{"classification": "interested", "confidence": 0.95, "key_signal": "asked for pricing"}'
                            },
                        )
                    },
                )()
            ]
        },
    )()

    with patch("app.modules.tracking.reply_classifier.AsyncGroq") as MockGroq:
        instance = MockGroq.return_value
        instance.chat.completions.create = AsyncMock(return_value=fake_completion)

        result = await classify_reply("Can you send me your pricing?", "Re: Web design")
        assert result["classification"] == "interested"
        assert result["confidence"] == 0.95
