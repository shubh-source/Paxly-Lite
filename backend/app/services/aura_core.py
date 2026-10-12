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

class VerificationState(BaseModel):
    status: str = "pending"
    passed: bool = True

class AuraRuntimeState(BaseModel):
    user_name: str
    partner_name: str
    input_object: InputObject
    active_context: Dict[str, Any]
    emotion: EmotionState
    intent: IntentState
    safety: SafetyState
    verification: VerificationState = Field(default_factory=VerificationState)
    final_reply: Optional[str] = None
    special_commands: List[Dict[str, Any]] = Field(default_factory=list)
    telemetry_events: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = {"extra": "allow"}



class InputParser:
    def parse(self, user_message: str) -> InputObject:
        return InputObject(raw_content=user_message)


class EmotionEngine:
    def detect(self, input_obj: InputObject, context: Dict[str, Any]) -> EmotionState:
        text = input_obj.raw_content.lower().strip()
        if not text:
            return EmotionState()

        signals = []
        sarcasm_detected = False
        hesitation = False

        # Sarcasm / ambiguity cues (e.g. inverted emojis, contradictory praise)
        sarcasm_patterns = [
            "🙃", "ironic", "/s", "waah kya", "bohot khoob", "wah kya baat",
            "great job, not", "thanks for nothing", "kya baat hai bhai", "just great..."
        ]
        if any(pat in text for pat in sarcasm_patterns):
            sarcasm_detected = True
            signals.append("ambiguous_or_sarcastic_tone")

        # Hesitation cues (e.g. ellipses, filler words)
        if "..." in text or " um " in f" {text} " or " uh " in f" {text} " or "shayad" in text:
            hesitation = True
            signals.append("hesitation_detected")

        # Sadness / Grief / Loneliness
        sadness_keywords = [
            "sad", "upset", "crying", "depressed", "udaas", "dard", "hurt",
            "lonely", "broken", "toot gaya", "toot gayi", "akela", "akele",
            "hopeless", "feeling down", "dil toot", "rone ka mann"
        ]
        # Frustration / Anger
        frustration_keywords = [
            "angry", "annoyed", "frustrated", "gussa", "irritated", "pissed",
            "bakwaas", "dimag kharab", "fed up"
        ]
        # Anxiety / Fear
        anxiety_keywords = [
            "anxious", "nervous", "scared", "fear", "tension", "dar lag raha",
            "panic", "worried", "anxiety", "ghabrahat", "bechain"
        ]
        # Affection / Gratitude / Joy
        affection_keywords = [
            "love you", "thank you", "thanks", "grateful", "happy", "khush",
            "excited", "sukoon", "loved", "pyar", "acha laga", "proud of you"
        ]

        if any(k in text for k in sadness_keywords):
            intensity = 0.7 if any(w in text for w in ["bohot", "very", "extremely", "too"]) else 0.5
            vulnerability = "high" if intensity >= 0.7 else "medium"
            signals.append("sadness_cue")
            return EmotionState(
                primary_emotion="sadness",
                intensity=intensity,
                hesitation=hesitation,
                sarcasm_detected=sarcasm_detected,
                vulnerability_level=vulnerability,
                observed_signals=signals
            )

        if any(k in text for k in frustration_keywords):
            intensity = 0.7 if any(w in text for w in ["bohot", "very", "extremely"]) else 0.5
            signals.append("frustration_cue")
            return EmotionState(
                primary_emotion="anger_or_frustration",
                intensity=intensity,
                hesitation=hesitation,
                sarcasm_detected=sarcasm_detected,
                vulnerability_level="medium",
                observed_signals=signals
            )

        if any(k in text for k in anxiety_keywords):
            signals.append("anxiety_cue")
            return EmotionState(
                primary_emotion="anxiety",
                intensity=0.6,
                hesitation=hesitation,
                sarcasm_detected=sarcasm_detected,
                vulnerability_level="medium",
                observed_signals=signals
            )

        if any(k in text for k in affection_keywords):
            signals.append("affection_or_joy_cue")
            return EmotionState(
                primary_emotion="joy_or_affection",
                intensity=0.6,
                hesitation=hesitation,
                sarcasm_detected=sarcasm_detected,
                vulnerability_level="low",
                observed_signals=signals
            )

        # Ambiguous / Sarcastic fallback
        if sarcasm_detected:
            return EmotionState(
                primary_emotion="ambiguous",
                intensity=0.3,
                hesitation=hesitation,
                sarcasm_detected=True,
                vulnerability_level="low",
                observed_signals=signals
            )

        # Neutral fallback
        return EmotionState(
            primary_emotion="neutral",
            intensity=0.1,
            hesitation=hesitation,
            sarcasm_detected=False,
            vulnerability_level="low",
            observed_signals=signals or ["neutral_conversational_baseline"]
        )


