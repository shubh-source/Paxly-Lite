from fastapi import APIRouter, HTTPException, Depends
from groq import AsyncGroq
from app.models.schemas import WebsiteGenerateRequest, AIResponse
from app.core.security import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.orm import User, LovePage, Memory, Anniversary
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from datetime import datetime
import json

router = APIRouter(prefix="/website", tags=["Love Website"])

@router.post("/generate")
async def generate_vibe_site(data: WebsiteGenerateRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Check limit for non-premium
    site_res = await db.execute(select(func.count(LovePage.id)).filter(LovePage.couple_space_id == cu.couple_space_id))
    count = site_res.scalar()
    
    if count >= 1:
        # Check if current user is premium (can be expanded later)
        # For now, we allow 1 draft/site total for free
        pass 

    if not settings.GROQ_API_KEY:
        raise HTTPException(503, "AI service not configured.")

    # 1. Gather context for personalization
    # Fetch recent memories to inject into the AI's creative thought process
    res = await db.execute(select(Memory).filter(Memory.couple_space_id == cu.couple_space_id).limit(5))
    memories = res.scalars().all()
    mem_str = "\n".join([f"- {m.title}: {m.description}" for m in memories])

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    
    system_prompt = """You are a world-class creative web designer and 'Vibe Coder'. 
    Your task is to take a user's 'Vibe' prompt and generate a JSON blueprint for a stunning, personalized relationship website.
    
    STYLE RULES:
    - Use premium colors and modern typography.
    - Match the emotional tone of the prompt (Romantic, Apology, Fun, Nostalgic).
    - Output ONLY a valid JSON object.
    
    JSON STRUCTURE:
    {
      "theme_name": "string",
      "colors": { "primary": "hex", "secondary": "hex", "bg": "hex", "text": "hex", "accent": "hex" },
      "font_pair": { "heading": "Google Font Name", "body": "Google Font Name" },
      "animations": "subtle|cinematic|energetic|romantic",
      "blocks": [
        { "type": "hero", "content": { "title": "...", "subtitle": "..." } },
        { "type": "count_up", "content": { "label": "Days of Loving You" } },
        { "type": "letter", "content": { "body": "the love letter content..." } },
        { "type": "memory_grid", "content": { "memories": ["id1", "id2"] } }
      ]
    }
    """

    user_context = f"THEME/VIBE PROMPT: {data.prompt}\n\nCOUPLE CONTEXT (Memories):\n{mem_str}"

    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_context}
            ],
            response_format={"type": "json_object"},
            temperature=0.8
        )
        blueprint = json.loads(response.choices[0].message.content)

        # Search for existing draft for this user
        draft_res = await db.execute(select(LovePage).filter(LovePage.couple_space_id == cu.couple_space_id, LovePage.status == 'draft'))
        page = draft_res.scalars().first()

        if not page:
            page = LovePage(couple_space_id=cu.couple_space_id, created_by=cu.id)
            db.add(page)

        page.vibe_prompt = data.prompt
        page.blueprint = blueprint
        page.music_url = data.music_url
        page.status = "draft"
        
        await db.commit()
        await db.refresh(page)
        
        return page
    except Exception as e:
        raise HTTPException(500, f"Vibe Coding Error: {str(e)}")

@router.get("/my-site")
async def get_my_site(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LovePage).filter(LovePage.couple_space_id == cu.couple_space_id).order_by(LovePage.created_at.desc()))
    return res.scalars().first()

@router.post("/{page_id}/publish")
async def publish_site(page_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LovePage).filter(LovePage.id == page_id))
    page = res.scalars().first()
    if not page: raise HTTPException(404)
    
    page.status = "published"
    page.published_at = datetime.utcnow()
    await db.commit()
    return {"status": "published"}

@router.post("/{page_id}/open")
async def open_website(page_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LovePage).filter(LovePage.id == page_id))
    page = res.scalars().first()
    if not page: raise HTTPException(404)
    page.is_opened = True
    await db.commit()
    return {"ok": True}
