/**
 * Scoped Chat Cache Helper (CHAT-007 & CHAT-010)
 * Ensures chat history, partner details, space configuration, and drafts
 * are strictly partitioned by authenticated user ID and couple space ID.
 *
 * Resilience (CHAT-010):
 * - Resilient against QuotaExceededError, disabled storage, and corrupted JSON.
 * - Progressively trims older confirmed messages on quota errors while preserving pending/optimistic messages.
 * - Strips transient binary blobs and data URIs before serialization.
 * - Degrades to in-memory operation without crashing the UI or blocking send/receive.
 */

export const MAX_CACHED_MESSAGES = 100;
export const CACHE_TRIM_TIERS = [100, 50, 25, 10, 0];

export function getChatMessagesStorageKey(userId, spaceId) {
  if (!userId || !spaceId) return null;
  return `paxly_msgs_${userId}_${spaceId}`;
}

export function getChatPartnerStorageKey(userId, spaceId) {
  if (!userId || !spaceId) return null;
  return `paxly_partner_${userId}_${spaceId}`;
}

export function getChatSpaceStorageKey(userId) {
  if (!userId) return null;
  return `paxly_space_${userId}`;
}

export function getChatDraftStorageKey(userId, spaceId) {
  if (!userId || !spaceId) return null;
  return `paxly_draft_${userId}_${spaceId}`;
}

export function isQuotaError(err) {
  if (!err) return false;
  return Boolean(
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014 ||
    (typeof err.message === 'string' && err.message.toLowerCase().includes('quota'))
  );
}

export function sanitizeMessageForCache(msg) {
  if (!msg || typeof msg !== 'object') return msg;

  const clean = {
    id: msg.id,
    sender_id: msg.sender_id,
    message_type: msg.message_type || 'text',
    text: msg.text || null,
    timestamp: msg.timestamp,
    reactions: msg.reactions || {}
  };

  if (msg.temp_id) clean.temp_id = msg.temp_id;
  if (msg.sender_name) clean.sender_name = msg.sender_name;
  if (msg.reply_to_id) clean.reply_to_id = msg.reply_to_id;
  if (msg.is_edited) clean.is_edited = true;
  if (msg.edited_at) clean.edited_at = msg.edited_at;
  if (msg.isOptimistic) clean.isOptimistic = true;
  if (msg.failed) clean.failed = true;
  if (msg.is_once_view) clean.is_once_view = true;
  if (msg.view_limit) clean.view_limit = msg.view_limit;
  if (msg.views_used) clean.views_used = msg.views_used;
  if (msg.is_compromised) clean.is_compromised = true;

  // Never store transient heavy binary Blobs in localStorage
  // Only persist stable remote media URLs (/media/...)
  const stableUrl = msg._remoteMediaUrl || msg.media_url;
  if (stableUrl && !stableUrl.startsWith('blob:') && !stableUrl.startsWith('data:')) {
    clean.media_url = stableUrl;
  } else if (msg.media_url && (msg.isOptimistic || msg.failed) && msg.media_url.length < 500) {
    clean.media_url = msg.media_url;
  }

  return clean;
}

export function trimMessagesForCache(msgs, maxConfirmedCount = MAX_CACHED_MESSAGES) {
  if (!Array.isArray(msgs)) return [];
  const pending = msgs.filter(m => m && (m.isOptimistic || m.failed));
  const confirmed = msgs.filter(m => m && !m.isOptimistic && !m.failed);
  const slicedConfirmed = maxConfirmedCount > 0 ? confirmed.slice(-maxConfirmedCount) : [];

  const combined = [...slicedConfirmed, ...pending];
  return combined.map(sanitizeMessageForCache);
}

export function getScopedCachedMessages(userId, spaceId) {
  const key = getChatMessagesStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[chatCache] Failed to parse cached messages, purging invalid cache:', err.message || err);
    try {
      localStorage.removeItem(key);
    } catch {}
    return [];
  }
}

