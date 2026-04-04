"""
PDF Proposal generation module.
Renders a visually polished, multi-section business proposal using
ReportLab's canvas API for precise layout control.

Design language: black & white header, grayscale accents, clean card sections,
data-driven growth chart, and a strong CTA footer.
"""
import os
from datetime import date
from typing import List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics import renderPDF
from loguru import logger

# ── Brand palette (Black & White) ─────────────────────────────────────────────
BLACK      = colors.HexColor("#000000")
DARK_GRAY  = colors.HexColor("#333333")
MID_GRAY   = colors.HexColor("#666666")
GRAY_500   = colors.HexColor("#999999")
GRAY_300   = colors.HexColor("#cccccc")
BORDER     = colors.HexColor("#eaeaea")
LIGHT_BG   = colors.HexColor("#f5f5f5")
LIGHTEST   = colors.HexColor("#fafafa")
WHITE      = colors.white
TEXT       = colors.HexColor("#000000")

# ── Page geometry ─────────────────────────────────────────────────────────────
W, H  = A4                    # 595.27 x 841.89 pt
PAD_X = 40                    # left / right margin
INNER = W - 2 * PAD_X        # content width


def _register_fonts(c: canvas.Canvas) -> None:
    """Uses built-in Helvetica family — no external font files needed."""
    pass  # Helvetica / Helvetica-Bold shipped with ReportLab


# ── Drawing helpers ───────────────────────────────────────────────────────────

def _rect(c: canvas.Canvas, x, y, w, h, fill, radius=0):
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=0)


def _text(c: canvas.Canvas, x, y, text, font="Helvetica", size=10,
          color=TEXT, align="left"):
    c.setFont(font, size)
    c.setFillColor(color)
    if align == "center":
        c.drawCentredString(x, y, text)
    elif align == "right":
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)


def _wrapped_text(c: canvas.Canvas, x, y, text, font="Helvetica", size=10,
                  color=TEXT, max_width=INNER, line_height=14) -> float:
    """
    Draws text wrapping within max_width.
    Returns the y position after the last line.
    """
    c.setFont(font, size)
    c.setFillColor(color)
    words = text.split()
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if c.stringWidth(test, font, size) <= max_width:
            line = test
        else:
            c.drawString(x, y, line)
            y -= line_height
            line = word
    if line:
        c.drawString(x, y, line)
        y -= line_height
    return y


def _divider(c: canvas.Canvas, y, color=BORDER, width=INNER):
    c.setStrokeColor(color)
    c.setLineWidth(0.5)
    c.line(PAD_X, y, PAD_X + width, y)


def _badge(c: canvas.Canvas, x, y, text, bg=BLACK, fg=WHITE, size=8):
    """Draws a small pill-shaped label."""
    w = c.stringWidth(text, "Helvetica-Bold", size) + 16
    _rect(c, x, y - 3, w, 16, bg, radius=4)
    _text(c, x + 8, y + 2, text, "Helvetica-Bold", size, fg)
    return w


# ── Section renderers ─────────────────────────────────────────────────────────

def _draw_header(c: canvas.Canvas, business_name: str, category: str):
    """Full-width black header with company name and tagline."""
    HEADER_H = 160
    _rect(c, 0, H - HEADER_H, W, HEADER_H, BLACK)

    # Accent stripe
    _rect(c, 0, H - HEADER_H, W, 3, DARK_GRAY)

    # Overline label
    _text(c, PAD_X, H - 32, "DIGITAL GROWTH PROPOSAL",
          "Helvetica-Bold", 8, GRAY_500)

    # Business name (may be long — split if needed)
    name = business_name.upper()
    font_size = 26
    while c.stringWidth(name, "Helvetica-Bold", font_size) > INNER - 20 and font_size > 16:
        font_size -= 1
    _text(c, PAD_X, H - 60, name, "Helvetica-Bold", font_size, WHITE)

    # Category pill
    _badge(c, PAD_X, H - 82, category.title(), DARK_GRAY, WHITE, 9)

    # Tagline
    _text(c, PAD_X, H - 110,
          "A personalised strategy to grow your online presence and attract more customers.",
          "Helvetica", 10, GRAY_300)

    # Date  (right-aligned)
    _text(c, W - PAD_X, H - 32,
          f"Prepared: {date.today().strftime('%d %B %Y')}",
          "Helvetica", 8, GRAY_500, align="right")

    # Bottom decorative dots (grayscale)
    dot_y = H - HEADER_H + 14
    for i, col in enumerate([BLACK, DARK_GRAY, MID_GRAY]):
        _rect(c, PAD_X + i * 14, dot_y, 8, 8, col, radius=4)


