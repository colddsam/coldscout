from datetime import datetime, timedelta, timezone
import zoneinfo
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.models.booking import Booking
from app.modules.scheduling.google_calendar import get_busy_slots

# Locale-independent weekday names. Indexed by datetime.weekday()
# (Monday=0 … Sunday=6). strftime("%A") is locale-aware and would mismatch
# the English keys stored in scheduling_preferences when the host locale
# is not English.
WEEKDAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]


async def calculate_available_slots(
    db: AsyncSession,
    freelancer_id: int,
    scheduling_preferences: dict,
    google_creds: dict,
    start_date: datetime,
    end_date: datetime,
    duration_minutes: int = 30
) -> List[datetime]:
    """
    Calculate available time slots for a given freelancer between start_date and end_date.

    1. Parse freelancer scheduling preferences (working hours, days off).
    2. Fetch existing bookings from the database.
    3. Fetch busy slots from Google Calendar if connected.
    4. Generate potential slots and filter out overlaps.

    Availability is opt-in: if the freelancer has not configured any
    working hours (``working_hours`` missing/empty), an empty list is
    returned. The booking page surfaces this as "no availability"
    rather than fabricating slots from a built-in default.
    """
    # 1. Parse preferences
    # Expected format:
    # {
    #   "working_hours": {
    #     "Monday": [{"start": "09:00", "end": "17:00"}],
    #     ...
    #   },
    #   "timezone": "UTC"
    # }
    if not scheduling_preferences:
        scheduling_preferences = {}

    working_hours = scheduling_preferences.get("working_hours") or {}
    if not working_hours:
        # Freelancer has not configured availability — show nothing.
        return []
    
    tz_name = scheduling_preferences.get("timezone", "UTC")
    try:
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = zoneinfo.ZoneInfo("UTC")
        tz_name = "UTC"

    
    # 2. Fetch DB Bookings
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.freelancer_id == freelancer_id,
                Booking.status.in_(['approved', 'pending']),
                Booking.end_time > start_date - timedelta(days=1),
                Booking.start_time < end_date + timedelta(days=1)
            )
        )
    )
    db_bookings = result.scalars().all()
    busy_periods = [{"start": b.start_time, "end": b.end_time} for b in db_bookings]
    
    # 3. Fetch Google Calendar busy slots
    if google_creds:
        try:
            gcal_busy = await get_busy_slots(google_creds, start_date - timedelta(days=1), end_date + timedelta(days=1))
            for slot in gcal_busy:
                busy_periods.append({
                    "start": datetime.fromisoformat(slot['start'].replace('Z', '+00:00')),
                    "end": datetime.fromisoformat(slot['end'].replace('Z', '+00:00'))
                })
        except Exception as e:
            import logging
            logging.error(f"Failed to fetch Google Calendar busy slots: {e}")
            
    # 4. Generate potential slots
    available_slots = []
    
    # Logic: Iterate day by day in the freelancer's LOCAL timezone
    # We expand the window by 1 day in both directions to ensure we catch all
    # freelancer local days that could possibly overlap with the lead's UTC window.
    current_fl_local = start_date.astimezone(tz)
    end_fl_local = end_date.astimezone(tz)
    
    # Iterate from one day before the start to one day after the end
    iter_local = (current_fl_local - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    limit_local = (end_fl_local + timedelta(days=1)).replace(hour=23, minute=59, second=59)

    while iter_local <= limit_local:
        # Locale-independent day name to match working_hours keys.
        day_name = WEEKDAY_NAMES[iter_local.weekday()]
        day_hours = working_hours.get(day_name, [])
        
        for period in day_hours:
            try:
                p_start_str = period.get('start', '09:00')
                p_end_str = period.get('end', '17:00')
                
                p_start_time = datetime.strptime(p_start_str, "%H:%M").time()
                p_end_time = datetime.strptime(p_end_str, "%H:%M").time()
                
                # Create local boundary for this specific day
                local_period_start = datetime.combine(iter_local.date(), p_start_time).replace(tzinfo=tz)
                local_period_end = datetime.combine(iter_local.date(), p_end_time).replace(tzinfo=tz)
                
                # Convert period to UTC for matching against Lead's window and Busy periods
                utc_period_start = local_period_start.astimezone(timezone.utc)
                utc_period_end = local_period_end.astimezone(timezone.utc)
                
                # Normalize to current time (no past slots) + 1 hour notice period
                now_utc = datetime.now(timezone.utc) + timedelta(hours=1)
                
                # Skip periods that are entirely in the past
                if utc_period_end <= now_utc:
                    continue
                    
                # Adjust start if period has already begun or is within notice window
                adjusted_period_start = max(utc_period_start, now_utc)
                
                # Generate slots within this period
                curr_slot_start = adjusted_period_start
                
                # Round up to the next 15 or 30 minute interval for consistent slotting
                if curr_slot_start > utc_period_start:
                    minutes = curr_slot_start.minute
                    remainder = minutes % 30
                    if remainder > 0:
                        curr_slot_start += timedelta(minutes=30 - remainder)
                    curr_slot_start = curr_slot_start.replace(second=0, microsecond=0)

                while curr_slot_start + timedelta(minutes=duration_minutes) <= utc_period_end:
                    curr_slot_end = curr_slot_start + timedelta(minutes=duration_minutes)
                    
                    # INCLUSION LOGIC:
                    # A slot belongs to a day if it STARTS within that day's window.
                    # We relax the 'end' check because a slot starting at 11:30 PM
                    # should be visible on the 'Today' page even if it ends at 12:30 AM.
                    if curr_slot_start >= start_date and curr_slot_start < end_date:
                        # Check overlap with busy periods
                        is_busy = False
                        for busy in busy_periods:
                            if (curr_slot_start < busy['end'] and curr_slot_end > busy['start']):
                                is_busy = True
                                break
                        
                        if not is_busy:
                            available_slots.append(curr_slot_start)
                    
                    curr_slot_start += timedelta(minutes=duration_minutes)
            except (ValueError, KeyError):
                continue
                
        iter_local += timedelta(days=1)
        
    # Remove duplicates and sort
    return sorted(list(set(available_slots)))
