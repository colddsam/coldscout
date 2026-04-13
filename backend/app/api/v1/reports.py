"""
Daily reporting API endpoints.
Provides read access to automated pipeline performance reports and
facilitates Excel workbook downloads for administrative review.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from typing import List
import datetime
import os
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.daily_report import DailyReport
from app.models.user import User
from app.schemas.report import ReportResponse

router = APIRouter(prefix="/reports")

@router.get("", response_model=List[ReportResponse])
async def list_reports(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retrieves daily pipeline reports sorted by date (newest first).
    Scoped to the current user's reports (superusers see all).
    """
    stmt = select(DailyReport).order_by(DailyReport.report_date.desc())
    if not current_user.is_superuser:
        stmt = stmt.where(DailyReport.user_id == current_user.id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{date}", response_model=ReportResponse)
async def get_report_by_date(date: datetime.date, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Retrieves the daily pipeline report for a specific calendar date.
    Scoped to the current user.
    """
    stmt = select(DailyReport).where(DailyReport.report_date == date)
    if not current_user.is_superuser:
        stmt = stmt.where(DailyReport.user_id == current_user.id)
    result = await db.execute(stmt)
    report = result.scalars().first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

@router.get("/{date}/download")
async def download_report(date: datetime.date, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """
    Downloads the Excel workbook generated for the specified daily report.
    Scoped to the current user.
    """
    stmt = select(DailyReport).where(DailyReport.report_date == date)
    if not current_user.is_superuser:
        stmt = stmt.where(DailyReport.user_id == current_user.id)
    result = await db.execute(stmt)
    report = result.scalars().first()
    if not report or not report.report_file_path or not os.path.exists(report.report_file_path):
        raise HTTPException(status_code=404, detail="Report file not found")
        
    return FileResponse(
        path=report.report_file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=os.path.basename(report.report_file_path)
    )
