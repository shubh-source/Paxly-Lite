from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from groq import AsyncGroq
from app.models.schemas import AIRequest, AIResponse, AISessionStart, AIInterviewRequest, AIAnalysisReport
from app.core.security import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.orm import User, AICounselingSession, Message, Notification, Anniversary, AIChatThread
from app.core.encryption import encrypt_data, decrypt_data
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, desc
from datetime import datetime, timedelta
import json
import re
from pydantic import BaseModel

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
async def ai_chat(data: AIRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    partner_name = "your partner"
    dates_info = ""
    
    if cu.partner_id:
        p_res = await db.execute(select(User).filter(User.id == cu.partner_id))
        partner = p_res.scalars().first()
        if partner:
            partner_name = partner.name

    if cu.couple_space_id:
        dates_res = await db.execute(select(Anniversary).filter(Anniversary.couple_space_id == cu.couple_space_id))
        dates = dates_res.scalars().all()
        if dates:
            dates_info = "Important Dates:\n" + "\n".join([f"- {d.title} ({d.type}): {d.date}" for d in dates])
        else:
            dates_info = "Important Dates: None currently saved. If the user doesn't have any dates saved, you can let them know that their 'Important Dates' section is empty and warmly ask if they'd like to add one."
            
    signup_date = cu.created_at.strftime("%B %d, %Y") if cu.created_at else "Unknown"
            
    special_commands = ""
    if cu.is_premium:
        special_commands = """
    Special Commands:
    - If the user asks you to save an important date, you MUST output this exact string somewhere in your response: [ADD_DATE: YYYY-MM-DD: Title: Type]
      - "Type" must be one of: anniversary, birthday, first_date
      - Example: [ADD_DATE: 2023-07-27: Our First Meeting: first_date]
      - The system will automatically intercept this and save it to the database. You should also verbally confirm to the user that you've saved it."""

    dynamic_prompt = f"""{SYSTEM_PROMPT}
    
    Context:
    - User's name: {cu.name}
    - Partner's name: {partner_name}
    - User's Vlynxly signup date: {signup_date}
    {dates_info}
    {special_commands}
    """

    reply_text = ""

    # 1. Try Gemini (Free & High Quality)
    if settings.GOOGLE_API_KEY and not reply_text:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            
            # Merge frontend system prompts
            frontend_system_prompt = ""
            for m in data.messages:
                if m.role == "system":
                    frontend_system_prompt += "\n" + m.content
            
            final_system_prompt = dynamic_prompt + frontend_system_prompt

            model = genai.GenerativeModel(
                model_name="gemini-2.5-flash",
                system_instruction=final_system_prompt
            )
            chat_history = []
            for m in data.messages[:-1]:
                if m.role == "system": continue
                parts = [m.content]
                if m.attachments:
                    for att in m.attachments:
                        parts.append({"mime_type": att.mime_type, "data": att.data})
                chat_history.append({"role": "user" if m.role == "user" else "model", "parts": parts})
            
            chat = model.start_chat(history=chat_history)
            
            # Prepare last message parts
            last_msg = data.messages[-1]
            last_parts = [last_msg.content]
            if last_msg.attachments:
                for att in last_msg.attachments:
                    last_parts.append({"mime_type": att.mime_type, "data": att.data})
                    
            response = await chat.send_message_async(last_parts)
            reply_text = response.text
        except Exception as e:
            print(f"Gemini Error: {e}")
            # Fallback to Groq if Gemini fails but key is there

    # 2. Try Groq (Ultra Fast)
    if settings.GROQ_API_KEY and not reply_text:
        import httpx
        custom_client = httpx.AsyncClient(headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"})
        client = AsyncGroq(api_key=settings.GROQ_API_KEY, http_client=custom_client)
        try:
            # Fix surrogates that cause Groq python client to crash
            clean_messages = []
            
            # Merge frontend system prompts into the dynamic prompt
            frontend_system_prompt = ""
            for m in data.messages:
                if m.role == "system":
                    frontend_system_prompt += "\n" + m.content
                    
            final_system_prompt = dynamic_prompt + frontend_system_prompt
            clean_messages.append({"role": "system", "content": final_system_prompt})
            
            for m in data.messages:
                if m.role != "system":
                    clean_content = m.content.encode('utf-16', 'surrogatepass').decode('utf-16')
                    clean_messages.append({"role": m.role, "content": clean_content})

            response = await client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=clean_messages,
                temperature=0.7,
                max_tokens=400,
            )
            reply_text = response.choices[0].message.content
        except Exception as e:
            print(f"Groq Error: {e}")
            raise HTTPException(500, f"AI service error: {str(e)}")

    if not reply_text:
        raise HTTPException(503, "AI service not configured. Add GOOGLE_API_KEY or GROQ_API_KEY to .env")

    # Post-process: Check if AI wants to add a date
    match = re.search(r'\[ADD_DATE:\s*([^:]+):\s*([^:]+):\s*([^\]]+)\]', reply_text)
    if match and cu.couple_space_id and cu.is_premium:
        try:
            date_val = match.group(1).strip()
            title_val = match.group(2).strip()
            type_val = match.group(3).strip()
            
            new_date = Anniversary(
                couple_space_id=cu.couple_space_id,
                date=date_val,
                title=title_val,
                type=type_val
            )
            db.add(new_date)
            await db.commit()
            
            # Remove the tag from the final reply
            reply_text = reply_text.replace(match.group(0), "").strip()
        except Exception as e:
            print(f"Failed to save date from AI: {e}")

    return AIResponse(reply=reply_text)

# ── COUNSELING SESSION LOGIC ────────────────────────────────

async def summarize_history(history_text: str) -> str:
    prompt = f"Analyze this chat history between a couple. Summarize the recurring themes, their emotional tone, and identify the main points of friction:\n\n{history_text}"
    
    system = "You are a senior relationship analyst. Your tone is extremely friendly, warm, and insightful."
    
    if settings.GOOGLE_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system)
            resp = await model.generate_content_async(prompt)
            return resp.text
        except Exception:
            pass
            
    if settings.GROQ_API_KEY:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}]
        )
        return resp.choices[0].message.content
        
    raise Exception("No AI configured")

