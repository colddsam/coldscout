"""
Demo Website Builder Module.

Generates interactive, brand-personalized landing page demos for leads
that do not currently have a website. Uses a two-stage AI pipeline:
  Stage A: Groq extracts a brand blueprint from Google Places data.
  Stage B: Gemini generates a full interactive HTML landing page.

This module is designed as a pure additive feature — if any step fails,
the existing email pipeline continues unaffected.
"""
