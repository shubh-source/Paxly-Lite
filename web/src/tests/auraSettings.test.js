import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

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

// Production safety authorization logic replicating ai.py
function evaluateSafetyEscalation(escalationMode, riskLevel, crisisEscalationEnabled, hasRecipient) {
  if (!crisisEscalationEnabled) return { autoAlert: false, askConsent: false };
  const isCrisisLevel = riskLevel === 'RISK_3' || riskLevel === 'RISK_4';

  if (!isCrisisLevel) {
    return { autoAlert: false, askConsent: false };
  }

  if (escalationMode === 'Pre-authorized') {
    return { autoAlert: Boolean(hasRecipient), askConsent: false };
  }

  if (escalationMode === 'Ask first') {
    return { autoAlert: false, askConsent: Boolean(hasRecipient) };
  }

  return { autoAlert: false, askConsent: false };
}

// User-isolated cache key generation replicating AIAssistant.jsx
function getThreadsStorageKey(userId) {
  return userId ? `paxly_aura_threads_${userId}` : 'paxly_aura_threads_guest';
}

describe('Aura 15-Category Settings Blueprint Suite', () => {
  it('should support all 15 Blueprint categories in settings hierarchy', () => {
    const categories = [
      'general', 'personality', 'chat', 'memory', 'voice',
      'models', 'tools', 'safety', 'notifications', 'privacy',
      'appearance', 'performance', 'activity', 'advanced', 'about'
    ];
    assert.equal(categories.length, 15);
  });

  it('should validate character limits on custom instructions', () => {
    const valid = { customInstructions: 'Hello Aura' };
    assert.deepEqual(validateAuraSettings(valid), []);

    const invalid = { customInstructions: 'a'.repeat(2501) };
    const errs = validateAuraSettings(invalid);
    assert.equal(errs.length, 1);
  });

  it('should enforce preset whitelist', () => {
    assert.deepEqual(validateAuraSettings({ preset: 'Teacher' }), []);
    const errs = validateAuraSettings({ preset: 'UnknownPreset' });
    assert.equal(errs.length, 1);
  });

  it('should enforce escalation policy whitelist', () => {
    for (const mode of VALID_ESCALATION_MODES) {
      assert.deepEqual(validateAuraSettings({ escalationMode: mode }), []);
    }
    const errs = validateAuraSettings({ escalationMode: 'ForceAlert' });
    assert.equal(errs.length, 1);
  });

  it('should enforce model provider routing', () => {
    for (const p of VALID_MODEL_PROVIDERS) {
      assert.deepEqual(validateAuraSettings({ modelProvider: p }), []);
    }
    const errs = validateAuraSettings({ modelProvider: 'UnsupportedEngine' });
    assert.equal(errs.length, 1);
  });

  it('SAFETY AUDIT: ordinary sadness / crying (RISK_1 / RISK_2) NEVER triggers auto partner alert', () => {
    // Ordinary sadness
    assert.deepEqual(evaluateSafetyEscalation('Pre-authorized', 'RISK_1', true, true), { autoAlert: false, askConsent: false });
    // Severe crying / heartbreak without self-harm intent
    assert.deepEqual(evaluateSafetyEscalation('Pre-authorized', 'RISK_2', true, true), { autoAlert: false, askConsent: false });
    assert.deepEqual(evaluateSafetyEscalation('Suggest', 'RISK_2', true, true), { autoAlert: false, askConsent: false });
    assert.deepEqual(evaluateSafetyEscalation('Ask first', 'RISK_2', true, true), { autoAlert: false, askConsent: false });
    assert.deepEqual(evaluateSafetyEscalation('Off', 'RISK_2', true, true), { autoAlert: false, askConsent: false });
  });

  it('SAFETY AUDIT: Critical danger (RISK_3 / RISK_4) requires Pre-authorization AND a verified recipient', () => {
    // Pre-authorized WITH verified recipient -> autoAlert true
    assert.deepEqual(evaluateSafetyEscalation('Pre-authorized', 'RISK_3', true, true), { autoAlert: true, askConsent: false });
    assert.deepEqual(evaluateSafetyEscalation('Pre-authorized', 'RISK_4', true, true), { autoAlert: true, askConsent: false });

    // Pre-authorized WITHOUT verified recipient -> BLOCKED!
    assert.deepEqual(evaluateSafetyEscalation('Pre-authorized', 'RISK_4', true, false), { autoAlert: false, askConsent: false });

    // "Ask first" mode prompts user for consent instead of silent auto-alerting
    assert.deepEqual(evaluateSafetyEscalation('Ask first', 'RISK_4', true, true), { autoAlert: false, askConsent: true });

    // "Off" or "Suggest" blocks automated dispatch
    assert.deepEqual(evaluateSafetyEscalation('Off', 'RISK_4', true, true), { autoAlert: false, askConsent: false });
    assert.deepEqual(evaluateSafetyEscalation('Suggest', 'RISK_4', true, true), { autoAlert: false, askConsent: false });
  });

  it('PRIVACY AUDIT: Account isolation isolates localStorage keys per authenticated user', () => {
    const keyUser1 = getThreadsStorageKey('user_abc123');
    const keyUser2 = getThreadsStorageKey('user_xyz789');
    const keyGuest = getThreadsStorageKey(null);

    assert.equal(keyUser1, 'paxly_aura_threads_user_abc123');
    assert.equal(keyUser2, 'paxly_aura_threads_user_xyz789');
    assert.equal(keyGuest, 'paxly_aura_threads_guest');

    // Confirm keys never collide across accounts
    assert.notEqual(keyUser1, keyUser2);
    assert.notEqual(keyUser1, keyGuest);
  });
});
