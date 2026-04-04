"""
AI Lead Generation System - Security Secret Generator

This utility automates the creation of cryptographically secure keys 
required for production deployment. It generates:
1. APP_SECRET_KEY (JWT signing)
2. API_KEY (Header validation)
3. SECURITY_SALT (Email link signing)

Usage:
    python scripts/generate_secrets.py
"""

import os
import secrets
from pathlib import Path

def generate_hex(length=32):
    return secrets.token_hex(length)

def main():
    print("\n" + "="*50)
    print(" 🛡️  SECURITY SECRET GENERATOR")
    print("="*50 + "\n")

    secrets_to_gen = {
        "APP_SECRET_KEY": "Used for session encryption and JWT tokens.",
        "API_KEY": "Used for X-API-Key header validation.",
        "SECURITY_SALT": "Used for signing tracking and unsubscribe links."
    }

    results = {}
    for key, desc in secrets_to_gen.items():
        val = generate_hex()
        results[key] = val
        print(f"✅ {key}: {val}")
        print(f"   ↳ {desc}\n")

    print("-" * 50)
    
    # Check if .env exists to offer auto-update
    env_path = Path(".env")
    if env_path.exists():
        confirm = input("Would you like to append these to your .env file? (y/n): ").lower()
        if confirm == 'y':
            try:
                with open(env_path, "a") as f:
                    f.write("\n# --- Generated Secrets ---\n")
                    for key, val in results.items():
                        f.write(f"{key}={val}\n")
                print("\n✨ .env file updated successfully!")
            except Exception as e:
                print(f"❌ Error updating .env: {e}")
    else:
        print("\n💡 Tip: Create a .env file to store these securely.")

    print("\n" + "="*50)
    print(" 📝 INSTRUCTIONS:")
    print(" 1. Copy the keys above if not appended.")
    print(" 2. Ensure they are added to your Render/Vercel dashboards.")
    print(" 3. NEVER share your .env file publicly.")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
