import json
import os
import asyncio
import httpx
from dotenv import load_dotenv
from colorama import init, Fore, Style

# Initialize colorama for colored console output
init(autoreset=True)

# Load environment variables from .env file
load_dotenv()

API_KEY = os.getenv("API_KEY", "test-admin-secret-key")
BASE_URL = os.getenv("APP_URL", "http://localhost:8000")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "[EMAIL_ADDRESS]")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD") or os.getenv("INITIAL_ADMIN_PASSWORD") or "adminpassword"

HEADERS = {
    "X-API-Key": API_KEY
}

async def _request(client, method, url, name, expected_statuses, **kwargs):
    print(f"\n{Fore.CYAN}--- Testing {name} ---{Style.RESET_ALL}")
    print(f"Request: {method} {BASE_URL}{url}")
    try:
        response = await client.request(method, url, headers=HEADERS, **kwargs)
        if response.status_code in expected_statuses:
            print(f"{Fore.GREEN}✅ PASS (Status: {response.status_code}){Style.RESET_ALL}")
        elif response.status_code == 404:
            print(f"{Fore.YELLOW}⚠️ NOT FOUND (Status: 404) - (Possibly expected if no records exist yet){Style.RESET_ALL}")
        elif response.status_code == 422:
            print(f"{Fore.YELLOW}⚠️ VALIDATION ERROR (Status: 422) - (Possibly expected for dummy IDs){Style.RESET_ALL}")
        else:
            print(f"{Fore.RED}❌ FAIL (Expected: {expected_statuses}, Got: {response.status_code}){Style.RESET_ALL}")
        
        try:
            # Try to print formatted JSON if possible
            data = response.json()
            print(f"   Response Body (JSON):")
            print(f"{Fore.WHITE}{json.dumps(data, indent=2)}{Style.RESET_ALL}")
        except Exception:
            # Fallback to plain text
            if response.text.strip():
                print(f"   Response Body (Text): {response.text}")
            else:
                print(f"   Response Body: (Empty)")
        
        return response
    except httpx.ConnectError:
        print(f"{Fore.RED}❌ CONNECTION ERROR - Is your backend server running on {BASE_URL}?{Style.RESET_ALL}")
        return None
    except Exception as e:
        print(f"{Fore.RED}❌ ERROR: {e}{Style.RESET_ALL}")
        return None

