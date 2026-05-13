"""
One-shot encryption-key rotation utility.

Run after prepending a new key to ``ENCRYPTION_KEY`` in the environment.
The script walks every row in ``api_providers``, decrypts each
``encrypted_api_key`` (MultiFernet automatically uses whichever stored key
matches), and re-encrypts it with the current primary key. Once the script
finishes, you can safely drop the old key from ``ENCRYPTION_KEY``.

Usage::
    # 1. Generate a new key:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

    # 2. Set ENCRYPTION_KEY="<new_key>,<old_key>" in your .env
    #    (new first → primary, old second → still decrypts existing rows)

    # 3. Run this script:
    python -m scripts.rotate_encryption_key

    # 4. After success, update ENCRYPTION_KEY to just the new key.

Idempotent: rows already encrypted with the primary key are re-encrypted as
a no-op (same key, fresh IV).
"""

from __future__ import annotations

import asyncio
import sys

from loguru import logger
from sqlalchemy import select, update

from app.core.database import get_session_maker
from app.core.key_encryption import (
    InvalidToken,
    decrypt_api_key,
    encrypt_api_key,
)
from app.models.infrastructure import APIProvider


async def main() -> int:
    session_maker = get_session_maker()
    rotated = 0
    skipped = 0
    failed = 0

    async with session_maker() as session:
        rows = list((await session.execute(select(APIProvider))).scalars())
        for row in rows:
            try:
                plaintext = decrypt_api_key(row.encrypted_api_key)
            except (InvalidToken, ValueError) as e:
                logger.error(
                    "  ✗ {} ({} / {}): cannot decrypt — {}",
                    row.id, row.provider_name, row.use_case, e,
                )
                failed += 1
                continue

            new_cipher = encrypt_api_key(plaintext)
            if new_cipher == row.encrypted_api_key:
                # Won't happen in practice — Fernet uses a fresh IV every
                # call — but treat as a no-op if it ever does.
                skipped += 1
                continue

            await session.execute(
                update(APIProvider)
                .where(APIProvider.id == row.id)
                .values(encrypted_api_key=new_cipher)
            )
            rotated += 1

        await session.commit()

    logger.info(
        "Rotation complete: {} rotated, {} skipped, {} failed.",
        rotated, skipped, failed,
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