@router.get("/session/active")
async def get_active_session(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id: return None
    res = await db.execute(select(AICounselingSession).filter(
        AICounselingSession.couple_space_id == cu.couple_space_id
    ).order_by(desc(AICounselingSession.created_at)).limit(1))
    
    session = res.scalars().first()
    if not session: return None
    
    # Determine user's POV status
    my_pov_done = False
    if cu.id == session.partner_a_id and session.partner_a_pov: my_pov_done = True
    elif cu.id == session.partner_b_id and session.partner_b_pov: my_pov_done = True
    
    return {
        "session_id": session.id,
        "status": session.status,
        "my_pov_done": my_pov_done,
        "final_report": session.final_report
    }

@router.get("/session/history")
async def get_session_history(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id: return []
    res = await db.execute(select(AICounselingSession).filter(
        AICounselingSession.couple_space_id == cu.couple_space_id,
        AICounselingSession.status == "completed"
    ).order_by(desc(AICounselingSession.completed_at)))
    return [{"id": s.id, "completed_at": s.completed_at, "report": s.final_report} for s in res.scalars().all()]

@router.post("/session/start")
async def start_session(data: AISessionStart, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.couple_space_id: raise HTTPException(400, "Partner connection required.")
    
    if not data.chat_history:
        raise HTTPException(400, "No chat history provided.")

    # 2. Generate Summary
    try:
        summary = await summarize_history(data.chat_history)
    except Exception as e:
        raise HTTPException(500, f"AI generation failed: {str(e)}")
    
    # 3. Create Session
    session = AICounselingSession(
        couple_space_id=cu.couple_space_id,
        history_window_days=data.days,
        history_synopsis=summary,
        partner_a_id=cu.id,
        partner_b_id=cu.partner_id,
        status="interviewing"
    )
    db.add(session)
    
    # Notify partner that session has started
    from app.models.orm import Notification
    db.add(Notification(
        user_id=cu.partner_id,
        type="ai_report",
        title="AI Deep Lab Started 🧠",
        body=f"{cu.name} has initiated a Deep Lab session! Tap to join the interview."
    ))
    
    await db.commit()
    return {"session_id": session.id, "synopsis": synopsis}

@router.post("/session/interview")
async def interview_chat(data: AIInterviewRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AICounselingSession).filter(AICounselingSession.id == data.session_id))
    session = res.scalars().first()
    if not session or session.status != "interviewing": raise HTTPException(400, "No active session.")

    system = f"You are conducting a private, one-on-one interview with {cu.name} regarding their relationship. You have analyzed their chat history and know: {session.history_synopsis}. Be extremely friendly, empathetic, and warm. Ask kind questions to uncover their true feelings and point of view that they haven't shared with their partner yet. Make them feel safe and heard."
    
    if settings.GOOGLE_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system)
            resp = await model.generate_content_async(data.message)
            return AIResponse(reply=resp.text)
        except Exception:
            pass
            
    if settings.GROQ_API_KEY:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": data.message}],
            temperature=0.7
        )
        return AIResponse(reply=resp.choices[0].message.content)
        
    raise HTTPException(503, "AI service not configured.")

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
    
    system = "You are a world-class relationship mediator. Provide a structured JSON analysis. Your tone in the summary should be extremely friendly, warm, and compassionate. Output ONLY raw JSON."
    
    report_data = None
    if settings.GOOGLE_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system)
            resp = await model.generate_content_async(prompt)
            # Clean up potential markdown formatting from Gemini
            cleaned = resp.text.strip()
            if cleaned.startswith("```json"): cleaned = cleaned[7:]
            if cleaned.startswith("```"): cleaned = cleaned[3:]
            if cleaned.endswith("```"): cleaned = cleaned[:-3]
            report_data = json.loads(cleaned.strip())
        except Exception as e:
            print(f"Gemini fallback error: {e}")
            pass
            
    if not report_data and settings.GROQ_API_KEY:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        report_data = json.loads(resp.choices[0].message.content)
        
    if not report_data:
        raise HTTPException(500, "Could not generate report")
    session.final_report = report_data
    session.status = "completed"
    session.completed_at = datetime.utcnow()
    
    # Notifications
    db.add(Notification(user_id=session.partner_a_id, type="ai_report", title="Relationship Report Ready ✨", body="Your AI Counselor has finished the analysis."))
    db.add(Notification(user_id=session.partner_b_id, type="ai_report", title="Relationship Report Ready ✨", body="Your AI Counselor has finished the analysis."))
    
    await db.commit()
    return report_data