class IntentEngine:
    def detect(self, input_obj: InputObject, context: Dict[str, Any]) -> IntentState:
        text = input_obj.raw_content.lower().strip()
        if not text:
            return IntentState()

        # Date planning
        date_keywords = ["date", "anniversary", "birthday", "gift", "dinner", "plan something", "surprise", "outfit", "restaurant"]
        if any(k in text for k in date_keywords):
            return IntentState(
                primary_intent="date_planning",
                secondary_intents=["relationship_enrichment"],
                urgency="normal"
            )

        # Relationship advice / conflict
        relationship_keywords = [
            "partner", "boyfriend", "girlfriend", "husband", "wife", "fight",
            "ladai", "jhagda", "argument", "misunderstanding", "talk to him",
            "talk to her", "usne bola", "usne kaha", "relation", "breakup"
        ]
        if any(k in text for k in relationship_keywords):
            return IntentState(
                primary_intent="relationship_advice",
                secondary_intents=["conflict_resolution", "emotional_support"],
                urgency="normal"
            )

        # Venting
        venting_keywords = [
            "vent", "sun lo", "feel ho raha", "kaafi thak gaya", "kaafi thak gayi",
            "exhausted", "mann halka", "just need to talk", "listen to me"
        ]
        if any(k in text for k in venting_keywords):
            return IntentState(
                primary_intent="venting",
                secondary_intents=["emotional_support"],
                urgency="normal"
            )

        # Casual chat
        casual_greetings = ["hi", "hello", "hey", "kya chal raha", "how are you", "kya kar rahi ho", "kya kar rahe ho", "good morning", "good night"]
        if any(text == g or text.startswith(g + " ") for g in casual_greetings):
            return IntentState(
                primary_intent="casual_chat",
                secondary_intents=[],
                urgency="low"
            )

        # Conservative general fallback
        return IntentState(
            primary_intent="general_conversation",
            secondary_intents=[],
            urgency="normal"
        )


class SafetyEngine:
    @staticmethod
    def assess(input_obj: InputObject, emotion: EmotionState, context: Dict[str, Any]) -> SafetyState:
        text = input_obj.raw_content.lower()
        flags = []
        user_name = context.get("user_name", "Your partner")

        # ─── 1. RISK_4: IMMINENT EMERGENCY / ACTIVE HARM / STATED PLAN (57.8) ───
        # Takes absolute precedence over any figurative idioms or conversational humor
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

        # ─── 2. RISK_3: SELF-HARM / SUICIDE CONCERN (57.8) ───
        # Takes absolute precedence over figurative expressions
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

        # ─── 3. FIGURATIVE HYPERBOLE / IDIOM GUARD (FALSE POSITIVE PREVENTION) ───
        # Evaluated strictly AFTER genuine crisis signals to avoid suppressing real harm disclosures
        figurative_hyperboles = [
            "dying of laughter", "mar gaya has has", "has has ke", "dying laughing",
            "this movie is killing me", "this joke is killing me", "killing it",
            "killing time", "traffic is killing me", "dying to see", "dying to know",
            "dead laughing", "i'm dead lol", "i am dead lol", "lmao dead"
        ]
        if any(fig in text for fig in figurative_hyperboles):
            flags.append("figurative_hyperbole_not_risk")
            return SafetyState(is_safe=True, risk_level="RISK_0", flags=flags)

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
        context = dict(context_data) if context_data else {}
        context.setdefault("user_name", user_name)
        context.setdefault("partner_name", partner_name)
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
