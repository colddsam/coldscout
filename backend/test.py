import asyncio
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

from app.tasks.daily_pipeline import (
    run_discovery_stage,
    run_qualification_stage,
    run_personalization_stage,
    run_outreach_stage,
    poll_replies,
    generate_daily_report
)
from app.tasks.threads_pipeline import (
    run_threads_discovery_stage,
    run_threads_qualification_stage,
    run_threads_engagement_stage,
    run_threads_response_check
)

JOBS = {
    "daily_discovery": lambda: run_discovery_stage(manual=True),
    "daily_qualification": lambda: run_qualification_stage(manual=True),
    "daily_personalization": lambda: run_personalization_stage(manual=True),
    "daily_outreach": lambda: run_outreach_stage(manual=True),
    "daily_replies": lambda: poll_replies(manual=True),
    "daily_report": lambda: generate_daily_report(manual=True),
    "threads_discovery": run_threads_discovery_stage,
    "threads_qualification": run_threads_qualification_stage,
    "threads_engagement": run_threads_engagement_stage,
    "threads_response": run_threads_response_check,
}

async def run_job(job_name: str):
    if job_name == "all":
        logger.info("Running all jobs sequentially...")
        for name, func in JOBS.items():
            logger.info(f"--- Starting {name} ---")
            try:
                await func()
            except Exception as e:
                logger.error(f"Error in {name}: {e}")
        logger.info("All jobs completed.")
    elif job_name in JOBS:
        logger.info(f"--- Starting {job_name} ---")
        try:
            await JOBS[job_name]()
            logger.info(f"--- {job_name} completed ---")
        except Exception as e:
            logger.error(f"Error in {job_name}: {e}")
    else:
        logger.error(f"Unknown job: {job_name}")
        logger.info(f"Available jobs: all, {', '.join(JOBS.keys())}")

async def interactive_menu():
    job_keys = list(JOBS.keys())
    while True:
        print("\n" + "="*50)
        print("AI LEAD GENERATION - MANUAL JOB RUNNER")
        print("="*50)
        print("0. exit (Quit the program)")
        print("1. all (Run all jobs sequentially)")
        
        for i, key in enumerate(job_keys, start=2):
            print(f"{i}. {key}")
            
        print("="*50)
        choice = input("\nSelect a job to run (enter number or name): ").strip()
        
        if not choice:
            continue
            
        match choice.lower():
            case "0" | "exit" | "quit":
                print("Exiting...")
                break
            case "1" | "all":
                await run_job("all")
            case _:
                if choice.isdigit() and 2 <= int(choice) < len(job_keys) + 2:
                    await run_job(job_keys[int(choice) - 2])
                elif choice in JOBS:
                    await run_job(choice)
                else:
                    print("Invalid selection. Please try again.")

def main():
    try:
        asyncio.run(interactive_menu())
    except KeyboardInterrupt:
        print("\nExiting...")

if __name__ == "__main__":
    main()
