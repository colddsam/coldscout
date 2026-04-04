"""
Registers or updates the daily health check in cron-job.org.
Requires CRON_JOB_API_KEY and APP_URL environment variables.
"""
import os
import sys
import json
import urllib.request
import urllib.error

def main():
    api_key = os.getenv("CRON_JOB_API_KEY")
    app_url = os.getenv("APP_URL")
    
    if not api_key:
        print("Error: CRON_JOB_API_KEY environment variable not set.")
        sys.exit(1)
        
    if not app_url:
        print("Error: APP_URL environment variable not set.")
        sys.exit(1)
        
    target_url = f"{app_url.rstrip('/')}/api/v1/health"
    print(f"Targeting URL: {target_url}")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    # Retrieve existing jobs to determine if an update or creation is required
    req = urllib.request.Request("https://api.cron-job.org/jobs", headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
    except urllib.error.URLError as e:
        if hasattr(e, 'read'):
            print(f"Failed to fetch jobs: {e.read().decode()}")
        else:
            print(f"Failed to fetch jobs: {e}")
        sys.exit(1)
        
    jobs = data.get("jobs", [])
    existing_job = next((j for j in jobs if j.get("url") == target_url), None)
    
    job_payload = {
        "job": {
            "url": target_url,
            "enabled": True,
            "saveResponses": True,
            "schedule": {
                "timezone": "UTC",
                "expiresAt": 0,
                "hours": [-1],
                "mdays": [-1],
                "minutes": [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
                "months": [-1],
                "wdays": [-1]
            }
        }
    }
    
    if existing_job:
        job_id = existing_job["jobId"]
        print(f"Found existing job {job_id}. Updating...")
        req = urllib.request.Request(
            f"https://api.cron-job.org/jobs/{job_id}", 
            data=json.dumps(job_payload).encode(),
            headers=headers, 
            method="PATCH"
        )
        try:
            with urllib.request.urlopen(req) as response:
                print("Job updated successfully.")
        except urllib.error.URLError as e:
            if hasattr(e, 'read'):
                print(f"Failed to update job: {e.read().decode()}")
            else:
                print(f"Failed to update job: {e}")
            sys.exit(1)
    else:
        print("No existing job found. Creating new...")
        req = urllib.request.Request(
            "https://api.cron-job.org/jobs", 
            data=json.dumps(job_payload).encode(),
            headers=headers, 
            method="PUT"
        )
        try:
            with urllib.request.urlopen(req) as response:
                print("Job created successfully.")
        except urllib.error.URLError as e:
            if hasattr(e, 'read'):
                print(f"Failed to create job: {e.read().decode()}")
            else:
                print(f"Failed to create job: {e}")
            sys.exit(1)

if __name__ == "__main__":
    main()