@router.get("/analytics")
async def deep_analytics(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not cu.is_premium:
        raise HTTPException(403, "Premium feature only")
    if not cu.couple_space_id:
        raise HTTPException(400, "Partner connection required.")

    # 1. Fetch last 30 days chat metadata
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    messages_res = await db.execute(select(Message).filter(
        Message.couple_space_id == cu.couple_space_id,
        Message.timestamp >= thirty_days_ago
    ))
    messages = messages_res.scalars().all()
    
    # Generate metadata summary (no actual message content to save tokens, or maybe just message counts and types)
    user_msg_count = sum(1 for m in messages if m.sender_id == cu.id)
    partner_msg_count = len(messages) - user_msg_count
    total_images = sum(1 for m in messages if m.message_type == 'image')
    total_videos = sum(1 for m in messages if m.message_type == 'video')

    # 2. Fetch Dates
    dates_res = await db.execute(select(Anniversary).filter(Anniversary.couple_space_id == cu.couple_space_id))
    dates = dates_res.scalars().all()
    dates_info = "Important Dates:\n" + "\n".join([f"- {d.title} ({d.type}): {d.date}" for d in dates]) if dates else "No important dates saved."

    prompt = f"""Generate a Deep Relationship Analytics report.
    
    DATA (Last 30 Days):
    - User messages sent: {user_msg_count}
    - Partner messages sent: {partner_msg_count}
    - Photos shared: {total_images}
    - Videos shared: {total_videos}
    - {dates_info}
    
    As Aura, the relationship counselor, analyze this engagement data and any upcoming dates.
    Output in JSON format ONLY with these keys:
    - engagement_score: a number out of 100
    - analysis: a paragraph analyzing their digital communication balance
    - proactive_suggestion: a highly actionable, creative suggestion for a date or surprise based on this data.
    """

    system = "You are Aura, a world-class relationship AI. Provide a structured JSON analysis based ONLY on the provided metadata. Your tone should be extremely friendly, warm, and insightful. Output ONLY raw JSON."

    report_data = None
    if settings.GOOGLE_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=settings.GOOGLE_API_KEY)
            model = genai.GenerativeModel("gemini-2.5-flash", system_instruction=system)
            resp = await model.generate_content_async(prompt)
            cleaned = resp.text.strip()
            if cleaned.startswith("```json"): cleaned = cleaned[7:]
            if cleaned.startswith("```"): cleaned = cleaned[3:]
            if cleaned.endswith("```"): cleaned = cleaned[:-3]
            report_data = json.loads(cleaned.strip())
        except Exception as e:
            print(f"Gemini fallback error: {e}")
            pass
            
    if not report_data and settings.GROQ_API_KEY:
        client = AsyncGroq(api_key=settings.GROQ_API_KEY)
        resp = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            response_format={"type": "json_object"}
        )
        report_data = json.loads(resp.choices[0].message.content)
        
    if not report_data:
        raise HTTPException(500, "Could not generate deep analytics report")

    return report_data

