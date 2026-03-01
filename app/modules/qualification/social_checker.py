"""
Social media presence verification module.
Analyzes target domain DOMs to identify social media profiles.
"""
import httpx
from bs4 import BeautifulSoup
from typing import Tuple

async def check_social_media(url: str) -> Tuple[bool, str]:
    """
    Asynchronously fetches and parses a website's DOM for validated social media platform links.
    """
    if not url:
        return False, "No website to check."
        
    if not url.startswith("http"):
        url = "http://" + url
        
    try:
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(url, timeout=10.0, follow_redirects=True)
            if response.status_code != 200:
                return False, f"HTTP {response.status_code}"
            
            soup = BeautifulSoup(response.text, 'html.parser')
            links = soup.find_all('a', href=True)
            
            social_found = False
            social_profiles = []
            
            for link in links:
                href = link['href'].lower()
                
                # Check for Facebook
                if 'facebook.com' in href or 'fb.com' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "facebook",
                        "profile_url": link['href']
                    })
                    
                # Check for Instagram
                elif 'instagram.com' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "instagram",
                        "profile_url": link['href']
                    })
                    
                # Check for LinkedIn
                elif 'linkedin.com' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "linkedin",
                        "profile_url": link['href']
                    })
                    
                # Check for Twitter / X
                elif 'twitter.com' in href or 'x.com' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "twitter",
                        "profile_url": link['href']
                    })
                    
                # Check for YouTube
                elif 'youtube.com' in href or 'youtu.be' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "youtube",
                        "profile_url": link['href']
                    })
                    
                # Check for TikTok
                elif 'tiktok.com' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "tiktok",
                        "profile_url": link['href']
                    })
                    
                # Check for Pinterest
                elif 'pinterest.com' in href or 'pin.it' in href:
                    social_found = True
                    social_profiles.append({
                        "platform_name": "pinterest",
                        "profile_url": link['href']
                    })
                    
            # Deduplicate the profiles based on URL
            unique_profiles = []
            seen_urls = set()
            for profile in social_profiles:
                if profile["profile_url"] not in seen_urls:
                    seen_urls.add(profile["profile_url"])
                    unique_profiles.append(profile)

            return social_found, unique_profiles
            
    except Exception as e:
        return False, []
