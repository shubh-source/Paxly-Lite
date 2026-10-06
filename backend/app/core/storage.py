import os
import aiofiles
from app.core.config import settings

class StorageService:
    def __init__(self):
        self.mode = settings.STORAGE_MODE
        self._supabase = None
        self.bucket = settings.SUPABASE_BUCKET

    @property
    def supabase(self):
        if self._supabase is None:
            if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
                raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set to use Supabase storage.")
            from supabase import create_client
            self._supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
        return self._supabase

    async def upload_file(self, content: bytes, filename: str, folder: str = "general") -> str:
        """
        Uploads a file and returns the public URL.
        """
        if self.mode == "supabase":
            path = f"{folder}/{filename}"
            # Supabase upload expects bytes
            self.supabase.storage.from_(self.bucket).upload(
                path=path,
                file=content,
                file_options={"content-type": "image/jpeg"} # Default, can be optimized
            )
            # Return public URL
            res = self.supabase.storage.from_(self.bucket).get_public_url(path)
            return res
        else:
            # Local Storage
            path = os.path.join(settings.MEDIA_DIR, folder, filename)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            async with aiofiles.open(path, "wb") as f:
                await f.write(content)
            return f"{settings.BACKEND_URL}/media/{folder}/{filename}"

    async def delete_file(self, filename: str, folder: str = "general"):
        if self.mode == "supabase":
            path = f"{folder}/{filename}"
            self.supabase.storage.from_(self.bucket).remove([path])
        else:
            path = os.path.join(settings.MEDIA_DIR, folder, filename)
            if os.path.exists(path):
                os.remove(path)

# Global instances
storage = StorageService()
