"""
Google Calendar integration utilities.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import json

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

from app.config import get_settings

settings = get_settings()

SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
]

def get_google_auth_flow(redirect_uri: str) -> Flow:
    """Create a Google OAuth Flow object."""
    # Create client config matching what Google expects from downloaded JSON
    client_config = {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "project_id": "cold-scout",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uris": [redirect_uri]
        }
    }
    
    flow = Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    return flow

def credentials_to_dict(credentials: Credentials) -> dict:
    """Convert Google Credentials object to dictionary."""
    return {
        'token': credentials.token,
        'refresh_token': credentials.refresh_token,
        'token_uri': credentials.token_uri,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
        'scopes': credentials.scopes
    }

def get_credentials(creds_data: dict) -> Credentials:
    """
    Reconstruct Google Credentials object from dictionary, refreshing if needed.
    
    Supports both native OAuth flow data and Supabase-sourced provider tokens.
    """
    if not creds_data:
        return None
        
    creds = Credentials(
        token=creds_data.get('token'),
        refresh_token=creds_data.get('refresh_token'),
        token_uri=creds_data.get('token_uri', "https://oauth2.googleapis.com/token"),
        client_id=creds_data.get('client_id', settings.GOOGLE_CLIENT_ID),
        client_secret=creds_data.get('client_secret', settings.GOOGLE_CLIENT_SECRET),
        scopes=creds_data.get('scopes', SCOPES)
    )
    
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        
    return creds

async def get_busy_slots(creds_data: dict, start_time: datetime, end_time: datetime) -> List[Dict[str, str]]:
    """Fetch busy slots from Google Calendar."""
    creds = get_credentials(creds_data)
    if not creds:
        return []

    service = build('calendar', 'v3', credentials=creds)
    
    # Query free/busy information
    body = {
        "timeMin": start_time.isoformat(),
        "timeMax": end_time.isoformat(),
        "timeZone": "UTC",
        "items": [{"id": "primary"}]
    }
    
    eventsResult = service.freebusy().query(body=body).execute()
    busy_slots = eventsResult['calendars']['primary']['busy']
    return busy_slots

async def create_google_meet_event(
    creds_data: dict, 
    summary: str, 
    description: str, 
    start_time: datetime, 
    end_time: datetime,
    attendee_email: Optional[str] = None
) -> Dict[str, Any]:
    """Create a Google Calendar event with a Google Meet link."""
    creds = get_credentials(creds_data)
    if not creds:
        raise ValueError("Invalid credentials")

    service = build('calendar', 'v3', credentials=creds)
    
    event = {
        'summary': summary,
        'description': description,
        'start': {
            'dateTime': start_time.isoformat(),
            'timeZone': 'UTC',
        },
        'end': {
            'dateTime': end_time.isoformat(),
            'timeZone': 'UTC',
        },
        'conferenceData': {
            'createRequest': {
                'requestId': f"cs-meet-{int(datetime.now().timestamp())}",
                'conferenceSolutionKey': {'type': 'hangoutsMeet'}
            }
        }
    }
    
    if attendee_email:
        event['attendees'] = [{'email': attendee_email}]
        
    created_event = service.events().insert(
        calendarId='primary',
        body=event,
        conferenceDataVersion=1,
        sendUpdates='all' if attendee_email else 'none'
    ).execute()
    
    return {
        'event_id': created_event.get('id'),
        'meet_link': created_event.get('hangoutLink')
    }
