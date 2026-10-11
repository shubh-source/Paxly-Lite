from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from datetime import datetime

# ── User ──────────────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    public_key: Optional[str] = None
    role: Optional[str] = "user"
    business_category: Optional[str] = None # theatre | restaurant | cafe

class UserLogin(BaseModel):
    email: EmailStr
    password: str
    public_key: Optional[str] = None

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
    public_key: Optional[str] = None

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
    reply_to_id: Optional[str] = None

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
    reply_to_id: Optional[str] = None
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
    model_provider: Optional[str] = None # Automatic | Gemini | Groq
    fast_mode: Optional[bool] = None

class AIResponse(BaseModel):
    reply: str

class AuraSettingsSchema(BaseModel):
    # 01. General
    defaultLanguage: Optional[str] = "Hinglish"
    defaultResponseLength: Optional[str] = "Balanced"
    defaultAiMode: Optional[str] = "Auto"
    startupBehavior: Optional[str] = "Restore previous session"
    defaultLandingPage: Optional[str] = "Chat"
    autoSaveConversations: Optional[bool] = True
    sendWithEnter: Optional[bool] = True
    showKeyboardShortcuts: Optional[bool] = True

    # 02. Personality
    preset: Optional[str] = "Balanced"
    customInstructions: Optional[str] = ""
    warmth: Optional[str] = "High"
    formality: Optional[str] = "Casual"
    humor: Optional[str] = "Medium"
    directness: Optional[str] = "Balanced"
    teachingStyle: Optional[str] = "Concept first"
    correctionStyle: Optional[str] = "Gentle"
    supportStyle: Optional[str] = "Reassure"
    proactivity: Optional[str] = "Suggestive"
    initiative: Optional[str] = "Suggestive"

    # 03. Chat & Responses
    language: Optional[str] = "Hinglish"
    responseLength: Optional[str] = "Balanced"
    explanationLevel: Optional[str] = "Adaptive"
    formatStyle: Optional[str] = "Paragraphs"
    stepByStep: Optional[bool] = True
    useContext: Optional[bool] = True
    streaming: Optional[bool] = False
    markdownRendering: Optional[bool] = True
    codeSyntaxHighlighting: Optional[bool] = True
    autoCodeFormatting: Optional[bool] = True
    showTimestamps: Optional[bool] = False
    followUpSuggestions: Optional[bool] = True
    autoConversationTitles: Optional[bool] = True

    # 04. Memory & Context
    memoryEnabled: Optional[bool] = True
    autoSavePreferences: Optional[bool] = True
    saveProjectProgress: Optional[bool] = True
    retrievePastContext: Optional[bool] = True
    retention: Optional[str] = "Until deleted"
    showMemoryReason: Optional[bool] = True
    confirmSensitiveMemories: Optional[bool] = True

    # 05. Voice & Real-Time
    voiceInput: Optional[bool] = True
    voiceResponses: Optional[bool] = False
    speechSpeed: Optional[str] = "1.0x"
    pushToTalk: Optional[bool] = True
    wakeWordEnabled: Optional[bool] = False
    interruptSpeech: Optional[bool] = True
    noiseSuppression: Optional[bool] = True

    # 06. Models & Intelligence
    modelProvider: Optional[str] = "Automatic"
    fastResponseMode: Optional[bool] = True
    deepReasoning: Optional[bool] = False
    structuredOutput: Optional[bool] = True
    autoModelRouting: Optional[bool] = True
    localModelEndpoint: Optional[str] = "http://localhost:11434"
    maxOutputTokens: Optional[int] = 1000
    temperature: Optional[float] = 0.7

    # 07. Tools & Automation
    webSearchEnabled: Optional[bool] = True
    fileAccessEnabled: Optional[bool] = True
    codeExecutionEnabled: Optional[bool] = False
    confirmExternalActions: Optional[bool] = True
    confirmFileModifications: Optional[bool] = True

    # 08. Safety & Trusted Contacts
    emotionalSupportMode: Optional[bool] = True
    crisisDetection: Optional[bool] = True
    escalationMode: Optional[str] = "Suggest"
    trustedContact: Optional[str] = ""
    trustedContactName: Optional[str] = ""
    trustedContactPhone: Optional[str] = ""
    locationSharingCrisis: Optional[bool] = False

    # 09. Notifications
    inAppNotifications: Optional[bool] = True
    pushNotifications: Optional[bool] = True
    securityAlerts: Optional[bool] = True
    trustedContactAlerts: Optional[bool] = True
    quietHoursEnabled: Optional[bool] = False

    # 10. Privacy & Security
    dataRetention: Optional[str] = "Standard"
    analyticsConsent: Optional[bool] = True
    secretMasking: Optional[bool] = True
    anonymousDiagnostics: Optional[bool] = True

    # 11. Appearance & Accessibility
    theme: Optional[str] = "Dark"
    accentColor: Optional[str] = "Gold"
    fontSize: Optional[str] = "Medium"
    chatDensity: Optional[str] = "Comfortable"
    bubbleStyle: Optional[str] = "Modern Glass"
    chatWidth: Optional[str] = "Standard"
    reducedMotion: Optional[bool] = False
    highContrastMode: Optional[bool] = False

    # 12. Performance & Limits
    performanceMode: Optional[str] = "Balanced"
    cacheRetention: Optional[bool] = True
    requestTimeoutSec: Optional[int] = 30
    maxAttachmentSizeMb: Optional[int] = 5

    # 13. Activity & Diagnostics
    logLatency: Optional[bool] = True
    reportErrorsSilently: Optional[bool] = True

    # 14. Advanced & Developer
    debugMode: Optional[bool] = False
    verboseLogging: Optional[bool] = False
    customApiEndpoint: Optional[str] = ""

# ── AI Counseling Lab ──────────────────────────────────────────
class AISessionStart(BaseModel):
    days: int
    chat_history: str = None

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
    bg_gradient: Optional[str] = None
    colors: Optional[dict] = None
    font_pair: Optional[dict] = None
    animations: Optional[str] = None
    blocks: Optional[List[dict]] = None
    primary_color: Optional[str] = None
    accent_color: Optional[str] = None
    font_style: Optional[str] = None
    hero_title: Optional[str] = None
    hero_subtitle: Optional[str] = None
    counter_date: Optional[str] = None
    timeline: Optional[List[dict]] = None
    messages: Optional[List[dict]] = None
    coupons: Optional[List[dict]] = None
    music_vibe: Optional[str] = None

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
