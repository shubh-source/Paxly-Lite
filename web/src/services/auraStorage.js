export const DEFAULT_AURA_SETTINGS = {
  // 01. General
  defaultLanguage: 'Hinglish',
  defaultResponseLength: 'Balanced',
  defaultAiMode: 'Auto',
  startupBehavior: 'Restore previous session',
  defaultLandingPage: 'Chat',
  autoSaveConversations: true,
  sendWithEnter: true,
  showKeyboardShortcuts: true,

  // 02. Personality
  preset: 'Balanced',
  customInstructions: '',
  warmth: 'High',
  formality: 'Casual',
  humor: 'Medium',
  directness: 'Balanced',
  teachingStyle: 'Concept first',
  correctionStyle: 'Gentle',
  supportStyle: 'Reassure',
  proactivity: 'Suggestive',
  initiative: 'Suggestive',

  // 03. Chat & Responses
  language: 'Hinglish',
  responseLength: 'Balanced',
  explanationLevel: 'Adaptive',
  formatStyle: 'Paragraphs',
  stepByStep: true,
  useContext: true,
  streaming: false,
  markdownRendering: true,
  codeSyntaxHighlighting: true,
  autoCodeFormatting: true,
  showTimestamps: false,
  followUpSuggestions: true,
  autoConversationTitles: true,

  // 04. Memory & Context
  memoryEnabled: true,
  autoSavePreferences: true,
  saveProjectProgress: true,
  retrievePastContext: true,
  retention: 'Until deleted',
  showMemoryReason: true,
  confirmSensitiveMemories: true,

  // 05. Voice & Real-Time
  voiceInput: true,
  voiceResponses: false,
  speechSpeed: '1.0x',
  pushToTalk: true,
  wakeWordEnabled: false,
  interruptSpeech: true,
  noiseSuppression: true,

  // 06. Models & Intelligence
  modelProvider: 'Automatic',
  fastResponseMode: true,
  deepReasoning: false,
  structuredOutput: true,
  autoModelRouting: true,
  localModelEndpoint: 'http://localhost:11434',
  maxOutputTokens: 1000,
  temperature: 0.7,

  // 07. Tools & Automation
  webSearchEnabled: true,
  fileAccessEnabled: true,
  codeExecutionEnabled: false,
  confirmExternalActions: true,
  confirmFileModifications: true,

  // 08. Safety & Trusted Contacts
  emotionalSupportMode: true,
  crisisDetection: true,
  escalationMode: 'Suggest',
  trustedContact: '',
  trustedContactName: '',
  trustedContactPhone: '',
  locationSharingCrisis: false,

  // 09. Notifications
  inAppNotifications: true,
  pushNotifications: true,
  securityAlerts: true,
  trustedContactAlerts: true,
  quietHoursEnabled: false,

  // 10. Privacy & Security
  dataRetention: 'Standard',
  analyticsConsent: true,
  secretMasking: true,
  anonymousDiagnostics: true,

  // 11. Appearance & Accessibility
  theme: 'Dark',
  accentColor: 'Gold',
  fontSize: 'Medium',
  chatDensity: 'Comfortable',
  bubbleStyle: 'Modern Glass',
  chatWidth: 'Standard',
  reducedMotion: false,
  highContrastMode: false,

  // 12. Performance & Limits
  performanceMode: 'Balanced',
  cacheRetention: true,
  requestTimeoutSec: 30,
  maxAttachmentSizeMb: 5,

  // 13. Activity & Diagnostics
  logLatency: true,
  reportErrorsSilently: true,

  // 14. Advanced & Developer
  debugMode: false,
  verboseLogging: false,
  customApiEndpoint: '',
};

export const VALID_PRESETS = ['Balanced', 'Friendly', 'Professional', 'Teacher', 'Technical', 'Minimal'];
export const VALID_ESCALATION_MODES = ['Suggest', 'Ask first', 'Pre-authorized', 'Off'];
export const VALID_MODEL_PROVIDERS = ['Automatic', 'Gemini', 'Groq'];

export function getAuraSettingsStorageKey(userId) {
  return userId ? `paxly_aura_settings_${userId}` : 'paxly_aura_settings_guest';
}

export function getAuraPersonalityStorageKey(userId) {
  return userId ? `paxly_aura_personality_${userId}` : 'paxly_aura_personality_guest';
}

export function getAuraThreadsStorageKey(userId) {
  return userId ? `paxly_aura_threads_${userId}` : 'paxly_aura_threads_guest';
}

export const getThreadsStorageKey = getAuraThreadsStorageKey;

import { cleanupLegacyGlobalChatKeys } from './chatCache.js';

export function clearUserBrowserStorage() {
  if (typeof localStorage === 'undefined') return;
  cleanupLegacyGlobalChatKeys();
  const fixedKeys = [
    'ros_token',
    'ros_user',
    'cached_space',
    'cached_partner',
    'cached_messages',
    'chat_draft',
    'paxly_sk',
    'cached_notifications',
    'cached_memories',
    'cached_voicenotes',
    'cached_dates',
    'paxly_aura_personality',
    'paxly_aura_comprehensive_settings',
    'paxly_ai_usage',
    'paxly_aura_threads',
    'paxly_aura_chat_history'
  ];
  fixedKeys.forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
  });

  const keysToRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('paxly_') || key.startsWith('cached_'))) {
        keysToRemove.push(key);
      }
    }
  } catch (_) {}
  keysToRemove.forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
}

export function validateAuraSettings(settings) {
  const errors = [];
  if (!settings || typeof settings !== 'object') {
    return ['Settings must be a valid object.'];
  }
  if (settings.customInstructions && typeof settings.customInstructions === 'string' && settings.customInstructions.length > 2500) {
    errors.push('Custom instructions cannot exceed 2500 characters.');
  }
  if (settings.preset && !VALID_PRESETS.includes(settings.preset)) {
    errors.push(`Invalid preset: ${settings.preset}. Allowed: ${VALID_PRESETS.join(', ')}`);
  }
  if (settings.escalationMode && !VALID_ESCALATION_MODES.includes(settings.escalationMode)) {
    errors.push(`Invalid escalation mode: ${settings.escalationMode}. Allowed: ${VALID_ESCALATION_MODES.join(', ')}`);
  }
  if (settings.modelProvider && !VALID_MODEL_PROVIDERS.includes(settings.modelProvider)) {
    errors.push(`Invalid model provider: ${settings.modelProvider}. Allowed: ${VALID_MODEL_PROVIDERS.join(', ')}`);
  }
  if (typeof settings.requestTimeoutSec === 'number' && (settings.requestTimeoutSec < 5 || settings.requestTimeoutSec > 90)) {
    errors.push('Request timeout must be between 5 and 90 seconds.');
  }
  if (typeof settings.maxAttachmentSizeMb === 'number' && (settings.maxAttachmentSizeMb < 1 || settings.maxAttachmentSizeMb > 50)) {
    errors.push('Max attachment size must be between 1 and 50 MB.');
  }
  return errors;
}
