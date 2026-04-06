"""
Tests for the Demo Website Builder feature.

Covers:
  1. Brand blueprint extraction (mocked Groq)
  2. Gemini HTML generation (mocked Gemini)
  3. HTML validation and sanitization
  4. Full orchestrator pipeline with failure isolation
  5. Public demo serving endpoint with CSP headers
  6. Pipeline integration — demo failure doesn't block email flow
"""
import uuid
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from app.modules.demo_builder.generator import (
    _validate_html,
    _sanitize_html,
    generate_demo_for_lead,
)


# ── HTML Validation Tests ────────────────────────────────────────────────────

class TestHTMLValidation:
    def test_valid_html(self):
        html = '<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>'
        assert _validate_html(html) is True

    def test_empty_html(self):
        assert _validate_html("") is False
        assert _validate_html(None) is False

    def test_too_short(self):
        assert _validate_html("<html>short</html>") is False

    def test_missing_doctype(self):
        html = '<html><head></head><body>' + 'x' * 200 + '</body></html>'
        assert _validate_html(html) is False

    def test_missing_body(self):
        html = '<!DOCTYPE html><html><head></head>' + 'x' * 200 + '</html>'
        assert _validate_html(html) is False

    def test_size_limit(self):
        html = '<!DOCTYPE html><html><head></head><body>' + 'x' * 600_000 + '</body></html>'
        assert _validate_html(html) is False


# ── HTML Sanitization Tests ──────────────────────────────────────────────────

class TestHTMLSanitization:
    def test_preserves_tailwind_cdn(self):
        html = '<script src="https://cdn.tailwindcss.com"></script>'
        assert 'cdn.tailwindcss.com' in _sanitize_html(html)

    def test_preserves_alpine_cdn(self):
        html = '<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>'
        assert 'alpinejs' in _sanitize_html(html)

    def test_strips_malicious_script(self):
        html = '<script>alert("xss")</script>'
        result = _sanitize_html(html)
        assert 'alert' not in result

    def test_strips_external_tracker(self):
        html = '<script src="https://evil-tracker.com/track.js"></script>'
        result = _sanitize_html(html)
        assert 'evil-tracker' not in result

    def test_preserves_tailwind_config(self):
        html = '<script>tailwind.config = { theme: {} }</script>'
        result = _sanitize_html(html)
        assert 'tailwind.config' in result


# ── Orchestrator Tests (Mocked) ─────────────────────────────────────────────