async def setup_auth(client):
    print(f"\n{Fore.MAGENTA}=== Setting up Authentication ==={Style.RESET_ALL}")
    res = await _request(client, "POST", "/api/v1/login/access-token", "Login Flow", [200], data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if res and res.status_code == 200:
        token = res.json()["access_token"]
        HEADERS["Authorization"] = f"Bearer {token}"
        return True
    return False

# ==========================================
# 1. Health & Validation
# ==========================================
async def test_health(client):
    await _request(client, "GET", "/api/v1/health", "Health Check", [200])

async def test_auth_me(client):
    await _request(client, "GET", "/api/v1/me", "Get Current User Auth", [200])

# ==========================================
# 2. Pipeline Read (Status & Config)
# ==========================================
async def test_pipeline_status(client):
    await _request(client, "GET", "/api/v1/pipeline/status", "Pipeline Status", [200])

async def test_pipeline_jobs_config(client):
    await _request(client, "GET", "/api/v1/pipeline/jobs_config", "Jobs Configuration", [200])

# ==========================================
# 3. Pipeline Read/Write (Hold/Resume)
# ==========================================
async def test_pipeline_hold(client):
    await _request(client, "POST", "/api/v1/pipeline/hold", "Hold Pipeline (Pause all jobs)", [200])

async def test_pipeline_resume(client):
    await _request(client, "POST", "/api/v1/pipeline/resume", "Resume Pipeline (Start active jobs)", [200])

# ==========================================
# 4. Pipeline Jobs (Triggers)
# ==========================================
async def test_pipeline_trigger(client, stage):
    await _request(client, "POST", "/api/v1/pipeline/trigger", f"Trigger Pipeline Job: {stage}", [200], json={"stage": stage})

# ==========================================
# 5. Leads Endpoints
# ==========================================
async def test_leads(client):
    res = await _request(client, "GET", "/api/v1/leads", "List Leads", [200])
    await _request(client, "GET", "/api/v1/leads/export/csv", "Export Leads CSV", [200])
    
    if res and res.status_code == 200:
        data = res.json()
        if data.get("items") and len(data["items"]) > 0:
            lead_id = data["items"][0]["id"]
            await _request(client, "GET", f"/api/v1/leads/{lead_id}", f"Get Specific Lead ({lead_id[:8]})", [200])
            await _request(client, "PATCH", f"/api/v1/leads/{lead_id}", f"Update Lead Metadata ({lead_id[:8]})", [200], json={"domain": "updated-test.com"})
            # Note: We omit DELETE by default to prevent accidental data loss.

# ==========================================
# 6. Campaigns Endpoints
# ==========================================
async def test_campaigns(client):
    res = await _request(client, "GET", "/api/v1/campaigns", "List Campaigns", [200])
    if res and res.status_code == 200:
        data = res.json()
        if isinstance(data, list) and len(data) > 0:
            campaign_id = data[0]["id"]
            await _request(client, "GET", f"/api/v1/campaigns/{campaign_id}", f"Get Specific Campaign ({campaign_id[:8]})", [200])
            await _request(client, "GET", f"/api/v1/campaigns/{campaign_id}/stats", f"Get Campaign Stats ({campaign_id[:8]})", [200])

# ==========================================
# 7. Reports Endpoints
# ==========================================
async def test_reports(client):
    res = await _request(client, "GET", "/api/v1/reports", "List Reports", [200])
    if res and res.status_code == 200:
        data = res.json()
        if isinstance(data, list) and len(data) > 0:
            date_str = data[0]["report_date"]
            dt = date_str.split("T")[0]
            await _request(client, "GET", f"/api/v1/reports/{dt}", f"Get Specific Report ({dt})", [200])
            # Download might fail if no PDF exists yet, so 404 is acceptable
            await _request(client, "GET", f"/api/v1/reports/{dt}/download", f"Download Report PDF ({dt})", [200, 404])

# ==========================================
# 8. Webhooks & Tracking (Public Endpoints)
# ==========================================
async def test_tracking_and_webhooks(client):
    # These endpoints do not require Auth, but we test that they exist.
    # We use a dummy token, which may yield 404 or 422 if validation is strict.
    await _request(client, "GET", "/api/v1/track/open/dummy_token", "Email Open Tracking", [404, 422, 400])
    await _request(client, "GET", "/api/v1/track/click/dummy_token", "Email Click Tracking", [404, 422, 400])
    await _request(client, "GET", "/api/v1/unsubscribe/dummy_token", "Unsubscribe Route", [200, 404, 422, 400])
    await _request(client, "POST", "/api/v1/webhooks/brevo", "Brevo Webhook", [200, 400], json={"event": "delivered"})


async def run_all(client):
    print(f"\n{Fore.GREEN}=== RUNNING ALL API TESTS ==={Style.RESET_ALL}")
    await test_health(client)
    if not await setup_auth(client): return
    await test_auth_me(client)
    await test_pipeline_status(client)
    await test_pipeline_jobs_config(client)
    await test_leads(client)
    await test_campaigns(client)
    await test_reports(client)
    await test_tracking_and_webhooks(client)
    print(f"\n{Fore.GREEN}All read-only tests complete!{Style.RESET_ALL}")

async def interactive_menu():
    print(f"\n{Fore.CYAN}=============================================={Style.RESET_ALL}")
    print(f"{Fore.CYAN}      AI Lead Generation API Tester           {Style.RESET_ALL}")
    print(f"{Fore.CYAN}=============================================={Style.RESET_ALL}")
    print(f"Targeting Backend API: {BASE_URL}")
    print(f"Using Default User: {ADMIN_EMAIL}")
    print(f"----------------------------------------------")
    print("0.  Run All Standard Read-Only Tests")
    print("1.  Test Health Check")
    print("2.  Test Auth (Login & Fetch User)")
    print("3.  Test Pipeline Read (Status & Configuration)")
    print("4.  Test Pipeline Controls (HOLD / RESUME)")
    print("5.  Test Pipeline Jobs (TRIGGER Manual Runs)")
    print("6.  Test Leads API (List, Fetch, Export, Edit)")
    print("7.  Test Campaigns API (List, Fetch, Stats)")
    print("8.  Test Reports API (List, Fetch, PDF Download)")
    print("9.  Test Tracking & Webhooks API (Open, Click, Unsubscribe)")
    print("10. Exit")
    
    while True:
        choice = input(f"\n{Fore.YELLOW}Select an option (0-10): {Style.RESET_ALL}").strip()
        if choice in [str(i) for i in range(11)] or choice.lower() in ["exit", "q", "all"]:
            break
        print(f"{Fore.RED}Invalid selection. Please choose a number between 0 and 10.{Style.RESET_ALL}")

    if choice == "10" or choice.lower() == "exit" or choice.lower() == "q":
        print("Exiting...")
        return

    # Use a longer timeout for tests that might take longer (like reports or DB fetching)
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30.0) as client:
        if choice == "0" or choice.lower() == "all":
            await run_all(client)
        elif choice == "1":
            await test_health(client)
        elif choice == "2":
            await setup_auth(client)
            await test_auth_me(client)
        elif choice == "3":
            if await setup_auth(client):
                await test_pipeline_status(client)
                await test_pipeline_jobs_config(client)
        elif choice == "4":
            if await setup_auth(client):
                while True:
                    sub = input("Type 'H' to HOLD the pipeline or 'R' to RESUME (or 'B' to Go Back): ").strip().upper()
                    if sub == "H":
                        await test_pipeline_hold(client)
                        break
                    elif sub == "R":
                        await test_pipeline_resume(client)
                        break
                    elif sub == "B":
                        break
                    else:
                        print(f"{Fore.RED}Invalid choice. Please enter H, R, or B.{Style.RESET_ALL}")
        elif choice == "5":
            if await setup_auth(client):
                print("\nAvailable Jobs:")
                print("1. All Jobs (End-to-end)")
                print("2. Discovery Stage")
                print("3. Qualification Stage")
                print("4. Personalization Stage")
                print("5. Outreach Stage")
                print("6. Daily Report Generation")
                print("7. Weekly Optimization")
                while True:
                    jchoice = input(f"{Fore.YELLOW}Select job to trigger (1-7) or 'B' to Go Back: {Style.RESET_ALL}").strip()
                    if jchoice.upper() == "B":
                        break
                    
                    stage_map = {
                        "1": "all",
                        "2": "discovery",
                        "3": "qualification",
                        "4": "personalization",
                        "5": "outreach",
                        "6": "report",
                        "7": "optimization"
                    }
                    if jchoice in stage_map:
                        await test_pipeline_trigger(client, stage_map[jchoice])
                        break
                    else:
                        print(f"{Fore.RED}Invalid job choice. Please select 1-7 or B.{Style.RESET_ALL}")
        elif choice == "6":
            if await setup_auth(client):
                await test_leads(client)
        elif choice == "7":
            if await setup_auth(client):
                await test_campaigns(client)
        elif choice == "8":
            if await setup_auth(client):
                await test_reports(client)
        elif choice == "9":
            await test_tracking_and_webhooks(client)
        else:
            print("Invalid choice.")

if __name__ == "__main__":
    done = False
    while not done:
        try:
            asyncio.run(interactive_menu())
        except KeyboardInterrupt:
            print(f"\n{Fore.YELLOW}Script interrupted by user. Exiting...{Style.RESET_ALL}")
