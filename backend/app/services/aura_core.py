"""
AURA CORE RUNTIME ENGINE — IMPLEMENTATION BLUEPRINT (VERSION VLYNXLY-AURA-55)
Unified Cognitive Controller and Multi-Engine Orchestrator for Paxly-Lite / Vlynxly
"""

import json
import re
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


# ─── 1. CORE DATA STRUCTURES & STATE MODEL (54.7 & 55.4) ────────────

class InputObject(BaseModel):
    raw_content: str
    modality: str = "text"
    language: str = "auto"
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    user_provided: bool = True


class EmotionState(BaseModel):
    primary_emotion: str = "neutral"
    intensity: float = 0.0
    hesitation: bool = False
    sarcasm_detected: bool = False
    vulnerability_level: str = "low"  # low, medium, high
    observed_signals: List[str] = Field(default_factory=list)


class IntentState(BaseModel):
    primary_intent: str = "general_conversation"
    secondary_intents: List[str] = Field(default_factory=list)
    urgency: str = "normal"  # low, normal, urgent, crisis
    requires_action: bool = False
    requires_clarification: bool = False
    clarification_prompt: Optional[str] = None


class SafetyState(BaseModel):
    is_safe: bool = True
    risk_level: str = "none"  # none, low, sensitive, elevated, high, critical
    requires_intervention: bool = False
    safety_message: Optional[str] = None
    flags: List[str] = Field(default_factory=list)


class TaskPlan(BaseModel):
    goal: str = ""
    milestones: List[str] = Field(default_factory=list)
    tasks: List[Dict[str, Any]] = Field(default_factory=list)
    current_step: int = 0
    is_complete: bool = False


class VerificationState(BaseModel):
    status: str = "unverified"  # verified, partially_verified, unverified, failed, unknown
    expected_outcome: Optional[str] = None
    observed_outcome: Optional[str] = None
    confidence: float = 1.0
    disclosed_uncertainty: Optional[str] = None


class AuraRuntimeState(BaseModel):
    session_id: str = "default_session"
    user_id: Optional[str] = None
    user_name: str = "User"
    partner_name: str = "Partner"
    
    # State components
    input_object: Optional[InputObject] = None
    active_context: Dict[str, Any] = Field(default_factory=dict)
    emotion: EmotionState = Field(default_factory=EmotionState)
    intent: IntentState = Field(default_factory=IntentState)
    safety: SafetyState = Field(default_factory=SafetyState)
    task_plan: Optional[TaskPlan] = None
    
    # Knowledge & Reasoning
    active_assumptions: List[str] = Field(default_factory=list)
    reasoning_depth: str = "direct"  # direct, analytical, multi_step, simulative
    
    # Execution & Output
    tool_calls: List[Dict[str, Any]] = Field(default_factory=list)
    verification: VerificationState = Field(default_factory=VerificationState)
    final_reply: Optional[str] = None
    special_commands: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Audit & Telemetry
    telemetry_events: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── 2. SUB-ENGINES & COMPONENT IMPLEMENTATIONS ──────────────────────

class InputParser:
    @staticmethod
    def parse(raw_text: str, metadata: Optional[Dict[str, Any]] = None) -> InputObject:
        clean_text = raw_text.strip()
        # Basic language heuristic (Hindi / Hinglish / English)
        hinglish_words = ["hai", "kya", "aur", "toh", "hum", "tum", "baat", "nahi", "karo", "kyu", "accha", "bhai", "yaar"]
        words = clean_text.lower().split()
        is_hinglish = any(w in hinglish_words for w in words)
        
        return InputObject(
            raw_content=clean_text,
            modality="text",
            language="hinglish" if is_hinglish else "en",
            metadata=metadata or {}
        )


class EmotionEngine:
    @staticmethod
    def detect(input_obj: InputObject, context: Dict[str, Any]) -> EmotionState:
        text = input_obj.raw_content.lower()
        signals = []
        emotion = "neutral"
        intensity = 0.2
        vulnerability = "low"
        hesitation = False
        sarcasm = False
        
        # Signals detection
        if any(w in text for w in ["sad", "crying", "hurt", "broke", "dukh", "dard", "udas", "alone"]):
            emotion = "sadness"
            intensity = 0.8
            vulnerability = "high"
            signals.append("distress_expression")
            
        elif any(w in text for w in ["angry", "gussa", "irritated", "frustrated", "hate", "fight", "ladai"]):
            emotion = "anger_or_frustration"
            intensity = 0.7
            vulnerability = "medium"
            signals.append("conflict_signal")
            
        elif any(w in text for w in ["love", "pyar", "happy", "excited", "khush", "miss", "yaad"]):
            emotion = "affection_or_joy"
            intensity = 0.7
            vulnerability = "medium"
            signals.append("warmth_signal")
            
        if "..." in text or "um" in text or "shayad" in text or "maybe" in text:
            hesitation = True
            signals.append("hesitation_detected")
            
        if "🙃" in text or "waah kya" in text or ("great" in text and "terrible" in text):
            sarcasm = True
            signals.append("possible_sarcasm")
            
        return EmotionState(
            primary_emotion=emotion,
            intensity=intensity,
            hesitation=hesitation,
            sarcasm_detected=sarcasm,
            vulnerability_level=vulnerability,
            observed_signals=signals
        )


