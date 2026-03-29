"""
AI Lead Generation System - API Router Architecture

This module serves as the primary aggregation point for all versioned API routes.
By consolidating sub-routers here, we maintain a clean separation of concerns 
while providing a unified interface for the FastAPI application main entry point.

Routing Strategy:
- v1/auth: Session and token management.
- v1/pipeline: Control logic for the automated discovery and outreach sequence.
- v1/leads: CRUD operations and AI qualification insights for prospects.
- v1/campaigns: High-level outreach orchestration.
"""
from fastapi import APIRouter, Depends
from app.api.v1 import auth, tracking, webhooks, pipeline, leads, campaigns, reports, unsubscribe, health, billing
from app.api.v1.threads import public_router as threads_public, router as threads_private
from app.api.deps import get_api_key

# Define routers without global dependencies first
public_router = APIRouter()
private_router = APIRouter(dependencies=[Depends(get_api_key)])

# Public routes (No X-API-Key required for leads/external services)
public_router.include_router(health.router)
public_router.include_router(tracking.router, tags=["tracking"])
public_router.include_router(webhooks.router, tags=["webhooks"])
public_router.include_router(unsubscribe.router, prefix="/unsubscribe", tags=["unsubscribe"])
public_router.include_router(threads_public, tags=["threads"])

# Private routes (System-level authentication required)
private_router.include_router(auth.router, tags=["auth"])
private_router.include_router(pipeline.router, tags=["pipeline"])
private_router.include_router(leads.router, tags=["leads"])
private_router.include_router(campaigns.router, tags=["campaigns"])
private_router.include_router(reports.router, tags=["reports"])
private_router.include_router(threads_private, tags=["threads"])
private_router.include_router(billing.router, tags=["billing"])

# Aggregated versioned router
api_router = APIRouter()
api_router.include_router(public_router)
api_router.include_router(private_router)
