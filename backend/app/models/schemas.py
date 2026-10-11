from pydantic import BaseModel
from typing import List, Optional

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
    bg_gradient: str
    primary_color: str
    accent_color: str
    font_style: str
    hero_title: str
    hero_subtitle: str
    counter_date: Optional[str] = None
    timeline: List[dict]
    messages: List[dict]
    coupons: List[dict]
    music_vibe: Optional[str] = None
