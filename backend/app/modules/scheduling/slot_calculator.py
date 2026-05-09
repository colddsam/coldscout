from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_

from app.models.booking import Booking
from app.modules.scheduling.google_calendar import get_busy_slots

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
        # Default 9 to 5 UTC Monday to Friday if no preferences
        scheduling_preferences = {
            "working_hours": {
                "Monday": [{"start": "09:00", "end": "17:00"}],
                "Tuesday": [{"start": "09:00", "end": "17:00"}],
                "Wednesday": [{"start": "09:00", "end": "17:00"}],
                "Thursday": [{"start": "09:00", "end": "17:00"}],
                "Friday": [{"start": "09:00", "end": "17:00"}]
            },
            "timezone": "UTC"
        }
        
    working_hours = scheduling_preferences.get("working_hours", {})
    
    # 2. Fetch DB Bookings
    result = await db.execute(
        select(Booking).where(
            and_(
                Booking.freelancer_id == freelancer_id,
                Booking.status.in_(['approved', 'pending']),
                Booking.end_time > start_date,
                Booking.start_time < end_date
            )
        )
    )
    db_bookings = result.scalars().all()
    busy_periods = [{"start": b.start_time, "end": b.end_time} for b in db_bookings]
    
    # 3. Fetch Google Calendar busy slots
    if google_creds:
        try:
            gcal_busy = await get_busy_slots(google_creds, start_date, end_date)
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
    current_time = start_date
    
    # Simple logic: iterate day by day, check working hours, generate slots
    while current_time < end_date:
        day_name = current_time.strftime("%A")
        day_hours = working_hours.get(day_name, [])
        
        for period in day_hours:
            try:
                p_start = datetime.strptime(period['start'], "%H:%M").time()
                p_end = datetime.strptime(period['end'], "%H:%M").time()
                
                slot_start = datetime.combine(current_time.date(), p_start).replace(tzinfo=timezone.utc)
                slot_end = datetime.combine(current_time.date(), p_end).replace(tzinfo=timezone.utc)
                
                # If the slot is in the past, skip to current time
                if slot_start < datetime.now(timezone.utc):
                    slot_start = datetime.now(timezone.utc).replace(second=0, microsecond=0)
                    # Round up to next 30 min
                    minutes = slot_start.minute
                    remainder = minutes % 30
                    if remainder > 0:
                        slot_start += timedelta(minutes=30 - remainder)
                
                curr_slot = slot_start
                while curr_slot + timedelta(minutes=duration_minutes) <= slot_end:
                    curr_slot_end = curr_slot + timedelta(minutes=duration_minutes)
                    
                    # Check overlap with busy periods
                    is_busy = False
                    for busy in busy_periods:
                        if (curr_slot < busy['end'] and curr_slot_end > busy['start']):
                            is_busy = True
                            break
                            
                    if not is_busy and curr_slot >= start_date and curr_slot_end <= end_date:
                        available_slots.append(curr_slot)
                        
                    # Next slot increment: use 15 min for short meetings, else use duration or 30 min
                    increment = 15 if duration_minutes <= 30 else min(duration_minutes, 30)
                    curr_slot += timedelta(minutes=increment)
            except Exception as e:
                import logging
                logging.error(f"Error parsing working hours for {day_name}: {e}")
                
        current_time += timedelta(days=1)
        current_time = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
        
    return available_slots