def _draw_problem_strip(c: canvas.Canvas, y: float) -> float:
    """
    Light gray strip summarising why digital presence matters.
    Returns y after the strip.
    """
    STRIP_H = 56
    _rect(c, 0, y - STRIP_H, W, STRIP_H, LIGHT_BG)
    _text(c, PAD_X, y - 18,
          "Why this matters", "Helvetica-Bold", 11, BLACK)
    _text(c, PAD_X, y - 34,
          "97% of consumers search online before visiting a local business. "
          "Without a strong digital presence, you're invisible to them.",
          "Helvetica", 9, MID_GRAY)
    return y - STRIP_H - 16


def _draw_stat_row(c: canvas.Canvas, y: float) -> float:
    """
    Three KPI tiles side by side.
    Returns y after the row.
    """
    TILE_W  = (INNER - 16) / 3
    TILE_H  = 64
    stats   = [
        ("97%",  "of buyers search online\nbefore visiting locally"),
        ("3.5×",  "more calls to businesses\nwith a complete website"),
        ("46%",  "of all Google searches\nare local intent"),
    ]
    for i, (val, label) in enumerate(stats):
        tx = PAD_X + i * (TILE_W + 8)
        _rect(c, tx, y - TILE_H, TILE_W, TILE_H, BLACK, radius=6)
        _text(c, tx + TILE_W / 2, y - 22, val,
              "Helvetica-Bold", 20, WHITE, "center")
        # two-line label
        lines = label.split("\n")
        for j, ln in enumerate(lines):
            _text(c, tx + TILE_W / 2, y - 38 - j * 12, ln,
                  "Helvetica", 8, GRAY_300, "center")
    return y - TILE_H - 20


def _draw_section_heading(c: canvas.Canvas, x, y, number, title) -> float:
    _rect(c, x, y - 1, 24, 20, BLACK, radius=3)
    _text(c, x + 12, y + 4, str(number), "Helvetica-Bold", 10, WHITE, "center")
    _text(c, x + 32, y + 4, title, "Helvetica-Bold", 13, TEXT)
    return y - 28


def _draw_benefits(c: canvas.Canvas, y: float, benefits: List[str]) -> float:
    """
    Renders each benefit as a card with a dark checkmark bullet.
    Returns y after last card.
    """
    for benefit in benefits:
        CARD_H = 42
        _rect(c, PAD_X, y - CARD_H, INNER, CARD_H, LIGHT_BG, radius=6)

        # Checkmark circle
        _rect(c, PAD_X + 10, y - CARD_H + 11, 20, 20, DARK_GRAY, radius=10)
        _text(c, PAD_X + 20, y - CARD_H + 17, "✓",
              "Helvetica-Bold", 10, WHITE, "center")

        # Benefit text
        max_w  = INNER - 50
        short  = benefit if len(benefit) <= 110 else benefit[:107] + "…"
        _text(c, PAD_X + 40, y - 16, short, "Helvetica", 9.5, MID_GRAY)
        y -= CARD_H + 6

    return y - 4


