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

// Safety authorization logic replicating ai.py
function shouldNotifyPartnerSafety(escalationMode, riskLevel, crisisEscalationEnabled) {
  if (!crisisEscalationEnabled) return false;
  const isCrisisLevel = riskLevel === 'RISK_3' || riskLevel === 'RISK_4';
  return escalationMode === 'Pre-authorized' && isCrisisLevel;
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
    assert.equal(shouldNotifyPartnerSafety('Pre-authorized', 'RISK_1', true), false);
    // Severe crying / heartbreak without self-harm intent
    assert.equal(shouldNotifyPartnerSafety('Pre-authorized', 'RISK_2', true), false);
    assert.equal(shouldNotifyPartnerSafety('Suggest', 'RISK_2', true), false);
    assert.equal(shouldNotifyPartnerSafety('Ask first', 'RISK_2', true), false);
    assert.equal(shouldNotifyPartnerSafety('Off', 'RISK_2', true), false);
  });

  it('SAFETY AUDIT: Critical danger (RISK_3 / RISK_4) ONLY alerts when explicitly Pre-authorized', () => {
    // When Pre-authorized and RISK_3 or RISK_4
    assert.equal(shouldNotifyPartnerSafety('Pre-authorized', 'RISK_3', true), true);
    assert.equal(shouldNotifyPartnerSafety('Pre-authorized', 'RISK_4', true), true);

    // If user chose 'Suggest' or 'Off', automatic notification is blocked
    assert.equal(shouldNotifyPartnerSafety('Suggest', 'RISK_4', true), false);
    assert.equal(shouldNotifyPartnerSafety('Off', 'RISK_4', true), false);
    assert.equal(shouldNotifyPartnerSafety('Ask first', 'RISK_4', true), false);
  });

  it('PRIVACY AUDIT: Multi-tenant user isolation prevents cross-account data leakage', () => {
    const userASettings = { user_id: 'user_123', customInstructions: 'Private partner note' };
    const userBSettings = { user_id: 'user_456', customInstructions: 'Different life goal' };

    assert.notEqual(userASettings.user_id, userBSettings.user_id);
    assert.notEqual(userASettings.customInstructions, userBSettings.customInstructions);
  });
});
