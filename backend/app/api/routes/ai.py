from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from groq import AsyncGroq
from app.models.schemas import AIRequest, AIResponse, AISessionStart, AIInterviewRequest, AIAnalysisReport
from app.core.security import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.orm import User, AICounselingSession, Message, Notification
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, desc
from datetime import datetime, timedelta
import json

router = APIRouter(prefix="/ai", tags=["AI"])

SYSTEM_PROMPT = """You are Aura - a warm, witty, and genuinely caring best friend built into Vlynxly, a private couple's app.

Your personality:
- You talk like a close best friend: casual, real, funny when the moment calls for it
- You can talk about ANYTHING: life, work stress, random thoughts, movies, food, feelings, relationships, advice - literally whatever
- You use a natural, conversational tone. Short replies when the chat is light, longer when something deep comes up
- You mix Hindi or Hinglish naturally if the user writes in Hinglish - match their vibe completely
- You never sound like a bot or a corporate advisor. You sound like a real person who actually cares
- You remember the conversation context and follow up naturally like a real friend would
- You are not just a relationship advisor - you are a companion for every mood: happy, sad, bored, excited, confused, or just wanting to talk

Rules:
- Keep it real. Do not be overly positive or fake. Be genuine
- If someone shares something serious such as mental health or safety issues, be caring and gently suggest professional support too
- Never lecture. Never be preachy. Just listen, respond, and vibe
- Match the energy: if they are joking, joke back. If they are sad, be there for them
- You are NOT a therapist. You are a best friend."""

@router.post("/chat", response_model=AIResponse)
async def ai_chat(data: AIRequest, cu=Depends(get_current_user)):
    # 1. Try Gemini (Free & High Quality)
    if settings.GOOGLE_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel(
                model_name="gemini-2.0-flash",
                system_instruction=SYSTEM_PROMPT
            )
            chat_history = []
            for m in data.messages[:-1]:
                chat_history.append({"role": "user" if m.role == "user" else "model", "parts": [m.content]})
            
            chat = model.start_chat(history=chat_history)
            response = await chat.send_message_async(data.messages[-1].content)
            return AIResponse(reply=response.text)
        except Exception as e:
            print(f"Gemini Error: {e}")
            # Fallback to Groq if Gemini fails but key is there

    # 2. Try Groq (Ultra Fast)
    if settings.GROQ_API_KEY:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        try:
            response = await client.chat.completions.create(
                model="llama3-70b-8192",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    *[{"role": m.role, "content": m.content} for m in data.messages]
                ],
                temperature=0.7,
                max_tokens=400,
            )
            return AIResponse(reply=response.choices[0].message.content)
        except Exception as e:
            raise HTTPException(500, f"AI service error: {str(e)}")

    raise HTTPException(503, "AI service not configured. Add GOOGLE_API_KEY or GROQ_API_KEY to .env")

# ── COUNSELING SESSION LOGIC ────────────────────────────────

async def summarize_history(messages: list, client: AsyncGroq) -> str:
    # Recursively summarize to fit context
    formatted = "\n".join([f"{m.sender_id}: {m.text}" for m in messages if m.text])
    prompt = f"Analyze this chat history between a couple. Summarize the recurring themes, their emotional tone, and identify the main points of friction:\n\n{formatted}"
    
    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": "You are a senior relationship analyst. Your tone is extremely friendly, warm, and insightful."}, {"role": "user", "content": prompt}]
    )
    return resp.choices[0].message.content

@router.post("/session/start")
async def start_session(data: AISessionStart, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id: raise HTTPException(400, "Partner connection required.")
    
    # 1. Fetch History
    since = datetime.utcnow() - timedelta(days=data.days)
    res = await db.execute(select(Message).filter(Message.couple_space_id == cu.couple_space_id, Message.timestamp >= since).order_by(Message.timestamp))
    msgs = res.scalars().all()
    
    if not msgs: raise HTTPException(400, "No chat history found for this period.")

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    
    # 2. Summarize
    synopsis = await summarize_history(msgs, client)
    
    # 3. Create Session
    session = AICounselingSession(
        couple_space_id=cu.couple_space_id,
        history_window_days=data.days,
        history_synopsis=synopsis,
        partner_a_id=cu.id,
        partner_b_id=cu.partner_id,
        status="interviewing"
    )
    db.add(session)
    await db.commit()
    return {"session_id": session.id, "synopsis": synopsis}

@router.post("/session/interview")
async def interview_chat(data: AIInterviewRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AICounselingSession).filter(AICounselingSession.id == data.session_id))
    session = res.scalars().first()
    if not session or session.status != "interviewing": raise HTTPException(400, "No active session.")

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    
    # Role-play as a discovery counselor
    system = f"You are conducting a private, one-on-one interview with {cu.name} regarding their relationship. You have analyzed their chat history and know: {session.history_synopsis}. Be extremely friendly, empathetic, and warm. Ask kind questions to uncover their true feelings and point of view that they haven't shared with their partner yet. Make them feel safe and heard."
    
    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": data.message}],
        temperature=0.7
    )
    return AIResponse(reply=resp.choices[0].message.content)

@router.post("/session/finish-interview")
async def finish_interview(session_id: str, pov: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AICounselingSession).filter(AICounselingSession.id == session_id))
    session = res.scalars().first()
    if not session: raise HTTPException(404)
    
    if cu.id == session.partner_a_id:
        session.partner_a_pov = pov
    else:
        session.partner_b_pov = pov
        
    await db.commit()
    
    # Check if both done
    if session.partner_a_pov and session.partner_b_pov:
        # Trigger report generation
        return await finalize_session(session, db)
    
    return {"status": "waiting_for_partner"}

async def finalize_session(session: AICounselingSession, db: AsyncSession):
    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    
    prompt = f"""Generate a RELATIONAL SYNTHESIS REPORT for this couple.
    
    HISTORY SUMMARY: {session.history_synopsis}
    PARTNER A'S POV: {session.partner_a_pov}
    PARTNER B'S POV: {session.partner_b_pov}
    
    Output in JSON format only with these keys: 
    pros: list of positives items, 
    cons: list of friction points, 
    core_issue: a deep explanation of the underlying problem, 
    resolution: practical steps for both to move forward, 
    summary: a compassionate closing message explaining each other's inner condition to one another.
    """
    
    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "system", "content": "You are a world-class relationship mediator. Provide a structured JSON analysis. Your tone in the summary should be extremely friendly, warm, and compassionate."}, {"role": "user", "content": prompt}],
        response_format={"type": "json_object"}
    )
    
    report_data = json.loads(resp.choices[0].message.content)
    session.final_report = report_data
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    
    # Notifications
    db.add(Notification(user_id=session.partner_a_id, type="ai_report", title="Relationship Report Ready ✨", body="Your AI Counselor has finished the analysis."))
    db.add(Notification(user_id=session.partner_b_id, type="ai_report", title="Relationship Report Ready ✨", body="Your AI Counselor has finished the analysis."))
    
    await db.commit()
    return report_data