class TestDemoGenerator:
    def _make_lead(self, has_website=False, demo_status="not_applicable"):
        """Creates a mock lead object for testing."""
        lead = MagicMock()
        lead.id = uuid.uuid4()
        lead.business_name = "Test Bakery"
        lead.category = "Bakery"
        lead.city = "Austin"
        lead.region = "Texas"
        lead.country = "United States"
        lead.phone = "+1-555-0123"
        lead.address = "123 Main St, Austin, TX"
        lead.rating = 4.5
        lead.review_count = 42
        lead.raw_places_data = {}
        lead.has_website = has_website
        lead.demo_site_status = demo_status
        lead.generated_demo_html = None
        lead.demo_generated_at = None
        return lead

    @pytest.mark.asyncio
    async def test_skips_leads_with_website(self):
        lead = self._make_lead(has_website=True)
        result = await generate_demo_for_lead(lead)
        assert result is False
        assert lead.demo_site_status == "not_applicable"

    @pytest.mark.asyncio
    async def test_skips_already_generated(self):
        lead = self._make_lead(demo_status="generated")
        result = await generate_demo_for_lead(lead)
        assert result is True

    @pytest.mark.asyncio
    @patch("app.modules.demo_builder.generator.generate_landing_page_html")
    @patch("app.modules.demo_builder.generator.extract_brand_blueprint")
    async def test_successful_generation(self, mock_brand, mock_gemini):
        mock_brand.return_value = {
            "business_name": "Test Bakery",
            "primary_color": "#8B4513",
            "secondary_color": "#FFF8DC",
            "accent_color": "#D2691E",
            "font_style": "serif",
            "tone": "friendly",
            "services": ["Bread", "Cakes"],
        }
        mock_gemini.return_value = (
            '<!DOCTYPE html><html><head><title>Test</title></head>'
            '<body><h1>Test Bakery</h1>' + 'x' * 200 + '</body></html>'
        )

        # Must enable demo generation
        with patch("app.modules.demo_builder.generator.settings") as mock_settings:
            mock_settings.DEMO_GENERATION_ENABLED = True
            mock_settings.GEMINI_API_KEY = "test-key"

            lead = self._make_lead()
            result = await generate_demo_for_lead(lead)

            assert result is True
            assert lead.demo_site_status == "generated"
            assert lead.generated_demo_html is not None
            assert lead.demo_generated_at is not None

    @pytest.mark.asyncio
    @patch("app.modules.demo_builder.generator.extract_brand_blueprint")
    async def test_brand_extraction_failure_is_graceful(self, mock_brand):
        mock_brand.return_value = None

        with patch("app.modules.demo_builder.generator.settings") as mock_settings:
            mock_settings.DEMO_GENERATION_ENABLED = True
            mock_settings.GEMINI_API_KEY = "test-key"

            lead = self._make_lead()
            result = await generate_demo_for_lead(lead)

            assert result is False
            assert lead.demo_site_status == "failed"

    @pytest.mark.asyncio
    @patch("app.modules.demo_builder.generator.generate_landing_page_html")
    @patch("app.modules.demo_builder.generator.extract_brand_blueprint")
    async def test_gemini_failure_is_graceful(self, mock_brand, mock_gemini):
        mock_brand.return_value = {"business_name": "Test", "primary_color": "#000"}
        mock_gemini.return_value = None

        with patch("app.modules.demo_builder.generator.settings") as mock_settings:
            mock_settings.DEMO_GENERATION_ENABLED = True
            mock_settings.GEMINI_API_KEY = "test-key"

            lead = self._make_lead()
            result = await generate_demo_for_lead(lead)

            assert result is False
            assert lead.demo_site_status == "failed"

    @pytest.mark.asyncio
    async def test_disabled_feature_skips_silently(self):
        with patch("app.modules.demo_builder.generator.settings") as mock_settings:
            mock_settings.DEMO_GENERATION_ENABLED = False

            lead = self._make_lead()
            result = await generate_demo_for_lead(lead)

            assert result is False

    @pytest.mark.asyncio
    async def test_exception_never_propagates(self):
        """Critical: even unexpected errors must not propagate."""
        with patch("app.modules.demo_builder.generator.settings") as mock_settings:
            mock_settings.DEMO_GENERATION_ENABLED = True
            mock_settings.GEMINI_API_KEY = "test-key"

            with patch(
                "app.modules.demo_builder.generator.extract_brand_blueprint",
                side_effect=RuntimeError("Unexpected crash"),
            ):
                lead = self._make_lead()
                # This should NOT raise
                result = await generate_demo_for_lead(lead)
                assert result is False
                assert lead.demo_site_status == "failed"


# ── Public Demo Endpoint Tests ───────────────────────────────────────────────

class TestPublicDemoEndpoint:
    @pytest.mark.asyncio
    async def test_serves_generated_demo(self, client, db_session):
        """Test that a generated demo is served with correct CSP headers."""
        from app.models.lead import Lead

        lead = Lead(
            place_id="test_place_demo",
            business_name="Demo Test Biz",
            status="email_sent",
            has_website=False,
            demo_site_status="generated",
            generated_demo_html="<!DOCTYPE html><html><head></head><body>Demo</body></html>",
        )
        db_session.add(lead)
        await db_session.commit()
        await db_session.refresh(lead)

        response = await client.get(f"/api/v1/public/demo/{lead.id}")
        assert response.status_code == 200
        assert "Content-Security-Policy" in response.headers
        assert "cdn.tailwindcss.com" in response.headers["Content-Security-Policy"]
        assert "Demo" in response.text

    @pytest.mark.asyncio
    async def test_returns_404_for_missing_demo(self, client):
        """Test 404 for non-existent lead."""
        fake_id = str(uuid.uuid4())
        response = await client.get(f"/api/v1/public/demo/{fake_id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_for_ungenerated_demo(self, client, db_session):
        """Test 404 when demo exists but hasn't been generated yet."""
        from app.models.lead import Lead

        lead = Lead(
            place_id="test_place_pending",
            business_name="Pending Demo Biz",
            status="qualified",
            has_website=False,
            demo_site_status="pending",
        )
        db_session.add(lead)
        await db_session.commit()
        await db_session.refresh(lead)

        response = await client.get(f"/api/v1/public/demo/{lead.id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_returns_404_for_invalid_uuid(self, client):
        """Test 404 for invalid UUID format."""
        response = await client.get("/api/v1/public/demo/not-a-uuid")
        assert response.status_code == 404