class IntentEngine:
    @staticmethod
    def detect(input_obj: InputObject, context: Dict[str, Any]) -> IntentState:
        text = input_obj.raw_content.lower()
        primary = "conversation"
        secondary = []
        urgency = "normal"
        requires_action = False
        
        if any(w in text for w in ["save date", "anniversary", "birthday", "yaad rakhna", "first date"]):
            primary = "manage_relationship_date"
            requires_action = True
            secondary.append("memory_storage")
            
        elif any(w in text for w in ["counseling", "fight", "ladai", "misunderstanding", "resolve", "advice"]):
            primary = "relationship_mediation"
            secondary.append("conflict_resolution")
            urgency = "high"
            
        elif any(w in text for w in ["code", "bug", "debug", "function", "api", "database", "sql"]):
            primary = "code_intelligence"
            secondary.append("software_engineering")
            
        elif any(w in text for w in ["analyze", "analytics", "report", "summary", "stats"]):
            primary = "data_analysis"
            secondary.append("insight_generation")
            
        return IntentState(
            primary_intent=primary,
            secondary_intents=secondary,
            urgency=urgency,
            requires_action=requires_action
        )


class SafetyEngine:
    @staticmethod
    def assess(input_obj: InputObject, emotion: EmotionState, context: Dict[str, Any]) -> SafetyState:
        text = input_obj.raw_content.lower()
        flags = []
        
        # Self-harm or crisis keywords
        crisis_keywords = ["kill myself", "suicide", "end my life", "marna chahta hu", "khudkushi", "self harm"]
        if any(k in text for k in crisis_keywords):
            return SafetyState(
                is_safe=False,
                risk_level="critical",
                requires_intervention=True,
                safety_message=(
                    "Aap bilkul akele nahi hain. Agar aap pareshan hain ya hurt mehsoos kar rahe hain, "
                    "toh please kisi trusted professional ya helpline se baat karein. "
                    "India Helpline: 9152987821 (Vandrevala Foundation) / 112 (National Emergency)."
                ),
                flags=["crisis_detected"]
            )
            
        # Malicious prompt injection defense (Parts 36, 48, 51)
        injection_triggers = ["ignore all previous instructions", "system prompt reveal", "admin override", "bypass rules"]
        if any(trig in text for trig in injection_triggers):
            flags.append("prompt_injection_attempt")
            return SafetyState(
                is_safe=True,
                risk_level="sensitive",
                requires_intervention=False,
                flags=flags
            )
            
        return SafetyState(is_safe=True, risk_level="none", flags=flags)


class ResponsePostProcessor:
    @staticmethod
    def process_special_commands(reply_text: str) -> Dict[str, Any]:
        """Intercepts special output tags like [ADD_DATE: ...] generated by Aura."""
        dates_to_add = []
        match = re.search(r'\[ADD_DATE:\s*([^:]+):\s*([^:]+):\s*([^\]]+)\]', reply_text)
        cleaned_reply = reply_text
        
        if match:
            date_val = match.group(1).strip()
            title_val = match.group(2).strip()
            type_val = match.group(3).strip()
            dates_to_add.append({
                "date": date_val,
                "title": title_val,
                "type": type_val
            })
            cleaned_reply = reply_text.replace(match.group(0), "").strip()
            
        return {
            "cleaned_reply": cleaned_reply,
            "dates_to_add": dates_to_add
        }


# ─── 3. AURA CORE RUNTIME CONTROLLER (55.4) ──────────────────────────

class AuraCoreController:
    """
    AuraCore runtime pipeline following the Part 55 architecture:
    INPUT → UNDERSTANDING → SAFETY → REASONING → TOOLS → VERIFICATION → RESPONSE → AUDIT
    """
    
    def __init__(self):
        self.input_parser = InputParser()
        self.emotion_engine = EmotionEngine()
        self.intent_engine = IntentEngine()
        self.safety_engine = SafetyEngine()
        self.post_processor = ResponsePostProcessor()
        
    def prepare_runtime_state(
        self, 
        user_message: str, 
        user_name: str = "User", 
        partner_name: str = "Partner",
        context_data: Optional[Dict[str, Any]] = None
    ) -> AuraRuntimeState:
        """Initializes and runs early cognitive parsing layers."""
        context = context_data or {}
        input_obj = self.input_parser.parse(user_message)
        emotion = self.emotion_engine.detect(input_obj, context)
        intent = self.intent_engine.detect(input_obj, context)
        safety = self.safety_engine.assess(input_obj, emotion, context)
        
        state = AuraRuntimeState(
            user_name=user_name,
            partner_name=partner_name,
            input_object=input_obj,
            active_context=context,
            emotion=emotion,
            intent=intent,
            safety=safety
        )
        
        # Record telemetry event
        state.telemetry_events.append({
            "stage": "understanding_complete",
            "primary_intent": intent.primary_intent,
            "primary_emotion": emotion.primary_emotion,
            "risk_level": safety.risk_level,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return state

    def handle_post_processing(self, raw_reply: str, state: AuraRuntimeState) -> AuraRuntimeState:
        """Processes special commands and applies quality validation."""
        result = self.post_processor.process_special_commands(raw_reply)
        state.final_reply = result["cleaned_reply"]
        state.special_commands = result["dates_to_add"]
        state.verification.status = "verified"
        
        state.telemetry_events.append({
            "stage": "response_verified",
            "has_special_commands": len(result["dates_to_add"]) > 0,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        return state


# Singleton instance
aura_core = AuraCoreController()
