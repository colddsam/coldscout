"""
scripts/manual_trigger.py
=========================
Command-line utility for manually executing the full AI lead generation pipeline.

**Purpose:**
The pipeline normally runs on a schedule managed by APScheduler. This script
bypasses the scheduler entirely and runs the pipeline synchronously, making it
invaluable for:
  - Debugging pipeline stages without waiting for the scheduled cron time.
  - Running a one-off discovery sweep outside of business hours.
  - Verifying that a newly configured environment (new API keys, etc.) works end-to-end.

**Usage:**
    cd "AI LEAD GENERATION"

    # Run the full pipeline and send real emails:
    python scripts/manual_trigger.py

    # Run without sending any emails (dry run for testing logic only):
    python scripts/manual_trigger.py --dry-run

**Note:**
This executes the pipeline synchronously in the current process. For long pipeline
runs, expect this script to block for several minutes while discovery, scraping,
qualification, and outreach stages complete.
"""

import argparse
import sys
import os

# Add project root to sys.path so that `from app...` imports work correctly
# when this script is run directly from the `scripts/` sub-directory.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.tasks.daily_pipeline import run_manual_full_pipeline

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Manually trigger the full AI Lead Generation Pipeline."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate the pipeline without actually sending emails. Useful for testing.",
    )
    args = parser.parse_args()

    print(f"🚀 Starting Manual Pipeline — Dry run: {args.dry_run}")

    # Call the pipeline function directly (bypasses APScheduler, runs synchronously)
    run_manual_full_pipeline()

    print("✅ Pipeline executed synchronously. Check logs for detailed output.")
