import os
import aiofiles
from supabase import create_client, Client
from app.core.config import settings

class StorageService:
    def __init__(self):
        self.mode = settings.STORAGE_MODE
        if self.mode == "supabase":
            self.supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
            self.bucket = settings.SUPABASE_BUCKET

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
