import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import or_

from app.core.config import settings
from app.core.storage import storage
from app.models.orm import Message, Memory, VoiceNote, CoupleSpace, MediaCleanupQueue

logger = logging.getLogger(__name__)


def extract_filename_and_folder(media_url: Optional[str]) -> Tuple[Optional[str], str]:
    """
    Extracts the sanitized filename and storage folder from a media URL.
    Returns (None, 'chat') if URL is invalid or contains traversal tokens.
    """
    if not media_url or not isinstance(media_url, str):
        return None, "chat"

    # Strip query parameters and fragment
    clean_url = media_url.split("?")[0].split("#")[0]
    filename = clean_url.split("/")[-1].strip()

    # Traversal and validity defense
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        return None, "chat"

    folder = "voice" if "/voice/" in clean_url or "/voice_notes/" in clean_url else "chat"
    return filename, folder


async def is_media_referenced(
    db: AsyncSession,
    filename: str,
    exclude_message_id: Optional[str] = None
) -> bool:
    """
    Determines whether a media file is referenced by any other entity:
    - Active messages in any couple space (excluding exclude_message_id)
    - Saved memories (Memory Vault)
    - Voice notes
    - Couple space wallpapers
    Returns True if at least one reference exists, False if unshared/unreferenced.
    """
    if not filename:
        return False

    # 1. Check Messages (excluding the one being deleted)
    msg_stmt = select(Message.id).filter(
        Message.media_url.contains(filename)
    )
    if exclude_message_id:
        msg_stmt = msg_stmt.filter(Message.id != exclude_message_id)

    msg_res = await db.execute(msg_stmt)
    if msg_res.first():
        return True

    # 2. Check Saved Memories in Memory Vault
    mem_res = await db.execute(
        select(Memory.id).filter(Memory.image_url.contains(filename))
    )
    if mem_res.first():
        return True

    # 3. Check Voice Notes
    vn_res = await db.execute(
        select(VoiceNote.id).filter(
            or_(VoiceNote.filename == filename, VoiceNote.url.contains(filename))
        )
    )
    if vn_res.first():
        return True

    # 4. Check CoupleSpace Wallpapers
    space_res = await db.execute(
        select(CoupleSpace.id).filter(CoupleSpace.chat_wallpaper.contains(filename))
    )
    if space_res.first():
        return True

    return False


async def enqueue_cleanup_job(
    db: AsyncSession,
    filename: str,
    folder: str = "chat",
    space_id: Optional[str] = None
) -> MediaCleanupQueue:
    """
    Records a persistent cleanup job in the database before or during deletion.
    """
    job = MediaCleanupQueue(
        id=str(uuid.uuid4()),
        filename=filename,
        folder=folder,
        couple_space_id=space_id,
        attempts=0,
        status="pending",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(job)
    await db.flush()
    return job


async def cleanup_message_media_if_unshared(
    db: AsyncSession,
    media_url: Optional[str],
    exclude_message_id: Optional[str] = None,
    space_id: Optional[str] = None
) -> dict:
    """
    Safely cleans up the underlying media file if and only if no other entity references it.
    Uses an idempotent queue record to guarantee durability and retry capability.
    """
    filename, folder = extract_filename_and_folder(media_url)
    if not filename:
        return {"deleted": False, "reason": "no_filename"}

    # Verify references across all tables
    referenced = await is_media_referenced(db, filename, exclude_message_id=exclude_message_id)
    if referenced:
        logger.info(f"Media {filename} preserved: still referenced by another record.")
        return {"deleted": False, "reason": "still_referenced", "filename": filename}

    # Enqueue durable cleanup job
    job = await enqueue_cleanup_job(db, filename, folder, space_id)
    await db.commit()

    # Attempt immediate storage deletion
    try:
        await storage.delete_file(filename, folder)
        job.status = "completed"
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"deleted": True, "filename": filename, "status": "completed"}
    except Exception as e:
        logger.error(f"Storage deletion failed for {filename}: {e}")
        job.attempts += 1
        job.last_error = str(e)
        job.status = "failed"
        job.updated_at = datetime.now(timezone.utc)
        await db.commit()
        return {"deleted": False, "reason": "storage_error", "error": str(e), "filename": filename}


async def retry_failed_cleanups(db: AsyncSession, max_attempts: int = 5) -> int:
    """
    Processes pending and failed cleanup jobs from the queue.
    Ensures media is still unreferenced before attempting deletion.
    """
    res = await db.execute(
        select(MediaCleanupQueue).filter(
            MediaCleanupQueue.status.in_(["pending", "failed"]),
            MediaCleanupQueue.attempts < max_attempts
        )
    )
    jobs = res.scalars().all()
    cleaned_count = 0

    for job in jobs:
        try:
            # Re-verify no new references appeared
            if await is_media_referenced(db, job.filename):
                job.status = "completed"  # Cancel deletion because it was re-referenced
                job.last_error = "Re-referenced before cleanup; deletion cancelled"
                job.updated_at = datetime.now(timezone.utc)
                continue

            await storage.delete_file(job.filename, job.folder)
            job.status = "completed"
            job.updated_at = datetime.now(timezone.utc)
            cleaned_count += 1
        except Exception as e:
            job.attempts += 1
            job.last_error = str(e)
            job.status = "failed"
            job.updated_at = datetime.now(timezone.utc)

    await db.commit()
    return cleaned_count