export function setScopedCachedMessages(userId, spaceId, msgs) {
  const key = getChatMessagesStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return;

  if (!Array.isArray(msgs)) {
    try {
      localStorage.removeItem(key);
    } catch {}
    return;
  }

  let saved = false;
  for (const tier of CACHE_TRIM_TIERS) {
    try {
      const trimmed = trimMessagesForCache(msgs, tier);
      localStorage.setItem(key, JSON.stringify(trimmed));
      saved = true;
      break;
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn(`[chatCache] Quota exceeded storing messages at tier ${tier}. Retrying with smaller tier.`);
        continue;
      }
      console.warn('[chatCache] Storage write error for messages:', err.message || err);
      break;
    }
  }

  if (!saved) {
    console.warn('[chatCache] Unable to persist chat messages to localStorage. Running in degraded cache mode.');
  }
}

export function getScopedCachedPartner(userId, spaceId) {
  const key = getChatPartnerStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[chatCache] Failed to parse cached partner:', err.message || err);
    return null;
  }
}

export function setScopedCachedPartner(userId, spaceId, partner) {
  const key = getChatPartnerStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    if (partner) {
      const cleanPartner = { ...partner };
      // Omit oversized data URI avatars
      if (cleanPartner.avatar_url && cleanPartner.avatar_url.startsWith('data:')) {
        delete cleanPartner.avatar_url;
      }
      localStorage.setItem(key, JSON.stringify(cleanPartner));
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('[chatCache] Failed to cache partner:', err.message || err);
  }
}

export function getScopedCachedSpace(userId) {
  const key = getChatSpaceStorageKey(userId);
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('[chatCache] Failed to parse cached space:', err.message || err);
    return null;
  }
}

export function setScopedCachedSpace(userId, spaceData) {
  const key = getChatSpaceStorageKey(userId);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    if (spaceData) {
      localStorage.setItem(key, JSON.stringify(spaceData));
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('[chatCache] Failed to cache space:', err.message || err);
  }
}

export function getScopedChatDraft(userId, spaceId) {
  const key = getChatDraftStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(key) || '';
  } catch (err) {
    console.warn('[chatCache] Failed to read chat draft:', err.message || err);
    return '';
  }
}

export function setScopedChatDraft(userId, spaceId, text) {
  const key = getChatDraftStorageKey(userId, spaceId);
  if (!key || typeof localStorage === 'undefined') return;
  try {
    if (text) {
      // Bounded draft to prevent quota exhaustion
      const safeDraft = typeof text === 'string' ? text.slice(0, 10000) : '';
      localStorage.setItem(key, safeDraft);
    } else {
      localStorage.removeItem(key);
    }
  } catch (err) {
    console.warn('[chatCache] Failed to cache chat draft:', err.message || err);
  }
}

/**
 * Clean up legacy global cache keys safely.
 * Does NOT migrate legacy cached messages into a new account without owner verification.
 * Does NOT log plaintext chat content.
 */
export function cleanupLegacyGlobalChatKeys() {
  if (typeof localStorage === 'undefined') return;
  const legacyKeys = [
    'cached_messages',
    'cached_partner',
    'cached_space',
    'chat_draft'
  ];
  legacyKeys.forEach(k => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
}

/**
 * Safe localStorage access wrappers (CHAT-010).
 * Prevents SecurityError or disabled storage from throwing unhandled exceptions.
 */
export function safeGetItem(key) {
  if (!key || typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`[chatCache] Failed to read key '${key}':`, err?.message || err);
    return null;
  }
}

export function safeSetItem(key, value) {
  if (!key || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[chatCache] Failed to set key '${key}':`, err?.message || err);
    return false;
  }
}

export function safeRemoveItem(key) {
  if (!key || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[chatCache] Failed to remove key '${key}':`, err?.message || err);
  }
}

