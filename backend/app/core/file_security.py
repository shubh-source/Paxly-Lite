import os
import uuid
from typing import Tuple, Optional
from fastapi import UploadFile, HTTPException
import aiofiles

# Maximum file size limits
DEFAULT_MAX_MB = 15
FREE_LIMIT_BYTES = 5 * 1024 * 1024

# Dangerous signatures that must NEVER be accepted as chat media
DANGEROUS_SIGNATURES = [
    b"MZ",                       # Windows PE / EXE / DLL
    b"\x7fELF",                  # Linux ELF executable
    b"\xfe\xed\xfa\xce",         # Mach-O 32-bit
    b"\xfe\xed\xfa\xcf",         # Mach-O 64-bit
    b"\xce\xfa\xed\xfe",         # Mach-O reverse 32-bit
    b"\xcf\xfa\xed\xfe",         # Mach-O reverse 64-bit
    b"#!",                       # Unix shell script
    b"<?php",                    # PHP script
    b"<?=",                      # PHP shorthand
    b"<script",                  # HTML script tag
    b"<html",                    # HTML document
    b"\xca\xfe\xba\xbe",         # Java class file
    b"PK\x03\x04",               # ZIP archive (disguised executables / archives)
    b"Rar!\x1a\x07",             # RAR archive
    b"\x1f\x8b\x08",             # GZIP archive
    b"7z\xbc\xaf\x27\x1c",       # 7-Zip archive
]

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp",
    "mp4", "mp3", "m4a", "ogg", "webm",
    "heic", "mov", "enc"
}

def is_disallowed_binary_or_script(header: bytes) -> bool:
    """Returns True if the byte header matches known executable or script signatures."""
    if not header:
        return True
    clean_header = header.lstrip()
    clean_lower = clean_header.lower()

    for sig in DANGEROUS_SIGNATURES:
        if clean_header.startswith(sig) or clean_lower.startswith(sig.lower()):
            return True
    return False

def validate_media_magic_bytes(header: bytes, ext: str) -> bool:
    """
    Validates file magic bytes against the declared extension.
    For encrypted media (NaCl secretbox), verifies minimum size and absence of dangerous headers.
    """
    if is_disallowed_binary_or_script(header):
        return False

    ext = ext.lower()

    # 1. Image formats
    if ext in ("jpg", "jpeg"):
        return header.startswith(b"\xff\xd8\xff")
    elif ext == "png":
        return header.startswith(b"\x89PNG\r\n\x1a\n")
    elif ext == "gif":
        return header.startswith(b"GIF87a") or header.startswith(b"GIF89a")
    elif ext == "webp":
        return header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP"
    elif ext == "heic":
        return len(header) >= 12 and b"ftyp" in header[:12]

    # 2. Audio & Video formats
    elif ext in ("mp4", "m4a", "mov"):
        return len(header) >= 8 and (b"ftyp" in header[:12] or b"moov" in header[:12] or b"wide" in header[:12])
    elif ext == "webm":
        return header.startswith(b"\x1a\x45\xdf\xa3")
    elif ext == "ogg":
        return header.startswith(b"OggS")
    elif ext == "mp3":
        return header.startswith(b"ID3") or header.startswith(b"\xff\xfb") or header.startswith(b"\xff\xf3") or header.startswith(b"\xff\xf2")

    # 3. Encrypted binary media blobs (from client-side NaCl secretbox)
    elif ext in ("enc", "blob", "bin"):
        # Encrypted blobs have 24-byte nonce + 16-byte Poly1305 auth tag (min 40 bytes)
        return len(header) >= 40

    return False

async def stream_and_validate_upload(
    file: UploadFile,
    space_id: str,
    max_bytes: int,
    target_dir: str,
    preferred_ext: Optional[str] = None
) -> Tuple[str, int]:
    """
    Streams the upload file directly to disk in chunks, validating:
    - Allowed extension
    - File size limits (raises 413)
    - Magic bytes and absence of disguised executables/scripts (raises 400)
    - Non-empty payload (raises 400)

    Returns (filename, total_bytes).
    Avoids loading arbitrarily large files into memory.
    """
    original_name = file.filename or "upload.jpg"
    raw_ext = original_name.split(".")[-1].lower() if "." in original_name else "jpg"
    if raw_ext in ("blob", "bin", "octet-stream", ""):
        raw_ext = preferred_ext or "jpg"

    if raw_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File extension '{raw_ext}' is not allowed."
        )

    safe_name = f"{space_id}_{uuid.uuid4().hex}.{raw_ext}"
    os.makedirs(target_dir, exist_ok=True)
    temp_path = os.path.join(target_dir, f"tmp_{safe_name}")
    final_path = os.path.join(target_dir, safe_name)

    chunk_size = 64 * 1024  # 64 KB streaming chunks
    total_size = 0
    header_bytes = b""
    is_valid_format = False

    try:
        async with aiofiles.open(temp_path, "wb") as out_file:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break

                if not header_bytes:
                    header_bytes = chunk[:128]
                    # Validate magic bytes / content
                    # If plain extension doesn't match standard magic bytes, check if it is a valid encrypted blob
                    if is_disallowed_binary_or_script(header_bytes):
                        raise HTTPException(
                            status_code=400,
                            detail="Upload rejected: Disallowed executable or dangerous file signature detected."
                        )

                    if validate_media_magic_bytes(header_bytes, raw_ext):
                        is_valid_format = True
                    elif len(chunk) >= 40 and not is_disallowed_binary_or_script(header_bytes):
                        # Client-side encrypted media with standard extension
                        is_valid_format = True
                    else:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Upload rejected: File content does not match allowed format for '{raw_ext}'."
                        )

                total_size += len(chunk)
                if total_size > max_bytes:
                    limit_mb = max_bytes // (1024 * 1024)
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed size is {limit_mb}MB."
                    )

                await out_file.write(chunk)

        if total_size == 0 or not is_valid_format:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise HTTPException(status_code=400, detail="Uploaded file is empty or corrupted.")

        # Atomically rename temp file to final safe name
        if os.path.exists(final_path):
            os.remove(final_path)
        os.rename(temp_path, final_path)

        return safe_name, total_size

    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass
        raise