class AIThreadSyncRequest(BaseModel):
    id: str
    title: str
    messages: list

@router.get("/threads")
async def get_threads(cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AIChatThread).filter(AIChatThread.user_id == cu.id).order_by(desc(AIChatThread.updated_at))
    )
    threads = result.scalars().all()
    
    decrypted_threads = []
    for t in threads:
        try:
            # Decrypt the payload
            decrypted_json = decrypt_data(t.encrypted_messages)
            msgs = json.loads(decrypted_json) if decrypted_json else []
            decrypted_threads.append({
                "id": t.id,
                "title": t.title,
                "messages": msgs,
                "updated_at": int(t.updated_at.timestamp() * 1000)
            })
        except Exception as e:
            print(f"Error decrypting thread {t.id}: {e}")
            pass
            
    return decrypted_threads

@router.post("/threads/sync")
async def sync_thread(req: AIThreadSyncRequest, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Encrypt the messages array
    json_msgs = json.dumps(req.messages)
    encrypted_msgs = encrypt_data(json_msgs)
    
    # Upsert logic
    result = await db.execute(select(AIChatThread).filter(AIChatThread.id == req.id))
    existing = result.scalars().first()
    
    if existing:
        if existing.user_id != cu.id:
            raise HTTPException(403, "Unauthorized")
        existing.title = req.title
        existing.encrypted_messages = encrypted_msgs
        existing.updated_at = datetime.utcnow()
    else:
        new_thread = AIChatThread(
            id=req.id,
            user_id=cu.id,
            title=req.title,
            encrypted_messages=encrypted_msgs,
            updated_at=datetime.utcnow()
        )
        db.add(new_thread)
        
    await db.commit()
    return {"status": "synced"}

@router.delete("/threads/{thread_id}")
async def delete_thread(thread_id: str, cu: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AIChatThread).filter(AIChatThread.id == thread_id, AIChatThread.user_id == cu.id))
    thread = result.scalars().first()
    if not thread:
        raise HTTPException(404, "Thread not found")
        
    await db.delete(thread)
    await db.commit()
    return {"status": "deleted"}