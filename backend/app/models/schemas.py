from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from datetime import datetime

# ── User ──────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Optional[str] = "user"
    business_category: Optional[str] = None # theatre | restaurant | cafe

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None

class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    couple_space_id: Optional[str] = None
    partner_id: Optional[str] = None
    is_premium: bool = False
    business_category: Optional[str] = None
    created_at: datetime
    has_pin: bool = False

# ── Auth ──────────────────────────────────────────────────────
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ── Invite ────────────────────────────────────────────────────
class InviteCreate(BaseModel):
    pass

class InviteAccept(BaseModel):
    code: str

# ── Message ───────────────────────────────────────────────────
class MessageCreate(BaseModel):
    text: Optional[str] = ""
    message_type: str = "text"  # text | image | voice

class MessageOut(BaseModel):
    id: str
    sender_id: str
    sender_name: str
    message_type: str
    text: Optional[str] = ""
    media_url: Optional[str] = None
    reactions: Dict[str, str] = {}
    is_once_view: bool = False
    view_limit: int = 1
    views_used: int = 0
    is_compromised: bool = False
    timestamp: datetime

class ReactionAdd(BaseModel):
    emoji: str

# ── Mood ──────────────────────────────────────────────────────
class MoodCreate(BaseModel):
    mood_type: str  # happy | calm | neutral | low | support
    note: Optional[str] = ""

class MoodOut(BaseModel):
    id: str
    user_id: str
    user_name: str
    mood_type: str
    note: Optional[str] = ""
    date: str
    timestamp: datetime

# ── Memory ────────────────────────────────────────────────────
class MemoryCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    date: str  # YYYY-MM-DD

class MemoryOut(BaseModel):
    id: str
    title: str
    description: Optional[str] = ""
    image_url: Optional[str] = None
    date: str
    created_by: str
    created_by_name: str
    allow_download: bool = True
    created_at: datetime

# ── Place ─────────────────────────────────────────────────────
class PlaceOut(BaseModel):
    id: str
    name: str
    category: str
    address: Optional[str] = ""
    rating: Optional[float] = None
    description: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    image_url: Optional[str] = None

# ── AI ────────────────────────────────────────────────────────
class AIAttachment(BaseModel):
    mime_type: str
    data: str  # Base64 string

class AIMessage(BaseModel):
    role: str  # user | assistant
    content: str
    attachments: Optional[List[AIAttachment]] = None

class AIRequest(BaseModel):
    messages: List[AIMessage]

class AIResponse(BaseModel):
    reply: str

# ── AI Counseling Lab ──────────────────────────────────────────
class AISessionStart(BaseModel):
    days: int

class AIInterviewRequest(BaseModel):
    session_id: str
    message: str

class AIAnalysisReport(BaseModel):
    pros: List[str]
    cons: List[str]
    core_issue: str
    resolution: str
    summary: str

# ── Love Website Builder ─────────────────────────────────────
class WebsiteGenerateRequest(BaseModel):
    prompt: str
    music_url: Optional[str] = None

class WebsiteBlueprint(BaseModel):
    theme_name: str
    colors: dict # primary, secondary, bg, text, accent
    font_pair: dict # heading, body
    animations: str # subtle, energetic, romantic, cinematic
    blocks: List[dict] # { type: 'hero'|'timeline'|'letter', content: {} }

# ── WebRTC / Calls ────────────────────────────────────────────
class CallOffer(BaseModel):
    sdp: str
    type: str
    call_type: str = "video"  # video | voice

class CallAnswer(BaseModel):
    sdp: str
    type: str

class IceCandidate(BaseModel):
    candidate: str
    sdpMLineIndex: Optional[int] = None
    sdpMid: Optional[str] = None

# ── Theatre Partner ───────────────────────────────────────────
class TheatreCreate(BaseModel):
    name: str
    city: str
    address: str
    latitude: float
    longitude: float
    description: str
    capacity: int
    price_per_hour: float
    amenities: List[str] = []
    slots: List[str] = []
    contact_phone: str
    contact_email: str
    contact_whatsapp: str

class TheatreUpdate(BaseModel):
    name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    description: Optional[str] = None
    price_per_hour: Optional[float] = None
    active: Optional[bool] = None

class BookingStatusUpdate(BaseModel):
    status: str # confirmed | declined
