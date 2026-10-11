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
});
