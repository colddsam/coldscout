"""
Optional, config-gated post-call transcription + AI summary.

OFF by default. Activates only when ``MEETING_TRANSCRIPTION_PROVIDER`` is
``'deepgram'`` or ``'openai'`` AND the matching API key is set AND the
booking has a ``recording_url`` (produced by LiveKit Egress, which must be
configured separately). Summarization reuses the existing Groq client, so it
needs no extra key beyond ``GROQ_API_KEY``.

Everything here is lazy and defensive: any failure logs a warning and leaves
the meeting record intact — transcription never blocks the call lifecycle and
the audio→text HTTP calls use ``httpx`` (already a dependency) so no new
package is required to install.
"""
from __future__ import annotations

from typing import Optional

import httpx
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.booking import Booking


def transcription_provider() -> str:
    return (get_settings().MEETING_TRANSCRIPTION_PROVIDER or "").strip().lower()


def is_transcription_configured() -> bool:
    """True iff a provider is selected and its key is present."""
    s = get_settings()
    provider = transcription_provider()
    if provider == "deepgram":
        return bool(s.DEEPGRAM_API_KEY)
    if provider == "openai":
        return bool(s.OPENAI_API_KEY)
    return False


async def _transcribe_deepgram(audio_url: str) -> Optional[str]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            "https://api.deepgram.com/v1/listen",
            headers={
                "Authorization": f"Token {s.DEEPGRAM_API_KEY}",
                "Content-Type": "application/json",
            },
            params={"smart_format": "true", "punctuate": "true"},
            json={"url": audio_url},
        )
        resp.raise_for_status()
        data = resp.json()
        return (
            data.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])[0]
            .get("transcript")
        )


async def _transcribe_openai(audio_url: str) -> Optional[str]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=300.0) as client:
        audio = await client.get(audio_url)
        audio.raise_for_status()
        files = {"file": ("recording.mp4", audio.content, "application/octet-stream")}
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {s.OPENAI_API_KEY}"},
            data={"model": "whisper-1"},
            files=files,
        )
        resp.raise_for_status()
        return resp.json().get("text")


async def transcribe(audio_url: str) -> Optional[str]:
    provider = transcription_provider()
    try:
        if provider == "deepgram":
            return await _transcribe_deepgram(audio_url)
        if provider == "openai":
            return await _transcribe_openai(audio_url)
    except Exception as e:
        logger.warning(f"meetings.transcription: transcribe failed ({provider}): {e}")
    return None


async def summarize(transcript: str) -> tuple[Optional[str], Optional[list[str]]]:
    """Summarize transcript + extract next steps via Groq. Best-effort.

    Reuses the prompt-injection sanitizer from the personalization module so a
    malicious spoken/scripted payload in the transcript can't hijack the LLM.
    """
    if not transcript or not transcript.strip():
        return None, None
    try:
        import json

        from app.modules.personalization.groq_client import (
            GroqClient,
            _sanitize_prompt_value,
        )

        gc = GroqClient()
        safe = _sanitize_prompt_value(transcript[:12000])
        prompt = (
            "You are an assistant summarizing a sales/strategy call transcript. "
            'Return STRICT JSON: {"summary": string, "next_steps": string[]}. '
            "summary = 3-5 sentences. next_steps = 2-6 short action items.\n\n"
            f"Transcript:\n{safe}"
        )
        resp = await gc.client.chat.completions.create(
            model=gc.model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        data = json.loads(resp.choices[0].message.content)
        summary = data.get("summary")
        next_steps = data.get("next_steps")
        if isinstance(next_steps, str):
            next_steps = [next_steps]
        return summary, (next_steps if isinstance(next_steps, list) else None)
    except Exception as e:
        logger.warning(f"meetings.transcription: summarize failed: {e}")
        return None, None


async def process_booking(db: AsyncSession, booking: Booking) -> bool:
    """Transcribe + summarize a finished meeting's recording.

    No-op (returns False) unless transcription is configured and a recording
    URL exists. Persists transcript / summary / next_steps on the booking.
    """
    if not is_transcription_configured() or not booking.recording_url:
        return False
    transcript = await transcribe(booking.recording_url)
    if not transcript:
        return False
    booking.transcript = transcript
    summary, next_steps = await summarize(transcript)
    if summary:
        booking.meeting_summary = summary
    if next_steps:
        booking.next_steps = next_steps
    await db.commit()
    return True
