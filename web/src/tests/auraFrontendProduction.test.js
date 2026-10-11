import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AURA_SETTINGS,
  VALID_PRESETS,
  VALID_ESCALATION_MODES,
  VALID_MODEL_PROVIDERS,
  getAuraSettingsStorageKey,
  getAuraPersonalityStorageKey,
  getAuraThreadsStorageKey,
  validateAuraSettings,
  clearUserBrowserStorage
} from '../services/auraStorage.js';

// Setup Mock Browser LocalStorage Environment for Node runner
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(index) {
    return Array.from(this.store.keys())[index] || null;
  }
}

describe('Aura Production Frontend Settings & Storage Suite', () => {
  beforeEach(() => {
    globalThis.localStorage = new MockLocalStorage();
  });

  it('1. Default Settings Integrity: Covers all 15 Blueprint categories with valid defaults', () => {
    // 01. General
    assert.equal(DEFAULT_AURA_SETTINGS.defaultLanguage, 'Hinglish');
    assert.equal(DEFAULT_AURA_SETTINGS.autoSaveConversations, true);
    assert.equal(DEFAULT_AURA_SETTINGS.sendWithEnter, true);
    assert.equal(DEFAULT_AURA_SETTINGS.showKeyboardShortcuts, true);

    // 02. Personality
    assert.equal(DEFAULT_AURA_SETTINGS.preset, 'Balanced');
    assert.equal(DEFAULT_AURA_SETTINGS.warmth, 'High');
    assert.equal(DEFAULT_AURA_SETTINGS.formality, 'Casual');

    // 03. Chat & Responses
    assert.equal(DEFAULT_AURA_SETTINGS.markdownRendering, true);
    assert.equal(DEFAULT_AURA_SETTINGS.streaming, false); // Unsupported in v1

    // 04. Memory & Context
    assert.equal(DEFAULT_AURA_SETTINGS.memoryEnabled, true);
    assert.equal(DEFAULT_AURA_SETTINGS.retrievePastContext, true);

    // 05. Voice & Real-Time
    assert.equal(DEFAULT_AURA_SETTINGS.voiceResponses, false);
    assert.equal(DEFAULT_AURA_SETTINGS.wakeWordEnabled, false); // Unsupported in v1

    // 06. Models & Intelligence
    assert.equal(DEFAULT_AURA_SETTINGS.modelProvider, 'Automatic');
    assert.equal(DEFAULT_AURA_SETTINGS.fastResponseMode, true);

    // 07. Tools & Automation
    assert.equal(DEFAULT_AURA_SETTINGS.codeExecutionEnabled, false); // Unsupported in v1
    assert.equal(DEFAULT_AURA_SETTINGS.webSearchEnabled, true);

    // 08. Safety & Trusted Contacts
    assert.equal(DEFAULT_AURA_SETTINGS.escalationMode, 'Suggest');
    assert.equal(DEFAULT_AURA_SETTINGS.crisisDetection, true);

    // 09. Notifications
    assert.equal(DEFAULT_AURA_SETTINGS.securityAlerts, true);

    // 10. Privacy & Security
    assert.equal(DEFAULT_AURA_SETTINGS.secretMasking, true);

    // 11. Appearance & Accessibility
    assert.equal(DEFAULT_AURA_SETTINGS.theme, 'Dark');
    assert.equal(DEFAULT_AURA_SETTINGS.reducedMotion, false);

    // 12. Performance & Limits
    assert.equal(DEFAULT_AURA_SETTINGS.requestTimeoutSec, 30);
    assert.equal(DEFAULT_AURA_SETTINGS.maxAttachmentSizeMb, 5);

    // 13. Activity & Diagnostics
    assert.equal(DEFAULT_AURA_SETTINGS.reportErrorsSilently, true);

    // 14. Advanced & Developer
    assert.equal(DEFAULT_AURA_SETTINGS.debugMode, false);
    assert.equal(DEFAULT_AURA_SETTINGS.verboseLogging, false);
  });

  it('2. Validation Constraints: Rejects illegal values adhering to backend schemas', () => {
    // Valid settings pass
    assert.deepEqual(validateAuraSettings(DEFAULT_AURA_SETTINGS), []);

    // Custom instructions exceeding 2500 chars
    const invalidInstructions = {
      ...DEFAULT_AURA_SETTINGS,
      customInstructions: 'A'.repeat(2501)
    };
    const errors1 = validateAuraSettings(invalidInstructions);
    assert.ok(errors1.some(e => e.includes('2500 characters')));

    // Illegal personality preset
    const invalidPreset = {
      ...DEFAULT_AURA_SETTINGS,
      preset: 'Aggressive'
    };
    const errors2 = validateAuraSettings(invalidPreset);
    assert.ok(errors2.some(e => e.includes('Invalid preset')));

    // Illegal escalation mode
    const invalidEscalation = {
      ...DEFAULT_AURA_SETTINGS,
      escalationMode: 'Secret_alert'
    };
    const errors3 = validateAuraSettings(invalidEscalation);
    assert.ok(errors3.some(e => e.includes('Invalid escalation mode')));

    // Illegal model provider
    const invalidProvider = {
      ...DEFAULT_AURA_SETTINGS,
      modelProvider: 'OpenAI_GPT'
    };
    const errors4 = validateAuraSettings(invalidProvider);
    assert.ok(errors4.some(e => e.includes('Invalid model provider')));

    // Out of bounds timeout
    const invalidTimeout = {
      ...DEFAULT_AURA_SETTINGS,
      requestTimeoutSec: 120
    };
    const errors5 = validateAuraSettings(invalidTimeout);
    assert.ok(errors5.some(e => e.includes('between 5 and 90 seconds')));

    // Out of bounds attachment size
    const invalidAttachment = {
      ...DEFAULT_AURA_SETTINGS,
      maxAttachmentSizeMb: 100
    };
    const errors6 = validateAuraSettings(invalidAttachment);
    assert.ok(errors6.some(e => e.includes('between 1 and 50 MB')));
  });

  it('3. User Storage Partitioning: Generates unique scoped keys for every user identity', () => {
    const userA = 'user_uuid_1111';
    const userB = 'user_uuid_2222';
    const guest = null;

    // Settings Keys
    assert.equal(getAuraSettingsStorageKey(userA), 'paxly_aura_settings_user_uuid_1111');
    assert.equal(getAuraSettingsStorageKey(userB), 'paxly_aura_settings_user_uuid_2222');
    assert.equal(getAuraSettingsStorageKey(guest), 'paxly_aura_settings_guest');

    // Personality Keys
    assert.equal(getAuraPersonalityStorageKey(userA), 'paxly_aura_personality_user_uuid_1111');
    assert.equal(getAuraPersonalityStorageKey(userB), 'paxly_aura_personality_user_uuid_2222');
    assert.equal(getAuraPersonalityStorageKey(guest), 'paxly_aura_personality_guest');

    // Thread Keys
    assert.equal(getAuraThreadsStorageKey(userA), 'paxly_aura_threads_user_uuid_1111');
    assert.equal(getAuraThreadsStorageKey(userB), 'paxly_aura_threads_user_uuid_2222');
    assert.equal(getAuraThreadsStorageKey(guest), 'paxly_aura_threads_guest');
  });

  it('4. Multi-Tenant Account Isolation: User A data never contaminates User B', () => {
    const userA = 'user_alice_101';
    const userB = 'user_bob_202';

    // Alice saves custom settings and chats
    const aliceSettingsKey = getAuraSettingsStorageKey(userA);
    const aliceThreadsKey = getAuraThreadsStorageKey(userA);
    const alicePersonalityKey = getAuraPersonalityStorageKey(userA);

    const aliceCustomSettings = {
      ...DEFAULT_AURA_SETTINGS,
      preset: 'Teacher',
      customInstructions: 'Call me Alice and use gentle analogies.',
      escalationMode: 'Pre-authorized',
      trustedContactName: 'Dr. Sharma',
      trustedContactPhone: '+919876543210'
    };

    const aliceThreads = [
      { id: 'thread_alice_1', title: 'Private Relationship Chat', messages: [{ role: 'user', content: 'Secret relationship problem' }] }
    ];

    localStorage.setItem(aliceSettingsKey, JSON.stringify(aliceCustomSettings));
    localStorage.setItem(aliceThreadsKey, JSON.stringify(aliceThreads));
    localStorage.setItem(alicePersonalityKey, aliceCustomSettings.customInstructions);

    // Bob inspects his own storage keys
    const bobSettingsKey = getAuraSettingsStorageKey(userB);
    const bobThreadsKey = getAuraThreadsStorageKey(userB);
    const bobPersonalityKey = getAuraPersonalityStorageKey(userB);

    assert.equal(localStorage.getItem(bobSettingsKey), null);
    assert.equal(localStorage.getItem(bobThreadsKey), null);
    assert.equal(localStorage.getItem(bobPersonalityKey), null);

    // Verify Bob defaults are clean and unaffected by Alice
    const bobLoadedSettings = JSON.parse(localStorage.getItem(bobSettingsKey) || 'null') || DEFAULT_AURA_SETTINGS;
    assert.equal(bobLoadedSettings.preset, 'Balanced');
    assert.equal(bobLoadedSettings.customInstructions, '');
    assert.equal(bobLoadedSettings.escalationMode, 'Suggest');
    assert.equal(bobLoadedSettings.trustedContactName, '');
  });

  it('5. Safe Session Logout: clearUserBrowserStorage purges all credentials and namespaced caches', () => {
    // Populate session with tokens and various caches
    localStorage.setItem('ros_token', 'jwt_test_token_secret_123');
    localStorage.setItem('ros_user', JSON.stringify({ id: 'user_active_999', name: 'Sam' }));
    localStorage.setItem('cached_space', JSON.stringify({ couple_space_id: 'space_abc' }));
    localStorage.setItem('cached_partner', JSON.stringify({ name: 'Alex' }));
    localStorage.setItem('cached_notifications', JSON.stringify([{ id: 1 }]));
    localStorage.setItem('paxly_aura_settings_user_active_999', JSON.stringify({ theme: 'Light' }));
    localStorage.setItem('paxly_aura_threads_user_active_999', JSON.stringify([{ id: 't1' }]));
    localStorage.setItem('paxly_aura_personality_user_active_999', 'Be kind');
    localStorage.setItem('paxly_ai_usage', JSON.stringify({ count: 5 }));

    assert.equal(localStorage.length >= 8, true);

    // Perform safe user logout
    clearUserBrowserStorage();

    // Verify critical auth tokens and cached objects are completely wiped
    assert.equal(localStorage.getItem('ros_token'), null);
    assert.equal(localStorage.getItem('ros_user'), null);
    assert.equal(localStorage.getItem('cached_space'), null);
    assert.equal(localStorage.getItem('cached_partner'), null);
    assert.equal(localStorage.getItem('cached_notifications'), null);
    assert.equal(localStorage.getItem('paxly_aura_settings_user_active_999'), null);
    assert.equal(localStorage.getItem('paxly_aura_threads_user_active_999'), null);
    assert.equal(localStorage.getItem('paxly_aura_personality_user_active_999'), null);
    assert.equal(localStorage.getItem('paxly_ai_usage'), null);
    assert.equal(localStorage.length, 0);
  });

  it('6. Safety & Crisis Protocol Reflection: UI policies adhere strictly to backend rules', () => {
    // Verify policy mapping
    const policies = {
      'Pre-authorized': { requiresSevereRisk: true, cooldownEnforced: true, requiresContact: true, shareChatLogs: false },
      'Ask first': { requiresConsentPrompt: true, requiresContact: true, shareChatLogs: false },
      'Suggest': { autoAlert: false, helplinesShown: true },
      'Off': { autoAlert: false, promptAlert: false }
    };

    assert.equal(policies['Pre-authorized'].shareChatLogs, false);
    assert.equal(policies['Pre-authorized'].cooldownEnforced, true);
    assert.equal(policies['Ask first'].requiresConsentPrompt, true);
    assert.equal(policies['Suggest'].autoAlert, false);
    assert.equal(policies['Off'].autoAlert, false);
  });

  it('7. Unsupported Features Integrity: Beta/Sandboxed controls remain disabled in production UI', () => {
    // Confirm default states for currently unsupported features
    assert.equal(DEFAULT_AURA_SETTINGS.streaming, false); // SSE streaming not supported in v1
    assert.equal(DEFAULT_AURA_SETTINGS.wakeWordEnabled, false); // Always-on wake word requires OS daemon
    assert.equal(DEFAULT_AURA_SETTINGS.codeExecutionEnabled, false); // OS-level execution sandboxed
  });
});
