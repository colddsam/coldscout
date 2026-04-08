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
        masked_val = f"{val[:8]}...[REDACTED]"
        print(f"✅ {key}: {masked_val}")
        print(f"   ↳ {desc}\n")

    print("-" * 50)
    
    # Handle file output
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
        confirm = input("\n💡 .env file not found. Create one with these secrets? (y/n): ").lower()
        if confirm == 'y':
            try:
                with open(env_path, "w") as f:
                    f.write("# Generated Secrets\n")
                    for key, val in results.items():
                        f.write(f"{key}={val}\n")
                print(f"\n✨ Created {env_path} successfully!")
            except Exception as e:
                print(f"❌ Error creating .env: {e}")
        else:
            print("\n⚠️  Secrets were NOT saved. Please run again and select 'y' to save to .env.")

    print("\n" + "="*50)
    print(" 📝 INSTRUCTIONS:")
    print(" 1. Ensure secrets are added to your Render/Vercel dashboards.")
    print(" 2. NEVER share your .env file publicly.")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
