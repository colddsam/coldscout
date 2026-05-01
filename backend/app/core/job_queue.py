"""
Shared in-process job queue for serially executing pipeline-style work.

Originally introduced inside ``app/api/v1/pipeline.py`` to serialize manual
trigger requests across users. It has been lifted out so that other modules
(notably the per-lead "Send Now" feature in ``app/api/v1/leads.py``) can push
jobs onto the very same single-worker queue. This guarantees that a manual
single-lead outreach is never executing concurrently with a multi-lead
personalization / outreach run for the same — or any other — freelancer.

Design notes:
- One asyncio.Queue + one consumer task per process (sufficient for a single
  uvicorn worker; horizontal scale would move this to Celery as the
  pre-existing TODO in ``daily_pipeline.py`` already documents).
- Stages register themselves in ``STAGE_FUNCTIONS`` so callers can refer to
  them by name. Callers may also push pre-baked ``functools.partial`` objects
  for ad-hoc payloads (e.g. a specific ``lead_id``) — the worker treats every
  callable uniformly.
- Tracking (logs, history, active-stage snapshot) continues to be done by
  ``app/core/pipeline_tracker.py`` so the existing Pipeline Log UI is
  untouched.
"""
from __future__ import annotations

import asyncio
import inspect
from typing import Any, Awaitable, Callable, Optional

from loguru import logger

from app.core.pipeline_tracker import mark_completed, mark_failed, mark_running

# ── Stage registry ───────────────────────────────────────────────────────────

# Populated lazily by ``register_stage`` to avoid circular imports between
# this module, ``daily_pipeline``, ``threads_pipeline``, and the per-lead
# runner. Public read-only accessor: ``get_stage_function``.
STAGE_FUNCTIONS: dict[str, Callable[..., Awaitable[Any]]] = {}

# Stages that accept the (manual=, user_id=) freelancer-aware signature.
# Stages outside this set are called with at most ``manual=`` (or no kwargs).
_FREELANCER_AWARE_STAGES: set[str] = set()


def register_stage(
    name: str,
    func: Callable[..., Awaitable[Any]],
    *,
    freelancer_aware: bool = True,
) -> None:
    """Register a stage callable so it can be looked up by name."""
    STAGE_FUNCTIONS[name] = func
    if freelancer_aware:
        _FREELANCER_AWARE_STAGES.add(name)


def get_stage_function(name: str) -> Optional[Callable[..., Awaitable[Any]]]:
    return STAGE_FUNCTIONS.get(name)


def is_freelancer_aware(name: str) -> bool:
    return name in _FREELANCER_AWARE_STAGES


# ── Queue + worker ───────────────────────────────────────────────────────────

_job_queue: asyncio.Queue | None = None
_worker_running = False
_worker_lock = asyncio.Lock()


def _get_queue() -> asyncio.Queue:
    global _job_queue
    if _job_queue is None:
        _job_queue = asyncio.Queue()
    return _job_queue


async def _ensure_worker() -> None:
    """Start the shared queue consumer if it isn't already running."""
    global _worker_running
    async with _worker_lock:
        if _worker_running:
            return
        _worker_running = True
    asyncio.create_task(_queue_worker())


async def _queue_worker() -> None:
    """Pulls jobs from the shared queue one at a time and runs them serially."""
    global _worker_running
    from app.core.job_manager import job_manager
    from app.config import get_production_status

    q = _get_queue()
    try:
        while True:
            stage_name, stage_func, manual, user_id = await asyncio.wait_for(
                q.get(), timeout=60.0
            )
            try:
                # Pre-check: if the job or global pipeline is on HOLD, mark
                # the run as failed instead of silently returning and
                # reporting "completed". Manual triggers surface the same
                # skip reason so the Pipeline Log UI clearly shows the
                # paused state.
                global_status = get_production_status()
                if global_status == "HOLD":
                    await mark_running(user_id, stage_name)
                    await mark_failed(
                        user_id, stage_name,
                        "Skipped: global PRODUCTION_STATUS is HOLD",
                    )
                    continue

                job_active = await job_manager.is_freelancer_pipeline_active(
                    stage_name, user_id=user_id, is_manual=manual
                )
                if not job_active:
                    await mark_running(user_id, stage_name)
                    await mark_failed(
                        user_id, stage_name,
                        f"Skipped: {stage_name} is on HOLD",
                    )
                    continue

                await mark_running(user_id, stage_name)

                if is_freelancer_aware(stage_name):
                    await stage_func(manual=manual, user_id=user_id)
                else:
                    sig = inspect.signature(stage_func)
                    if "manual" in sig.parameters:
                        await stage_func(manual=manual)
                    else:
                        await stage_func()

                await mark_completed(
                    user_id, stage_name, f"{stage_name} completed successfully"
                )
            except Exception as e:
                await mark_failed(
                    user_id, stage_name, f"{type(e).__name__}: {str(e)[:200]}"
                )
                logger.exception(
                    f"Tracked stage {stage_name} failed for user {user_id}"
                )
            finally:
                q.task_done()
    except asyncio.TimeoutError:
        # No jobs for 60s — worker exits; it will restart on the next trigger.
        pass
    finally:
        async with _worker_lock:
            _worker_running = False


# ── Public enqueue API ───────────────────────────────────────────────────────


async def enqueue(
    stage_name: str,
    stage_func: Callable[..., Awaitable[Any]],
    manual: bool,
    user_id: int | str,
) -> None:
    """Push a job onto the shared serial queue and ensure the worker is alive.

    ``stage_func`` may be the raw stage function or a ``functools.partial``
    that has already bound extra arguments (e.g. ``lead_id``). The worker
    treats every callable uniformly: it always invokes it with the queue
    worker's standard kwargs (``manual=``, ``user_id=``) when the stage is
    freelancer-aware, otherwise with no kwargs / just ``manual=``.
    """
    q = _get_queue()
    await q.put((stage_name, stage_func, manual, user_id))
    await _ensure_worker()


async def queue_size() -> int:
    """Return the number of jobs currently waiting in the shared queue.

    Note: this excludes the job currently executing (if any). It is used to
    surface a rough "queue position" hint in the UI.
    """
    return _get_queue().qsize()


def is_worker_running() -> bool:
    """True if the queue consumer task is currently active."""
    return _worker_running
