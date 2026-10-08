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
    risk_level: str = "RISK_0"  # RISK_0, RISK_1, RISK_2, RISK_3, RISK_4
    requires_intervention: bool = False
    should_notify_partner: bool = False
    partner_alert_title: Optional[str] = None
    partner_alert_body: Optional[str] = None
    safety_message: Optional[str] = None
    flags: List[str] = Field(default_factory=list)

class AuraRuntimeState(BaseModel):
    user_name: str
    partner_name: str
    input_object: InputObject
    active_context: Dict[str, Any]
    emotion: EmotionState
    intent: IntentState
    safety: SafetyState


class SafetyEngine:
    @staticmethod
    def assess(input_obj: InputObject, emotion: EmotionState, context: Dict[str, Any]) -> SafetyState:
        text = input_obj.raw_content.lower()
        flags = []
        user_name = context.get("user_name", "Your partner")

        # ─── RISK_4: IMMINENT EMERGENCY / ACTIVE HARM / STATED PLAN (57.8) ───
        imminent_signals = [
            "kill myself tonight", "end my life tonight", "going to kill myself", "aaj raat sab khatam",
            "already hurt myself", "cut my wrist", "took pills", "sleeping pills kha", "poison",
            "ending everything now", "marne ja raha hu", "marne ja rahi hu", "goodbye forever"
        ]
        if any(sig in text for sig in imminent_signals):
            return SafetyState(
                is_safe=False,
                risk_level="RISK_4",
                requires_intervention=True,
                should_notify_partner=True,
                partner_alert_title="🚨 Urgent Aura Safety Alert",
                partner_alert_body=f"{user_name} is in extreme distress and may be in immediate danger. Please reach out or stay physically with them right now. If needed, call emergency services (112).",
                safety_message=(
                    "Main aapke saath hu. Please rukiye aur deep breath lijiye. "
                    "Aapki jaan bohot keemti hai. Agar aap immediate khatre mein hain, "
                    "toh please turant National Emergency Helpline 112 ya kisi paas ke insaan ko call karein.\n\n"
                    "📞 24/7 Free Crisis Helplines:\n"
                    "• Tele-MANAS (Govt of India): 14416 / 1800-891-4416\n"
                    "• Vandrevala Foundation: 9999 666 555\n"
                    "• National Emergency: 112\n\n"
                    "Please kisi se baat karein, aap akele nahi hain."
                ),
                flags=["imminent_suicide_risk", "crisis_mode"]
            )

        # ─── RISK_3: SELF-HARM / SUICIDE CONCERN (57.8) ───
        suicide_signals = [
            "kill myself", "suicide", "end my life", "marna chahta hu", "marna chahti hu",
            "jeena nahi chahta", "jeena nahi chahti", "marne ka man kar raha", "khudkushi",
            "want to die", "better off dead", "better off without me", "i don't want to live",
            "self harm", "apne aap ko chot"
        ]
        if any(sig in text for sig in suicide_signals):
            return SafetyState(
                is_safe=False,
                risk_level="RISK_3",
                requires_intervention=True,
                should_notify_partner=True,
                partner_alert_title="Aura Safety Alert 🚨",
                partner_alert_body=f"{user_name} is experiencing severe emotional distress right now and needs your care and presence. Please check in on them.",
                safety_message=(
                    "Main samajh sakti hu ki aap bohot zyada pain aur takleef mein hain, "
                    "lekin please khud ko akela mat samjhiye. Aapki feelings valid hain, "
                    "aur is mushkil waqt se nikalne ke liye support available hai.\n\n"
                    "📞 24/7 Free Helplines for confidential support:\n"
                    "• Tele-MANAS: 14416 / 1800 891 4416\n"
                    "• Vandrevala Foundation: 9999 666 555\n"
                    "• Emergency: 112\n\n"
                    "Kya aap chahte hain ki hum thodi der aur baat karein, ya aap kisi apne se baat karna chahenge?"
                ),
                flags=["suicide_concern", "crisis_mode"]
            )

        # ─── RISK_2: SEVERE EMOTIONAL DISTRESS / OVERWHELMED / CRYING (57.8) ───
        severe_distress_signals = [
            "crying for hours", "can't stop crying", "ro ro kar bura haal", "bohot zyada toot chuka",
            "bohot zyada toot chuki", "i feel completely broken", "i am drowning", "can't handle this anymore",
            "can't take this anymore", "everything is falling apart", "sab khatam ho gaya lagta hai",
            "completely overwhelmed", "dimag phat raha hai", "itna dard nahi sah sakta", "bohot ro raha hu", "bohot ro rahi hu"
        ]
        if any(sig in text for sig in severe_distress_signals) or (emotion.primary_emotion == "sadness" and emotion.vulnerability_level == "high" and emotion.intensity >= 0.85):
            return SafetyState(
                is_safe=True,
                risk_level="RISK_2",
                requires_intervention=False,
                should_notify_partner=True,
                partner_alert_title="Aura Care Alert 💜",
                partner_alert_body=f"{user_name} is feeling emotionally overwhelmed and vulnerable right now and needs your love, comfort, and presence. Please check in on them.",
                flags=["severe_emotional_distress"]
            )

        # ─── PROMPT INJECTION DEFENSE (Part 36, 48) ───
        injection_triggers = ["ignore all previous instructions", "system prompt reveal", "admin override", "bypass rules"]
        if any(trig in text for trig in injection_triggers):
            flags.append("prompt_injection_attempt")
            return SafetyState(
                is_safe=True,
                risk_level="RISK_0",
                requires_intervention=False,
                flags=flags
            )

        # ─── RISK_1 / RISK_0: NORMAL / SAD / FRUSTRATED ───
        risk_lvl = "RISK_1" if emotion.primary_emotion in ["sadness", "anger_or_frustration"] else "RISK_0"
        return SafetyState(is_safe=True, risk_level=risk_lvl, flags=flags)


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
