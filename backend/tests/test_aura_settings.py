import pytest
from app.models.schemas import AuraSettingsSchema, AIRequest, AIMessage
from app.api.routes.ai import DEFAULT_AURA_SETTINGS

def test_default_aura_settings_structure():
    assert "preset" in DEFAULT_AURA_SETTINGS
    assert "language" in DEFAULT_AURA_SETTINGS
    assert "modelProvider" in DEFAULT_AURA_SETTINGS
    assert "escalationMode" in DEFAULT_AURA_SETTINGS
    assert DEFAULT_AURA_SETTINGS["preset"] == "Balanced"
    assert DEFAULT_AURA_SETTINGS["language"] == "Hinglish"
    assert DEFAULT_AURA_SETTINGS["modelProvider"] == "Automatic"

def test_aura_settings_schema_defaults():
    schema = AuraSettingsSchema()
    assert schema.preset == "Balanced"
    assert schema.language == "Hinglish"
    assert schema.warmth == "High"
    assert schema.streaming is False  # Explicitly disabled until v2.0 SSE

def test_aura_settings_schema_custom_values():
    schema = AuraSettingsSchema(
        preset="Technical",
        customInstructions="Explain step by step with code.",
        modelProvider="Groq",
        fastResponseMode=True,
        escalationMode="Off"
    )
    assert schema.preset == "Technical"
    assert schema.customInstructions == "Explain step by step with code."
    assert schema.modelProvider == "Groq"
    assert schema.escalationMode == "Off"

def test_ai_request_with_model_provider_routing():
    req = AIRequest(
        messages=[AIMessage(role="user", content="Hello Aura")],
        model_provider="Groq",
        fast_mode=True
    )
    assert req.model_provider == "Groq"
    assert req.fast_mode is True
    assert len(req.messages) == 1
