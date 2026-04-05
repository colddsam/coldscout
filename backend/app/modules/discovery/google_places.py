"""
Google Places API Integration Module.

This module acts as the primary 'Discovery Engine' for the application. It interfaces
directly with Google's New Places API (v1) to perform geographic searches for
businesses based on their category and location.

Design Choice:
We use the 'searchText' endpoint which is more versatile for natural language
queries (e.g., "Plumbers in New York") compared to basic category filtering.

International Support:
  - regionCode: ISO 3166-1 alpha-2 code for country-level disambiguation
  - locationBias: Circle-based geographic scoping for precise area targeting
  - Pagination: Follows nextPageToken for up to 60 results per location
  - addressComponents: Extracts structured country/region/postal from responses
"""
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from loguru import logger
from app.config import get_settings


# Adaptive radius mapping by location depth
RADIUS_BY_DEPTH = {
    "sub_area": 3000,
    "city": 10000,
    "region": 25000,
    "country": 50000,
}


def get_radius_for_depth(sub_area: str = None, city: str = None, region: str = None) -> int:
    """Returns an appropriate search radius based on the most specific location level."""
    if sub_area:
        return RADIUS_BY_DEPTH["sub_area"]
    elif city:
        return RADIUS_BY_DEPTH["city"]
    elif region:
        return RADIUS_BY_DEPTH["region"]
    return RADIUS_BY_DEPTH["country"]


def extract_geo_from_place(place: dict, target: dict) -> dict:
    """
    Extract country, region, postal_code, lat/lng from Google Places
    addressComponents, falling back to the target's values.

    Args:
        place: A single place dict from the Google Places API response.
        target: The discovery target dict containing country, country_code, etc.

    Returns:
        dict with keys: country, country_code, region, sub_area, postal_code,
        latitude, longitude.
    """
    components = place.get("addressComponents", [])
    geo = {
        "country": target.get("country"),
        "country_code": target.get("country_code"),
        "region": target.get("region"),
        "sub_area": target.get("sub_area"),
        "postal_code": None,
        "latitude": None,
        "longitude": None,
    }

    for comp in components:
        types = comp.get("types", [])
        if "country" in types:
            geo["country"] = comp.get("longText", geo["country"])
            geo["country_code"] = comp.get("shortText", geo["country_code"])
        elif "administrative_area_level_1" in types:
            geo["region"] = comp.get("longText", geo["region"])
        elif "postal_code" in types:
            geo["postal_code"] = comp.get("longText")
        elif "sublocality" in types or "neighborhood" in types:
            geo["sub_area"] = comp.get("longText", geo["sub_area"])

    loc = place.get("location", {})
    geo["latitude"] = loc.get("latitude")
    geo["longitude"] = loc.get("longitude")

    return geo


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
        Includes location and addressComponents for international geo extraction.
        """
        settings = get_settings()
        self.api_key = settings.GOOGLE_PLACES_API_KEY

        # Security: The API key is injected from environment variables via config.py
        self.headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            # Field mask ensures we get structured data for scoring (rating, reviews, website)
            # plus location coordinates and address components for international support
            "X-Goog-FieldMask": (
                "places.id,"
                "places.displayName,"
                "places.formattedAddress,"
                "places.nationalPhoneNumber,"
                "places.websiteUri,"
                "places.rating,"
                "places.userRatingCount,"
                "places.googleMapsUri,"
                "places.location,"
                "places.addressComponents,"
                "nextPageToken"
            )
        }

    def _build_payload(
        self,
        query: str,
        country_code: str = None,
        lat: float = None,
        lng: float = None,
        radius: int = 5000,
        page_token: str = None,
    ) -> dict:
        """Builds the request payload for a searchText call."""
        payload = {
            "textQuery": query,
            "languageCode": "en",
        }
        if page_token:
            # Google Places API v1 does NOT allow maxResultCount with pageToken.
            # The page size is locked to the value from the original request.
            payload["pageToken"] = page_token
        else:
            payload["maxResultCount"] = 20
        if country_code:
            payload["regionCode"] = country_code.upper()
        if lat and lng:
            payload["locationBias"] = {
                "circle": {
                    "center": {"latitude": lat, "longitude": lng},
                    "radius": float(radius),
                }
            }
        return payload

    async def search_places(
        self,
        location: str,
        category: str,
        radius: int = 5000,
        country_code: str = None,
        lat: float = None,
        lng: float = None,
    ) -> List[Dict[str, Any]]:
        """
        Executes an asynchronous query against the Google Places API.

        Args:
            location: The city, neighborhood, or zip code to search in.
            category: The type of business (e.g., 'Roofing', 'Law Firm').
            radius:   Search radius in meters.
            country_code: ISO 3166-1 alpha-2 for disambiguation (e.g. 'US', 'IN').
            lat: Latitude for locationBias circle center.
            lng: Longitude for locationBias circle center.

        Returns:
            A list of 'places' dictionaries. If the request fails, returns an empty list
            to ensure the pipeline can continue gracefully.
        """
        query = f"{category} in {location}"
        payload = self._build_payload(query, country_code, lat, lng, radius)

        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self.BASE_URL,
                    json=payload,
                    headers=self.headers,
                    timeout=10.0,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("places", [])

            except httpx.HTTPStatusError as e:
                logger.error(f"Google API returned error status: {e.response.status_code}")
                return []
            except Exception as e:
                logger.exception(f"Unexpected error during Google Places discovery for: {query}")
                return []

    async def search_places_paginated(
        self,
        location: str,
        category: str,
        max_pages: int = 3,
        country_code: str = None,
        lat: float = None,
        lng: float = None,
        radius: int = 5000,
    ) -> List[Dict[str, Any]]:
        """
        Fetches up to max_pages * 20 results using nextPageToken pagination.

        Args:
            location: The search location string.
            category: The business category.
            max_pages: Maximum number of pages to fetch (1-3, default 3 = 60 results).
            country_code: ISO 3166-1 alpha-2 for disambiguation.
            lat: Latitude for locationBias.
            lng: Longitude for locationBias.
            radius: Search radius in meters.

        Returns:
            Combined list of places across all pages.
        """
        all_places: List[Dict[str, Any]] = []
        query = f"{category} in {location}"
        page_token = None

        async with httpx.AsyncClient() as client:
            for page in range(max_pages):
                payload = self._build_payload(
                    query, country_code, lat, lng, radius, page_token
                )
                try:
                    response = await client.post(
                        self.BASE_URL,
                        json=payload,
                        headers=self.headers,
                        timeout=10.0,
                    )
                    response.raise_for_status()
                    data = response.json()

                    all_places.extend(data.get("places", []))
                    page_token = data.get("nextPageToken")

                    if not page_token:
                        break

                    # Brief delay between pages to respect rate limits
                    await asyncio.sleep(0.5)

                except httpx.HTTPStatusError as e:
                    logger.error(
                        f"Google API page {page + 1} error: {e.response.status_code}"
                    )
                    break
                except Exception as e:
                    logger.exception(
                        f"Unexpected error on page {page + 1} for: {query}"
                    )
                    break

        return all_places