def _draw_growth_chart(c: canvas.Canvas, y: float) -> float:
    """
    Draws a clean before/after bar chart comparing current vs projected metrics.
    Returns y after the chart.
    """
    CHART_H = 180
    _rect(c, PAD_X, y - CHART_H, INNER, CHART_H, LIGHT_BG, radius=8)

    d = Drawing(INNER, CHART_H)

    bc             = VerticalBarChart()
    bc.x           = 50
    bc.y           = 30
    bc.height      = 120
    bc.width       = INNER - 80
    bc.data        = [(15, 20, 10, 12), (72, 85, 65, 78)]
    bc.strokeColor = colors.transparent
    bc.groupSpacing = 12

    bc.valueAxis.valueMin  = 0
    bc.valueAxis.valueMax  = 100
    bc.valueAxis.valueStep = 25
    bc.valueAxis.labels.fontName = "Helvetica"
    bc.valueAxis.labels.fontSize = 7
    bc.valueAxis.labels.fillColor = GRAY_500

    bc.categoryAxis.categoryNames = [
        "Online\nVisibility", "Customer\nInquiries",
        "Search\nRanking", "Brand\nTrust"
    ]
    bc.categoryAxis.labels.fontName  = "Helvetica"
    bc.categoryAxis.labels.fontSize  = 7
    bc.categoryAxis.labels.fillColor = GRAY_500
    bc.categoryAxis.labels.boxAnchor = "n"
    bc.categoryAxis.labels.dy        = -8

    bc.bars[0].fillColor = GRAY_300
    bc.bars[1].fillColor = BLACK

    d.add(bc)

    # Legend
    legend_x = INNER - 160
    d.add(Rect(legend_x, CHART_H - 20, 10, 10, fillColor=GRAY_300, strokeColor=colors.transparent))
    d.add(String(legend_x + 14, CHART_H - 18, "Current", fontName="Helvetica", fontSize=7, fillColor=GRAY_500))
    d.add(Rect(legend_x + 70, CHART_H - 20, 10, 10, fillColor=BLACK, strokeColor=colors.transparent))
    d.add(String(legend_x + 84, CHART_H - 18, "Projected", fontName="Helvetica", fontSize=7, fillColor=MID_GRAY))

    # Chart title
    d.add(String(INNER / 2, CHART_H - 14, "Projected Impact After Digital Upgrade",
                 fontName="Helvetica-Bold", fontSize=9,
                 fillColor=MID_GRAY, textAnchor="middle"))

    renderPDF.draw(d, c, PAD_X, y - CHART_H)
    return y - CHART_H - 16


def _draw_timeline(c: canvas.Canvas, y: float) -> float:
    """
    Simple 3-phase project timeline strip.
    Returns y after the timeline.
    """
    phases = [
        ("Week 1–2",  "Discovery & Strategy",    "Brand audit, keyword research, competitor review"),
        ("Week 3–6",  "Design & Development",     "Modern website, mobile-first, SEO-optimised"),
        ("Week 7–8",  "Launch & Visibility",      "Go-live, Google Business setup, analytics"),
    ]
    PHASE_W = (INNER - 16) / 3
    PHASE_H = 70
    gray_shades = [BLACK, DARK_GRAY, MID_GRAY]

    for i, (period, title, desc) in enumerate(phases):
        tx = PAD_X + i * (PHASE_W + 8)
        _rect(c, tx, y - PHASE_H, PHASE_W, PHASE_H, BLACK, radius=6)

        # Accent top bar (grayscale shades)
        _rect(c, tx, y - 5, PHASE_W, 5, gray_shades[i], radius=3)

        _text(c, tx + 8, y - 18, period, "Helvetica", 7, GRAY_300)
        _text(c, tx + 8, y - 32, title, "Helvetica-Bold", 9, WHITE)

        # wrap desc
        words = desc.split()
        line1, line2 = "", ""
        for w in words:
            test = f"{line1} {w}".strip()
            if c.stringWidth(test, "Helvetica", 7.5) < PHASE_W - 16:
                line1 = test
            else:
                line2 = (line2 + " " + w).strip()
        _text(c, tx + 8, y - 46, line1, "Helvetica", 7.5, GRAY_300)
        if line2:
            _text(c, tx + 8, y - 58, line2, "Helvetica", 7.5, GRAY_300)

    return y - PHASE_H - 16


def _draw_cta(c: canvas.Canvas, y: float, website: Optional[str] = None) -> float:
    """
    Strong call-to-action block.
    Returns y after the block.
    """
    CTA_H = 72
    _rect(c, PAD_X, y - CTA_H, INNER, CTA_H, BLACK, radius=8)
    _rect(c, PAD_X, y - CTA_H, INNER, 3, DARK_GRAY, radius=3)

    _text(c, PAD_X + INNER / 2, y - 22,
          "Ready to grow? Let's build something great together.",
          "Helvetica-Bold", 12, WHITE, "center")

    contact_line = website or "Reply to this email to book a free 20-minute strategy call."
    _text(c, PAD_X + INNER / 2, y - 42,
          contact_line, "Helvetica", 9, GRAY_300, "center")

    _text(c, PAD_X + INNER / 2, y - 58,
          "No contracts. No pressure. Just results.",
          "Helvetica", 8, GRAY_500, "center")

    return y - CTA_H - 12


