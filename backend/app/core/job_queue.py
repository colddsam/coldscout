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

from app.core.pipeline_tracker import (
    mark_completed,
    mark_failed,
    mark_running,
    mark_skipped,
)

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
    """Pulls jobs from the shared queue one at a time and runs them serially.

    Liveness contract: the worker exits ONLY when the queue has been idle
    for 60 s. Any exception inside an iteration — including failures in
    the tracker (mark_running / mark_failed / mark_completed) — is logged
    and the loop continues, so a transient Redis blip can never kill the
    consumer.

    Exit-race protection: when the loop exits we re-check the queue under
    the worker lock. If a job arrived during our shutdown window and a
    concurrent ``_ensure_worker`` short-circuited because it saw
    ``_worker_running == True``, we re-spawn ourselves so the job is not
    stranded forever.
    """
    global _worker_running
    from app.core.job_manager import job_manager
    from app.core.database import get_session_maker
    from app.modules.notifications import events as notif_events

    async def _emit(event_fn, **kwargs) -> None:
        """Best-effort notification emit. NEVER lets a notification failure
        affect stage outcome — opens its own short-lived session and swallows
        anything that goes wrong (notifications are observability, not
        correctness)."""
        try:
            async with get_session_maker()() as ndb:
                await event_fn(ndb, **kwargs)
        except Exception as e:
            logger.debug(f"notify emit failed (non-fatal): {e}")

    q = _get_queue()
    try:
        while True:
            try:
                stage_name, stage_func, manual, user_id = await asyncio.wait_for(
                    q.get(), timeout=60.0
                )
            except asyncio.TimeoutError:
                # Idle — break out of the loop so the finally clause can
                # decide whether to re-spawn (queue may have grown after
                # the timeout fired but before we acquired the lock).
                break

            try:
                # Pre-check: if the job or global pipeline is on HOLD, mark
                # the run as failed instead of silently returning and
                # reporting "completed". Manual triggers surface the same
                # skip reason so the Pipeline Log UI clearly shows the
                # paused state.
                if not job_manager.is_global_active():
                    # Surface as 'skipped' (not 'failed') — the pipeline
                    # is intentionally paused, this isn't an exception.
                    await mark_running(user_id, stage_name)
                    await mark_skipped(
                        user_id, stage_name,
                        "Skipped: global production status is HOLD",
                    )
                    continue

                job_active = await job_manager.is_freelancer_pipeline_active(
                    stage_name, user_id=user_id, is_manual=manual
                )
                if not job_active:
                    await mark_running(user_id, stage_name)
                    await mark_skipped(
                        user_id, stage_name,
                        f"Skipped: {stage_name} is on HOLD for this user",
                    )
                    continue

                await mark_running(user_id, stage_name)

                # Live notification — fires before the stage starts so the
                # user sees an instant "Stage X running…" card. ``user_id``
                # is the freelancer who triggered the work (manual) OR who
                # the scheduled run is operating on. Never broadcast.
                if isinstance(user_id, int):
                    await _emit(
                        notif_events.stage_started,
                        user_id=user_id,
                        stage=stage_name,
                        trigger="manual" if manual else "scheduled",
                    )

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

                if isinstance(user_id, int):
                    await _emit(
                        notif_events.stage_finished,
                        user_id=user_id,
                        stage=stage_name,
                        summary=f"{stage_name.replace('_', ' ').title()} finished successfully.",
                    )
            except Exception as e:
                # Best-effort failure mark. Wrapped because mark_failed
                # itself could raise (e.g. Redis is down) — we must NOT
                # let that kill the worker for every subsequent job.
                try:
                    await mark_failed(
                        user_id, stage_name, f"{type(e).__name__}: {str(e)[:200]}"
                    )
                except Exception as mark_err:
                    logger.warning(
                        f"Tracker mark_failed itself raised for {stage_name}: {mark_err}"
                    )
                if isinstance(user_id, int):
                    await _emit(
                        notif_events.stage_failed,
                        user_id=user_id,
                        stage=stage_name,
                        error=f"{type(e).__name__}: {str(e)[:200]}",
                    )
                logger.exception(
                    f"Tracked stage {stage_name} failed for user {user_id}"
                )
            finally:
                q.task_done()
    except asyncio.CancelledError:
        # Process shutdown — let the cancellation propagate after cleanup.
        raise
    except Exception:
        # Any other unexpected error in the loop scaffolding (not a job
        # iteration) — log it but treat it as worker exit.
        logger.exception("Queue worker loop crashed; will be re-spawned on next enqueue.")
    finally:
        # Atomic swap: under the worker lock, decide whether to re-spawn or
        # genuinely release the running flag.
        async with _worker_lock:
            if _get_queue().qsize() > 0:
                # Producer enqueued during our shutdown window. Spawn a
                # fresh worker and keep ``_worker_running`` True so no one
                # races us in.
                logger.debug("Queue worker re-spawning: jobs arrived during exit.")
                asyncio.create_task(_queue_worker())
            else:
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
