from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import HTMLResponse
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import delete, update
from app.models.orm import User, SurprisePage
from app.core.security import get_current_user
from app.core.database import get_db
from app.core.config import settings
from pydantic import BaseModel
from typing import Optional, List
import os, shutil, httpx, uuid, aiofiles

router = APIRouter(prefix="/surprise", tags=["Surprise Pages"])

SURPRISE_DIR = os.path.join(settings.MEDIA_DIR, "surprises")
os.makedirs(SURPRISE_DIR, exist_ok=True)

# API Key from settings
ANTHROPIC_API_KEY = settings.ANTHROPIC_API_KEY

# ── MODELS ────────────────────────────────────────────────────
class SurpriseCreate(BaseModel):
    occasion: str
    recipient_name: str
    sender_name: str
    message: str
    vibe: Optional[str] = "romantic"  # romantic, vintage, futuristic, minimalist
    song_url: Optional[str] = ""
    photos: Optional[List[str]] = []
    videos: Optional[List[str]] = []
    voice_notes: Optional[List[str]] = []

# ── AI HTML GENERATOR ─────────────────────────────────────────
async def generate_surprise_page(data: SurpriseCreate, page_id: str) -> str:
    """Claude API to generate a stunning, premium, responsive one-page website"""
    prompt = f"""
    Create a stunning, responsive, and interactive one-page website for a romantic surprise.
    Occasion: {data.occasion}
    To: {data.recipient_name}
    From: {data.sender_name}
    Message: {data.message}
    Vibe: {data.vibe}
    
    The website must include:
    1. A hero section with a romantic title.
    2. A message section with beautiful typography.
    3. A photo gallery (use these URLs: {data.photos}).
    4. A video section (use these URLs: {data.videos}).
    5. A voice note player section (use these URLs: {data.voice_notes}).
    6. Modern CSS (Glassmorphism, gradients, smooth animations).
    7. Responsive design (works on mobile and desktop).
    8. NO placeholders. Use the data provided.
    
    Return ONLY the complete, single-file HTML (including CSS).
    """
    
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                json={
                    "model": "claude-3-opus-20240229",
                    "max_tokens": 4000,
                    "messages": [{"role": "user", "content": prompt}]
                }
            )
            res_json = resp.json()
            html = res_json['content'][0]['text']
            # Clean up if AI wrapped it in markdown
            if "```html" in html:
                html = html.split("```html")[1].split("```")[0].strip()
            return html
        except Exception as e:
            print(f"AI Gen Error: {e}")
            return f"<html><body style='background:#000;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>Surprise for {data.recipient_name}</h1><p>{data.message}</p></body></html>"

@router.post("/upload-video")
async def upload_video(file: UploadFile = File(...), cu: User = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["mp4", "mov", "webm"]:
        raise HTTPException(400, "Invalid video type.")
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(SURPRISE_DIR, "videos", filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"url": f"/media/surprises/videos/{filename}"}

@router.post("/upload-voice")
async def upload_voice(file: UploadFile = File(...), cu: User = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["mp3", "wav", "m4a", "ogg"]:
        raise HTTPException(400, "Invalid audio type.")
    filename = f"{uuid.uuid4()}.{ext}"
    path = os.path.join(SURPRISE_DIR, "voice", filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(await file.read())
    return {"url": f"/media/surprises/voice/{filename}"}

@router.post("/create")
async def create_surprise(data: SurpriseCreate, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    page_id = str(uuid.uuid4())[:12]
    html = await generate_surprise_page(data, page_id)
    
    page_dir = os.path.join(SURPRISE_DIR, page_id)
    os.makedirs(page_dir, exist_ok=True)
    async with aiofiles.open(os.path.join(page_dir, "index.html"), "w", encoding="utf-8") as f:
        await f.write(html)
        
    new_page = SurprisePage(
        id=page_id,
        user_id=cu.id,
        user_name=cu.name,
        couple_space_id=cu.couple_space_id,
        occasion=data.occasion,
        recipient_name=data.recipient_name,
        sender_name=data.sender_name,
        color_theme=data.vibe,
        photos=data.photos,
        videos=data.videos,
        voice_notes=data.voice_notes,
        created_at=datetime.utcnow(),
        views=0
    )
    db.add(new_page)
    await db.commit()
    return {"page_id": page_id, "url": f"/surprise/view/{page_id}"}

@router.get("/view/{page_id}", response_class=HTMLResponse)
async def view_surprise(page_id: str, db: AsyncSession = Depends(get_db)):
    page_path = os.path.join(SURPRISE_DIR, page_id, "index.html")
    if not os.path.exists(page_path):
        raise HTTPException(404, "Surprise page not found or expired.")
    
    await db.execute(update(SurprisePage).filter(SurprisePage.id == page_id).values(views=SurprisePage.views + 1))
    await db.commit()
    
    async with aiofiles.open(page_path, "r", encoding="utf-8") as f:
        return await f.read()

@router.get("/my")
async def my_surprises(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SurprisePage).filter(SurprisePage.user_id == cu.id).order_by(SurprisePage.created_at.desc()))
    return result.scalars().all()

@router.delete("/{page_id}")
async def delete_surprise(page_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(delete(SurprisePage).filter(SurprisePage.id == page_id, SurprisePage.user_id == cu.id))
    await db.commit()
    if result.rowcount == 0:
        raise HTTPException(404, "Not found.")
    
    shutil.rmtree(os.path.join(SURPRISE_DIR, page_id), ignore_errors=True)
    return {"ok": True}

@router.post("/upload-photo")
async def upload_photo(file: UploadFile = File(...), cu: User = Depends(get_current_user)):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ["jpg", "jpeg", "png", "webp", "gif"]:
        raise HTTPException(400, "Invalid file type.")
    
    filename = f"{uuid.uuid4()}.{ext}"
    photo_dir = os.path.join(SURPRISE_DIR, "photos")
    os.makedirs(photo_dir, exist_ok=True)
    path = os.path.join(photo_dir, filename)
    
    with open(path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    return {"url": f"/media/surprises/photos/{filename}"}