def _draw_footer(c: canvas.Canvas):
    """Persistent footer on every page."""
    _rect(c, 0, 0, W, 28, DARK_GRAY)
    _text(c, PAD_X, 10,
          "This proposal is confidential and prepared exclusively for the recipient.",
          "Helvetica", 7, GRAY_500)
    _text(c, W - PAD_X, 10,
          f"Page 1  |  {date.today().year}",
          "Helvetica", 7, GRAY_500, "right")


# ── Public interface ──────────────────────────────────────────────────────────

def generate_proposal_pdf(
    business_name: str,
    category: str,
    benefits: List[str],
    output_filename: str = "proposal.pdf",
    rating: Optional[float] = None,
    review_count: Optional[int] = None,
    city: Optional[str] = None,
    qualification_notes: Optional[str] = None,
) -> Optional[str]:
    """
    Renders a visually polished, multi-section business proposal PDF.

    Args:
        business_name:       Target business display name.
        category:            Business category (e.g. "Dentists").
        benefits:            List of AI-generated value propositions (3–5 items).
        output_filename:     Output filename inside the tmp/ directory.
        rating:              Google rating (optional, shown in header context).
        review_count:        Number of Google reviews (optional).
        city:                Business city (optional).
        qualification_notes:  Short diagnosis string from scorer (optional).

    Returns:
        str: Relative path to generated PDF, or None on failure.
    """
    try:
        os.makedirs("tmp", exist_ok=True)
        filepath = os.path.join("tmp", output_filename)

        c = canvas.Canvas(filepath, pagesize=A4)
        c.setTitle(f"Digital Growth Proposal — {business_name}")
        c.setAuthor("Cold Scout")
        c.setSubject("Digital Marketing Proposal")

        # ── Page 1 layout (top → bottom) ─────────────────────────────────────
        cursor = H  # current y position, decrements as we draw downward

        _draw_header(c, business_name, category)
        cursor -= 168  # header height + gap

        cursor = _draw_problem_strip(c, cursor)
        cursor = _draw_stat_row(c, cursor)

        _divider(c, cursor)
        cursor -= 20

        # Section 1 — What We Found
        cursor = _draw_section_heading(c, PAD_X, cursor, "1", "What We Found About Your Online Presence")
        if qualification_notes:
            notes_display = qualification_notes.replace(" | ", "  •  ")[:200]
            cursor = _wrapped_text(c, PAD_X, cursor, notes_display,
                                   "Helvetica", 9, MID_GRAY,
                                   max_width=INNER, line_height=13)
            cursor -= 8
        else:
            _text(c, PAD_X, cursor,
                  "Your business has significant untapped digital potential.",
                  "Helvetica", 9, MID_GRAY)
            cursor -= 20

        # Rating context line
        if rating and review_count:
            loc = f" in {city}" if city else ""
            _badge(c, PAD_X, cursor,
                   f"{rating}★  {review_count} reviews{loc}",
                   DARK_GRAY, WHITE, 8)
            cursor -= 22

        _divider(c, cursor)
        cursor -= 20

        # Section 2 — What We'll Do
        cursor = _draw_section_heading(c, PAD_X, cursor, "2", "How We'll Grow Your Business")
        safe_benefits = (benefits or [])[:5]
        if not safe_benefits:
            safe_benefits = [
                "Build a fast, mobile-friendly website that ranks on Google",
                "Set up Google Business Profile to capture local search traffic",
                "Create a social media presence to engage your community",
            ]
        cursor = _draw_benefits(c, cursor, safe_benefits)

        _divider(c, cursor)
        cursor -= 20

        # Section 3 — Growth Projection
        cursor = _draw_section_heading(c, PAD_X, cursor, "3", "Projected Growth Impact")
        cursor = _draw_growth_chart(c, cursor)

        # If we're running out of page space, add a new page
        if cursor < 220:
            _draw_footer(c)
            c.showPage()
            cursor = H - 40

        _divider(c, cursor)
        cursor -= 20

        # Section 4 — Timeline
        cursor = _draw_section_heading(c, PAD_X, cursor, "4", "Project Roadmap")
        cursor = _draw_timeline(c, cursor)

        _divider(c, cursor)
        cursor -= 16

        # CTA block
        cursor = _draw_cta(c, cursor)

        # Footer
        _draw_footer(c)

        c.save()
        logger.info(f"PDF proposal generated: {filepath}")
        return filepath

    except Exception as e:
        logger.exception(f"Failed to generate PDF proposal for {business_name}: {e}")
        return None