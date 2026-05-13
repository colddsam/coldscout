"""
Infrastructure module — cross-cutting platform services.

Currently exposes the Dynamic API Key Orchestrator (``key_manager``), which
centralises credential selection, rotation, cooldown, and failover for every
external API consumer (Groq, Gemini, Google Places, Meta Threads, ...).
"""

from app.modules.infrastructure.key_manager import (
    Provider,
    UseCase,
    KeyExhaustedError,
    InvalidProviderKeyError,
    key_manager,
    with_key_failover,
)

__all__ = [
    "Provider",
    "UseCase",
    "KeyExhaustedError",
    "InvalidProviderKeyError",
    "key_manager",
    "with_key_failover",
]
