"""
Google Places API Integration Module.

This module acts as the primary 'Discovery Engine' for the application. It interfaces 
directly with Google's New Places API (v1) to perform geographic searches for 
businesses based on their category and location.

Design Choice: 
We use the 'searchText' endpoint which is more versatile for natural language 
queries (e.g., "Plumbers in New York") compared to basic category filtering.
"""
import httpx
from typing import List, Dict, Any, Optional
from loguru import logger
from app.config import get_settings


class GooglePlacesClient:
    """
    Client for interfacing with the Google Places API.
    
    This client is responsible for identifying the initial pool of potential leads.
    It handles authentication, query formatting, and response parsing.
    """
    
    # We use the New Places API (v1) for better field masking and performance.
    BASE_URL = "https://places.googleapis.com/v1/places:searchText"

    def __init__(self):
        """
        Initializes the client with API credentials and strict field masks.
        
        Field Masking Strategy:
        We explicitly request only the fields we need to reduce latency and 
        potentially lower API costs (though basic fields are generally included).
        """
        settings = get_settings()
        self.api_key = settings.GOOGLE_PLACES_API_KEY
        
        # Security: The API key is injected from environment variables via config.py
        self.headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            # Field mask ensures we get structured data for scoring (rating, reviews, website)
            "X-Goog-FieldMask": (
                "places.id,"
                "places.displayName,"
                "places.formattedAddress,"
                "places.nationalPhoneNumber,"
                "places.websiteUri,"
                "places.rating,"
                "places.userRatingCount,"
                "places.googleMapsUri"
            )
        }

    async def search_places(self, location: str, category: str, radius: int = 5000) -> List[Dict[str, Any]]:
        """
        Executes an asynchronous query against the Google Places API.
        
        Example Flow:
            search_places("Brooklyn", "Dental Clinic") 
            -> Sends "Dental Clinic in Brooklyn" to Google.
        
        Args:
            location: The city, neighborhood, or zip code to search in.
            category: The type of business (e.g., 'Roofing', 'Law Firm').
            radius:   Search radius in meters (legacy param, mostly handled by textQuery).
            
        Returns:
            A list of 'places' dictionaries. If the request fails, returns an empty list
            to ensure the pipeline can continue gracefully.
        """
        # Natural language query format tends to yield better results for local SEO searches.
        query = f"{category} in {location}"
        
        payload = {
            "textQuery": query,
            "languageCode": "en",
            "maxResultCount": 20 # We fetch 20 at a time to keep the pipeline manageable
        }
        
        async with httpx.AsyncClient() as client:
            try:
                # We use a POST request as required by the New Places API 'searchText' endpoint.
                response = await client.post(
                    self.BASE_URL,
                    json=payload,
                    headers=self.headers,
                    timeout=10.0 # Strict timeout to prevent pipeline hanging
                )
                
                # If Google returns an error (4xx/5xx), we log it and return empty.
                # This prevents a single API failure from crashing the entire batch job.
                response.raise_for_status()
                data = response.json()
                
                return data.get("places", [])
                
            except httpx.HTTPStatusError as e:
                logger.error(f"Google API returned error status: {e.response.status_code}")
                return []
            except Exception as e:
                logger.exception(f"Unexpected error during Google Places discovery for: {query}")
                return []
