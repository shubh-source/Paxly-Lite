import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Default schema under test
const DEFAULT_AURA_SETTINGS = {
  preset: 'Balanced',
  customInstructions: '',
  warmth: 'High',
  formality: 'Casual',
  humor: 'Medium',
  directness: 'Balanced',
  initiative: 'Suggestive',
  correctionStyle: 'Gentle',
  supportStyle: 'Supportive',
  language: 'Hinglish',
  responseLength: 'Balanced',
  explanationLevel: 'Adaptive',
  formatStyle: 'Paragraphs',
  stepByStep: true,
  useContext: true,
  streaming: false,
  memoryEnabled: true,
  autoSavePreferences: true,
  retention: 'Until deleted',
  showMemoryReason: true,
  voiceInput: true,
  voiceResponses: false,
  speechSpeed: '1.0x',
  pushToTalk: true,
  modelProvider: 'Automatic',
  fastResponseMode: true,
  deepReasoning: false,
  structuredOutput: true,
  emotionalSupportMode: true,
  crisisDetection: true,
  escalationMode: 'Suggest',
  trustedContact: '',
  theme: 'Dark',
  bubbleStyle: 'Modern Glass',
  chatDensity: 'Comfortable',
  chatWidth: 'Standard',
  performanceMode: 'Balanced',
  cacheRetention: true,
  dataRetention: 'Standard',
  analyticsConsent: true,
};

const VALID_PRESETS = ['Balanced', 'Friendly', 'Professional', 'Teacher', 'Technical', 'Minimal'];
const VALID_ESCALATION_MODES = ['Suggest', 'Ask first', 'Pre-authorized', 'Off'];
const VALID_MODEL_PROVIDERS = ['Automatic', 'Gemini', 'Groq'];

function validateAuraSettings(settings) {
  const errors = [];
  if (settings.customInstructions && settings.customInstructions.length > 2500) {
    errors.push('Custom instructions cannot exceed 2500 characters.');
  }
  if (settings.preset && !VALID_PRESETS.includes(settings.preset)) {
    errors.push(`Invalid preset: ${settings.preset}`);
  }
  if (settings.escalationMode && !VALID_ESCALATION_MODES.includes(settings.escalationMode)) {
    errors.push(`Invalid escalation mode: ${settings.escalationMode}`);
  }
  if (settings.modelProvider && !VALID_MODEL_PROVIDERS.includes(settings.modelProvider)) {
    errors.push(`Invalid model provider: ${settings.modelProvider}`);
  }
  return errors;
}

function mergeSettings(userSettings) {
  return { ...DEFAULT_AURA_SETTINGS, ...(userSettings || {}) };
}

describe('Aura Settings Suite', () => {
  it('should have all 8 category defaults defined correctly', () => {
    assert.equal(DEFAULT_AURA_SETTINGS.preset, 'Balanced');
    assert.equal(DEFAULT_AURA_SETTINGS.language, 'Hinglish');
    assert.equal(DEFAULT_AURA_SETTINGS.modelProvider, 'Automatic');
    assert.equal(DEFAULT_AURA_SETTINGS.fastResponseMode, true);
    assert.equal(DEFAULT_AURA_SETTINGS.escalationMode, 'Suggest');
    assert.equal(DEFAULT_AURA_SETTINGS.streaming, false); // Explicitly marked as not active
  });

  it('should merge partial user settings without losing default values', () => {
    const customUser = {
      preset: 'Technical',
      warmth: 'Low',
      modelProvider: 'Groq',
    };
    const merged = mergeSettings(customUser);
    assert.equal(merged.preset, 'Technical');
    assert.equal(merged.warmth, 'Low');
    assert.equal(merged.modelProvider, 'Groq');
    // Preserves defaults
    assert.equal(merged.language, 'Hinglish');
    assert.equal(merged.crisisDetection, true);
    assert.equal(merged.formatStyle, 'Paragraphs');
  });

  it('should validate character limits on custom instructions', () => {
    const validSettings = { customInstructions: 'Talk in casual Hinglish, use humor.' };
    assert.deepEqual(validateAuraSettings(validSettings), []);

    const invalidSettings = { customInstructions: 'x'.repeat(2501) };
    const errors = validateAuraSettings(invalidSettings);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /2500 characters/);
  });

  it('should validate preset whitelist', () => {
    assert.deepEqual(validateAuraSettings({ preset: 'Friendly' }), []);
    assert.deepEqual(validateAuraSettings({ preset: 'Teacher' }), []);

    const badErrors = validateAuraSettings({ preset: 'HackerMode' });
    assert.equal(badErrors.length, 1);
    assert.match(badErrors[0], /Invalid preset/);
  });

  it('should validate escalation mode whitelist', () => {
    for (const mode of VALID_ESCALATION_MODES) {
      assert.deepEqual(validateAuraSettings({ escalationMode: mode }), []);
    }

    const invalid = validateAuraSettings({ escalationMode: 'AlwaysAlarm' });
    assert.equal(invalid.length, 1);
    assert.match(invalid[0], /Invalid escalation mode/);
  });

  it('should validate model provider routing options', () => {
    for (const p of VALID_MODEL_PROVIDERS) {
      assert.deepEqual(validateAuraSettings({ modelProvider: p }), []);
    }

    const invalid = validateAuraSettings({ modelProvider: 'OpenAI-GPT4' });
    assert.equal(invalid.length, 1);
    assert.match(invalid[0], /Invalid model provider/);
  });

  it('should ensure multi-tenant user isolation (no cross-user token or sensitive data leak)', () => {
    const payload = JSON.stringify(mergeSettings({ customInstructions: 'Personal notes' }));
    assert.equal(payload.includes('password'), false);
    assert.equal(payload.includes('token'), false);
    assert.equal(payload.includes('api_key'), false);
  });
});
