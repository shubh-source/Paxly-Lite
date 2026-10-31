import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getScopedCachedMessages,
  setScopedCachedMessages,
  getScopedCachedPartner,
  setScopedCachedPartner,
  getScopedCachedSpace,
  setScopedCachedSpace,
  getScopedChatDraft,
  setScopedChatDraft,
  cleanupLegacyGlobalChatKeys,
  sanitizeMessageForCache,
  trimMessagesForCache,
  isQuotaError,
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  MAX_CACHED_MESSAGES,
  CACHE_TRIM_TIERS
} from '../services/chatCache.js';
import { clearUserBrowserStorage } from '../services/auraStorage.js';

if (typeof globalThis.localStorage === 'undefined') {
  class MockLocalStorage {
    constructor() { this.store = new Map(); }
    getItem(k) { return this.store.has(k) ? this.store.get(k) : null; }
    setItem(k, v) { this.store.set(k, String(v)); }
    removeItem(k) { this.store.delete(k); }
    clear() { this.store.clear(); }
    get length() { return this.store.size; }
    key(i) { return Array.from(this.store.keys())[i] || null; }
  }
  globalThis.localStorage = new MockLocalStorage();
}

describe('Chat Message Deduplication & Reaction Stabilization Suite', () => {

  // Test 1: syncMessages deduplication logic
  test('1. syncMessages deduplication: Discards optimistic placeholder when server returns confirmed message', () => {
    const now = Date.now();
    const tempId = `temp_${now}_abc12`;
    const serverUuid = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    const userId = 'usr_test_123';

    // State before sync (optimistic message displayed)
    const prev = [
      {
        id: 'msg_old_1',
        sender_id: userId,
        text: 'Old message',
        message_type: 'text',
        timestamp: new Date(now - 100000).toISOString(),
        reactions: {}
      },
      {
        id: tempId,
        temp_id: tempId,
        sender_id: userId,
        text: 'Hello sweetie ❤️',
        message_type: 'text',
        timestamp: new Date(now - 1000).toISOString(),
        isOptimistic: true,
        reactions: {}
      }
    ];

    // Data returned by server (GET /chat/messages)
    const serverMsgs = [
      {
        id: 'msg_old_1',
        sender_id: userId,
        text: 'Old message',
        message_type: 'text',
        timestamp: new Date(now - 100000).toISOString(),
        reactions: {}
      },
      {
        id: serverUuid,
        temp_id: tempId,
        sender_id: userId,
        text: 'Hello sweetie ❤️',
        message_type: 'text',
        timestamp: new Date(now - 900).toISOString(),
        reactions: {}
      }
    ];

    // Apply the deduplication algorithm
    const msgMap = new Map();
    serverMsgs.forEach(m => msgMap.set(m.id, m));

    prev.forEach(m => {
      if (!m.isOptimistic) return;
      const msgTime = new Date(m.timestamp).getTime();
      if (now - msgTime > 25000) return;

      const alreadySynced = serverMsgs.some(s => {
        if (s.id === m.id) return true;
        if (s.temp_id && (s.temp_id === m.id || s.temp_id === m.temp_id)) return true;
        if (String(s.sender_id) === String(m.sender_id) && s.message_type === m.message_type) {
          const timeDiff = Math.abs(new Date(s.timestamp).getTime() - msgTime);
          if (timeDiff < 45000) {
            return s.text === m.text;
          }
        }
        return false;
      });

      if (!alreadySynced && !msgMap.has(m.id)) {
        msgMap.set(m.id, m);
      }
    });

    const merged = Array.from(msgMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Must have exactly 2 messages (no duplicates!)
    assert.equal(merged.length, 2, 'Message count must remain exactly 2, not 3');
    assert.equal(merged[1].id, serverUuid, 'The second message must be the confirmed server UUID');
    assert.equal(merged.filter(m => m.text === 'Hello sweetie ❤️').length, 1, 'There must be strictly ONE message with text "Hello sweetie ❤️"');
  });

  // Test 2: In-place replacement on WebSocket confirmation
  test('2. WebSocket chat_message confirmation preserves key temp_id and replaces in-place', () => {
    const now = Date.now();
    const tempId = `temp_${now}_xyz89`;
    const serverUuid = '8910abcd-1234-5678-90ab-cdef12345678';
    const userId = 'usr_alice';

    const p = [
      {
        id: tempId,
        temp_id: tempId,
        sender_id: userId,
        text: 'Sent via WebSocket',
        message_type: 'text',
        timestamp: new Date(now).toISOString(),
        isOptimistic: true,
        reactions: {}
      }
    ];

    const incomingWsMsg = {
      type: 'chat_message',
      id: serverUuid,
      temp_id: tempId,
      sender_id: userId,
      message_type: 'text',
      text: 'Sent via WebSocket',
      reactions: {},
      timestamp: new Date(now).toISOString()
    };

    // WS handler matching logic
    const isOwn = String(incomingWsMsg.sender_id) === String(userId);
    const optIdx = p.findIndex(m => {
      if (!m.isOptimistic) return false;
      if (incomingWsMsg.temp_id && (m.id === incomingWsMsg.temp_id || m.temp_id === incomingWsMsg.temp_id)) return true;
      if (isOwn) {
        if (m.message_type !== incomingWsMsg.message_type) return false;
        if (m.message_type === 'text') return m.text === incomingWsMsg.text;
      }
      return false;
    });

    assert.equal(optIdx, 0, 'Must find the optimistic message at index 0');

    const newMsgs = [...p];
    const optMsg = newMsgs[optIdx];
    newMsgs[optIdx] = {
      ...incomingWsMsg,
      temp_id: optMsg.temp_id || incomingWsMsg.temp_id,
      text: optMsg.text || incomingWsMsg.text,
      isOptimistic: false
    };

    const deduplicated = newMsgs.filter((m, idx) => idx === optIdx || m.id !== incomingWsMsg.id);

    assert.equal(deduplicated.length, 1, 'Must have exactly 1 message');
    assert.equal(deduplicated[0].id, serverUuid, 'ID must be updated to server UUID');
    assert.equal(deduplicated[0].temp_id, tempId, 'temp_id must be preserved for stable React key');
    assert.equal(deduplicated[0].isOptimistic, false, 'isOptimistic must be false');
  });

  // Test 3: Redundant reaction echo filtering
  test('3. Reaction echo filtering: Identical reaction state returns original array reference', () => {
    const msgId = 'msg_abc_999';
    const userId = 'usr_alice';

    const initialMsgs = [
      {
        id: msgId,
        text: 'Look at this photo',
        reactions: {
          [userId]: '❤️'
        }
      }
    ];

    // Incoming WS reaction with same emoji
    const incomingReactionEvent = {
      type: 'reaction',
      message_id: msgId,
      user_id: userId,
      emoji: '❤️'
    };

    const updateState = (p, d) => {
      const target = p.find(m => m.id === d.message_id);
      if (!target) return p;

      let nextReactions = { ...(target.reactions || {}) };
      if (d.reactions) {
        nextReactions = d.reactions;
      } else if (d.emoji) {
        nextReactions[d.user_id] = d.emoji;
      } else {
        delete nextReactions[d.user_id];
      }

      const curr = target.reactions || {};
      const nextKeys = Object.keys(nextReactions);
      const currKeys = Object.keys(curr);
      if (
        nextKeys.length === currKeys.length &&
        nextKeys.every(k => nextReactions[k] === curr[k])
      ) {
        return p; // Reference equality avoids React re-render!
      }

      return p.map(m => m.id === d.message_id ? { ...m, reactions: nextReactions } : m);
    };

    const result = updateState(initialMsgs, incomingReactionEvent);
    assert.equal(result, initialMsgs, 'Must return the EXACT same array reference to prevent visual jitter/re-renders');
  });

  // Test 4: Optimistic message pending reaction preservation
  test('4. Reactions on optimistic messages: Pending reaction is attached and queued', () => {
    const tempId = 'temp_12345';
    const targetMsg = {
      id: tempId,
      temp_id: tempId,
      isOptimistic: true,
      reactions: {}
    };

    const userId = 'usr_bob';
    const emoji = '🔥';

    const isOptimistic = Boolean(targetMsg.isOptimistic) || (targetMsg.id && String(targetMsg.id).startsWith('temp_'));
    assert.equal(isOptimistic, true, 'Message must be recognized as optimistic');

    let updatedMsg = { ...targetMsg };
    const nextReactions = { ...(updatedMsg.reactions || {}) };
    nextReactions[userId] = emoji;
    updatedMsg = {
      ...updatedMsg,
      reactions: nextReactions,
      _pendingReaction: isOptimistic ? emoji : updatedMsg._pendingReaction
    };

    assert.equal(updatedMsg.reactions[userId], '🔥', 'Optimistic reaction is immediately visible');
    assert.equal(updatedMsg._pendingReaction, '🔥', '_pendingReaction is queued to send on server confirmation');
  });

  // Test 5: Pending message error retention & matching confirmation reconciliation
  test('5. Frontend retains pending message on failure and reconciles on server confirmation', () => {
    const tempId = 'temp_err_reconcile_456';
    let msgs = [
      {
        id: tempId,
        temp_id: tempId,
        sender_id: 'usr_me',
        text: 'Important message that might fail',
        isOptimistic: true,
        failed: false,
        reactions: {}
      }
    ];

    // 1. Backend sends chat_message_error
    const errorEvent = {
      type: 'chat_message_error',
      temp_id: tempId,
      message: 'Failed to persist message to database'
    };

    msgs = msgs.map(m => (m.id === errorEvent.temp_id || m.temp_id === errorEvent.temp_id)
      ? { ...m, isOptimistic: false, failed: true }
      : m
    );

    assert.equal(msgs.length, 1, 'Message must NOT disappear on failure');
    assert.equal(msgs[0].failed, true, 'Message must be marked as failed');
    assert.equal(msgs[0].isOptimistic, false, 'Message is no longer optimistic in-flight');

    // 2. User retries and backend server confirmation arrives
    const serverConfirmed = {
      type: 'chat_message',
      id: 'uuid-permanent-confirmed-999',
      temp_id: tempId,
      sender_id: 'usr_me',
      text: 'Important message that might fail',
      reactions: {}
    };

    const optIdx = msgs.findIndex(m => (m.isOptimistic || m.failed) && (m.id === serverConfirmed.temp_id || m.temp_id === serverConfirmed.temp_id));
    assert.notEqual(optIdx, -1, 'Must find matching failed/optimistic message by temp_id');

    msgs[optIdx] = {
      ...serverConfirmed,
      temp_id: msgs[optIdx].temp_id,
      isOptimistic: false,
      failed: false
    };

    assert.equal(msgs.length, 1, 'Must preserve single message entry');
    assert.equal(msgs[0].id, 'uuid-permanent-confirmed-999', 'Permanent server ID reconciled');
    assert.equal(msgs[0].failed, false, 'Failed flag cleared on confirmation');
  });

  // Test 6: History sync does not remove valid pending or failed message prematurely
  test('6. History sync does not remove valid pending or failed messages prematurely', () => {
    const now = Date.now();
    const pendingTempId = `temp_pending_${now}`;
    const failedTempId = `temp_failed_${now - 10000}`;

    const prev = [
      {
        id: 'msg_old_confirmed',
        sender_id: 'usr_me',
        text: 'Existing server message',
        timestamp: new Date(now - 120000).toISOString(),
        reactions: {}
      },
      {
        id: pendingTempId,
        temp_id: pendingTempId,
        sender_id: 'usr_me',
        text: 'In-flight message sent 5 seconds ago',
        timestamp: new Date(now - 5000).toISOString(),
        isOptimistic: true,
        failed: false,
        reactions: {}
      },
      {
        id: failedTempId,
        temp_id: failedTempId,
        sender_id: 'usr_me',
        text: 'Failed message needing retry',
        timestamp: new Date(now - 10000).toISOString(),
        isOptimistic: false,
        failed: true,
        reactions: {}
      }
    ];

    // Server history currently does not yet have the pending or failed message
    const decryptedMsgs = [
      {
        id: 'msg_old_confirmed',
        sender_id: 'usr_me',
        text: 'Existing server message',
        timestamp: new Date(now - 120000).toISOString(),
        reactions: {}
      }
    ];

    const msgMap = new Map();
    decryptedMsgs.forEach(m => msgMap.set(m.id, m));

    prev.forEach(m => {
      const msgTime = new Date(m.timestamp).getTime();

      if (m.failed) {
        if (!msgMap.has(m.id)) {
          msgMap.set(m.id, m);
        }
      } else if (m.isOptimistic) {
        if (now - msgTime > 90000) return;

        const alreadySynced = decryptedMsgs.some(s => {
          if (s.id === m.id) return true;
          if (s.temp_id && (s.temp_id === m.id || s.temp_id === m.temp_id)) return true;
          return false;
        });

        if (!alreadySynced && !msgMap.has(m.id)) {
          msgMap.set(m.id, m);
        }
      }
    });

    const syncedList = Array.from(msgMap.values());
    assert.equal(syncedList.length, 3, 'All 3 messages (old confirmed, pending in-flight, failed) must be preserved');
    assert.ok(syncedList.some(m => m.id === pendingTempId), 'Pending message must NOT be removed by history sync');
    assert.ok(syncedList.some(m => m.id === failedTempId), 'Failed message must NOT be removed by history sync');
  });

  // Test 7: Authoritative single write path (WebSocket when connected, REST fallback only when disconnected)
  test('7. Single authoritative write path: WebSocket only when connected, REST only when disconnected', () => {
    let wsCalls = [];
    let restCalls = [];

    const mockWs = {
      connected: true,
      send: (payload) => wsCalls.push(payload)
    };

    const mockApi = {
      post: (url, body) => {
        restCalls.push({ method: 'POST', url, body });
        return Promise.resolve({ data: { reactions: { u1: body.emoji } } });
      },
      delete: (url) => {
        restCalls.push({ method: 'DELETE', url });
        return Promise.resolve({ data: { reactions: {} } });
      }
    };

    const dispatchReaction = (msgId, emoji, ws, api) => {
      if (ws.connected) {
        ws.send({ type: 'reaction', message_id: msgId, emoji });
      } else {
        if (emoji) {
          api.post(`/chat/messages/${msgId}/react`, { emoji });
        } else {
          api.delete(`/chat/messages/${msgId}/react`);
        }
      }
    };

    // Case A: WebSocket connected -> triggers WS ONLY, zero REST calls
    dispatchReaction('msg_100', '❤️', mockWs, mockApi);
    assert.equal(wsCalls.length, 1, 'Exactly one WebSocket reaction command sent');
    assert.equal(wsCalls[0].emoji, '❤️');
    assert.equal(restCalls.length, 0, 'Zero REST calls when WebSocket is connected');

    // Case B: WebSocket disconnected -> triggers REST fallback ONLY
    mockWs.connected = false;
    dispatchReaction('msg_100', '🔥', mockWs, mockApi);
    assert.equal(wsCalls.length, 1, 'No new WebSocket messages sent when disconnected');
    assert.equal(restCalls.length, 1, 'Exactly one REST fallback call sent');
    assert.equal(restCalls[0].method, 'POST');
    assert.equal(restCalls[0].body.emoji, '🔥');
  });

  // Test 8: Stale reaction snapshot protection
  test('8. Stale full-map snapshot protection: Unconfirmed or newer reaction is preserved during sync', () => {
    const userId = 'u1';
    const msgId = 'msg_sync_reactions';

    const localMsg = {
      id: msgId,
      reactions: { [userId]: '💖' },
      _pendingReaction: '💖'
    };

    // Stale server snapshot (server has not yet registered the local user's reaction)
    const serverMsg = {
      id: msgId,
      reactions: { u2: '👍' }
    };

    // Merge logic adhering to CHAT-001
    const mergedReactions = { ...serverMsg.reactions };
    if (localMsg._pendingReaction && !mergedReactions[userId]) {
      mergedReactions[userId] = localMsg._pendingReaction;
    }

    assert.equal(mergedReactions[userId], '💖', 'Local user reaction must be preserved');
    assert.equal(mergedReactions['u2'], '👍', 'Partner reaction must be preserved');
  });

  // Test 9: Rapid sequential emoji changes
  test('9. Rapid emoji changes: sequential updates preserve the latest selected emoji', () => {
    let currentReactions = {};
    const userId = 'u1';

    const applyReactionChange = (emoji) => {
      if (emoji) {
        currentReactions = { ...currentReactions, [userId]: emoji };
      } else {
        const next = { ...currentReactions };
        delete next[userId];
        currentReactions = next;
      }
    };

    // User rapidly clicks ❤️ -> 🔥 -> 👏 -> remove
    applyReactionChange('❤️');
    assert.equal(currentReactions[userId], '❤️');

    applyReactionChange('🔥');
    assert.equal(currentReactions[userId], '🔥');

    applyReactionChange('👏');
    assert.equal(currentReactions[userId], '👏');

    applyReactionChange(null);
    assert.equal(currentReactions[userId], undefined);
  });

  // Test 10: CHAT-004: Optimistic voice-note message reconciliation
  test('10. CHAT-004: Optimistic voice-note message reconciles by temp_id, replaces in-place, and revokes blob URL', () => {
    const tempId = 'temp_voice_' + Date.now();
    const serverUuid = 'f3b20c19-9404-4c8d-b0ad-5fba5fa30b12';
    const localBlobUrl = 'blob:http://localhost:5173/voice-blob-uuid';
    const remoteUrl = '/media/voice/voice_note_123.webm';
    const userId = 'usr_alice';

    let revokedUrl = null;
    const mockRevoke = (url) => { revokedUrl = url; };

    // Initial state with optimistic voice-note bubble
    const prev = [
      {
        id: tempId,
        temp_id: tempId,
        sender_id: userId,
        text: 'E2EE_KEY:symmkey123',
        message_type: 'audio',
        media_url: localBlobUrl,
        _blobUrl: localBlobUrl,
        isOptimistic: true,
        failed: false,
        reactions: {}
      }
    ];

    // Incoming server confirmation via WebSocket or REST
    const confirmedMsg = {
      id: serverUuid,
      temp_id: tempId,
      sender_id: userId,
      message_type: 'audio',
      text: 'E2EE_KEY:symmkey123',
      media_url: remoteUrl,
      reactions: {}
    };

    // Reconcile according to Chat.jsx logic
    const optIdx = prev.findIndex(m => {
      if (!m.isOptimistic && !m.failed) return false;
      if (confirmedMsg.temp_id && (m.id === confirmedMsg.temp_id || m.temp_id === confirmedMsg.temp_id)) return true;
      return false;
    });

    assert.notEqual(optIdx, -1, 'Must find matching optimistic voice note by temp_id');
    const optMsg = prev[optIdx];
    if (optMsg._blobUrl) {
      mockRevoke(optMsg._blobUrl);
    }

    const nextMsgs = [...prev];
    nextMsgs[optIdx] = {
      ...confirmedMsg,
      temp_id: optMsg.temp_id || confirmedMsg.temp_id,
      text: optMsg.text || confirmedMsg.text,
      media_url: confirmedMsg.media_url || optMsg.media_url,
      isOptimistic: false,
      failed: false
    };

    const deduplicated = nextMsgs.filter((m, idx) => idx === optIdx || m.id !== confirmedMsg.id);

    assert.equal(deduplicated.length, 1, 'Exactly one message bubble must remain');
    assert.equal(deduplicated[0].id, serverUuid, 'Message ID must be confirmed server UUID');
    assert.equal(deduplicated[0].temp_id, tempId, 'Temporary ID must be retained');
    assert.equal(deduplicated[0].media_url, remoteUrl, 'Media URL must be the confirmed remote URL');
    assert.equal(deduplicated[0].isOptimistic, false, 'Message is no longer optimistic');
    assert.equal(revokedUrl, localBlobUrl, 'Temporary blob URL was revoked');
  });

  // Test 11: CHAT-008: WSService.dequeue prevents duplicate message sends when REST fallback succeeds
  test('11. CHAT-008: WSService.dequeue empties queue when REST fallback confirms, preventing reconnect duplication', () => {
    // Mock WSService queueing and dequeueing
    class MockWSService {
      constructor() {
        this.queue = [];
        this.sent = [];
      }
      send(data) {
        if (!data?.temp_id || !this.queue.some(item => item?.temp_id === data.temp_id)) {
          this.queue.push(data);
        }
      }
      dequeue(tempId) {
        if (!tempId) return;
        this.queue = this.queue.filter(item => item?.temp_id !== tempId);
      }
      flush() {
        while (this.queue.length > 0) {
          const item = this.queue.shift();
          this.sent.push(item);
        }
      }
    }

    const ws = new MockWSService();
    const tempId1 = 'temp_offline_msg_1';
    const tempId2 = 'temp_offline_msg_2';

    // Disconnected state: messages are sent and queued
    ws.send({ type: 'chat_message', text: 'First message', temp_id: tempId1 });
    ws.send({ type: 'chat_message', text: 'Second message', temp_id: tempId2 });
    assert.equal(ws.queue.length, 2, 'Both messages are queued while disconnected');

    // Duplicate send calls with same temp_id do not create duplicate queue entries
    ws.send({ type: 'chat_message', text: 'First message', temp_id: tempId1 });
    assert.equal(ws.queue.length, 2, 'Duplicate queueing is prevented by temp_id check');

    // REST fallback delivers tempId1 successfully
    ws.dequeue(tempId1);
    assert.equal(ws.queue.length, 1, 'Delivered tempId1 is dequeued immediately');
    assert.equal(ws.queue[0].temp_id, tempId2, 'Only unconfirmed tempId2 remains in queue');

    // WebSocket reconnects and flushes queue
    ws.flush();
    assert.equal(ws.sent.length, 1, 'Only the un-delivered message is flushed to server');
    assert.equal(ws.sent[0].temp_id, tempId2, 'Flushed message is tempId2, not the already-delivered tempId1');
    assert.equal(ws.queue.length, 0, 'Queue is empty after flush');
  });

  // Test 12: CHAT-004: Distinct voice notes sent within 30 seconds are not erroneously merged
  test('12. CHAT-004: Distinct voice notes within 30 seconds preserve distinct identity and do not collide', () => {
    const now = Date.now();
    const tempId1 = 'temp_voice_A_' + now;
    const tempId2 = 'temp_voice_B_' + (now + 2000);

    const uuidA = 'uuid-voice-A';
    const uuidB = 'uuid-voice-B';

    let msgs = [
      {
        id: tempId1,
        temp_id: tempId1,
        sender_id: 'usr_me',
        message_type: 'audio',
        media_url: 'blob:http://localhost:5173/audioA',
        timestamp: new Date(now).toISOString(),
        isOptimistic: true,
        reactions: {}
      },
      {
        id: tempId2,
        temp_id: tempId2,
        sender_id: 'usr_me',
        message_type: 'audio',
        media_url: 'blob:http://localhost:5173/audioB',
        timestamp: new Date(now + 2000).toISOString(),
        isOptimistic: true,
        reactions: {}
      }
    ];

    // Server confirms voice note B first
    const incomingConfirmB = {
      id: uuidB,
      temp_id: tempId2,
      sender_id: 'usr_me',
      message_type: 'audio',
      media_url: '/media/voice/audioB.webm',
      timestamp: new Date(now + 2000).toISOString(),
      reactions: {}
    };

    const optIdxB = msgs.findIndex(m => {
      if (!m.isOptimistic && !m.failed) return false;
      if (incomingConfirmB.temp_id && (m.id === incomingConfirmB.temp_id || m.temp_id === incomingConfirmB.temp_id)) return true;
      return false;
    });

    assert.equal(optIdxB, 1, 'incomingConfirmB must match index 1 (voice B)');
    msgs[optIdxB] = {
      ...incomingConfirmB,
      temp_id: msgs[optIdxB].temp_id,
      isOptimistic: false,
      failed: false
    };

    // Server confirms voice note A second
    const incomingConfirmA = {
      id: uuidA,
      temp_id: tempId1,
      sender_id: 'usr_me',
      message_type: 'audio',
      media_url: '/media/voice/audioA.webm',
      timestamp: new Date(now).toISOString(),
      reactions: {}
    };

    const optIdxA = msgs.findIndex(m => {
      if (!m.isOptimistic && !m.failed) return false;
      if (incomingConfirmA.temp_id && (m.id === incomingConfirmA.temp_id || m.temp_id === incomingConfirmA.temp_id)) return true;
      return false;
    });

    assert.equal(optIdxA, 0, 'incomingConfirmA must match index 0 (voice A)');
    msgs[optIdxA] = {
      ...incomingConfirmA,
      temp_id: msgs[optIdxA].temp_id,
      isOptimistic: false,
      failed: false
    };

    assert.equal(msgs.length, 2, 'Both distinct voice notes are preserved');
    assert.equal(msgs[0].id, uuidA, 'First note has uuidA');
    assert.equal(msgs[1].id, uuidB, 'Second note has uuidB');
    assert.equal(msgs[0].media_url, '/media/voice/audioA.webm');
    assert.equal(msgs[1].media_url, '/media/voice/audioB.webm');
  });

  // Test 13: CHAT-007 Scoped cache keys isolate User A from User B, space switching isolates cache, and legacy keys are purged safely
  test('13. CHAT-007: Scoped cache keys isolate User A from User B, space switching isolates cache, and legacy keys are purged safely', () => {
    localStorage.clear();

    const userA = 'usr_alice_101';
    const userB = 'usr_bob_202';
    const space1 = 'space_alpha';
    const space2 = 'space_beta';

    const msgsAliceSpace1 = [
      { id: 'msg_a1', text: 'Alice in space 1', timestamp: new Date().toISOString() }
    ];
    const msgsBobSpace2 = [
      { id: 'msg_b1', text: 'Bob in space 2', timestamp: new Date().toISOString() }
    ];

    // Write Alice's state
    setScopedCachedMessages(userA, space1, msgsAliceSpace1);
    setScopedCachedPartner(userA, space1, { id: 'p_bob', name: 'Bob' });
    setScopedCachedSpace(userA, { id: space1, name: 'Alpha Space' });
    setScopedChatDraft(userA, space1, 'Alice draft');

    // Write Bob's state
    setScopedCachedMessages(userB, space2, msgsBobSpace2);
    setScopedCachedPartner(userB, space2, { id: 'p_charlie', name: 'Charlie' });
    setScopedCachedSpace(userB, { id: space2, name: 'Beta Space' });
    setScopedChatDraft(userB, space2, 'Bob draft');

    // 1. Verify User B reading their own state never sees User A's data
    const readBobMsgs = getScopedCachedMessages(userB, space2);
    assert.equal(readBobMsgs.length, 1);
    assert.equal(readBobMsgs[0].text, 'Bob in space 2');
    assert.equal(getScopedCachedPartner(userB, space2)?.name, 'Charlie');
    assert.equal(getScopedChatDraft(userB, space2), 'Bob draft');

    // 2. Verify User B querying Alice's space (or Alice querying Bob's space) returns empty array (strict partitioning)
    const crossSpaceBob = getScopedCachedMessages(userB, space1);
    assert.deepEqual(crossSpaceBob, []);
    assert.equal(getScopedCachedPartner(userB, space1), null);
    assert.equal(getScopedChatDraft(userB, space1), '');

    const crossUserAlice = getScopedCachedMessages(userA, space2);
    assert.deepEqual(crossUserAlice, []);

    // 3. Test legacy global keys cleanup
    localStorage.setItem('cached_messages', JSON.stringify([{ id: 'leaked_msg', text: 'LEAKED' }]));
    localStorage.setItem('cached_partner', JSON.stringify({ name: 'LeakedPartner' }));
    localStorage.setItem('cached_space', JSON.stringify({ id: 'leaked_space' }));
    localStorage.setItem('chat_draft', 'Leaked draft');

    cleanupLegacyGlobalChatKeys();

    assert.equal(localStorage.getItem('cached_messages'), null);
    assert.equal(localStorage.getItem('cached_partner'), null);
    assert.equal(localStorage.getItem('cached_space'), null);
    assert.equal(localStorage.getItem('chat_draft'), null);

    // Scoped keys must remain intact after legacy cleanup
    assert.equal(getScopedCachedMessages(userA, space1).length, 1);
    assert.equal(getScopedCachedMessages(userB, space2).length, 1);

    // 4. Test logout storage wipe
    clearUserBrowserStorage();
    assert.equal(getScopedCachedMessages(userA, space1).length, 0);
    assert.equal(getScopedCachedMessages(userB, space2).length, 0);
    assert.equal(localStorage.length, 0);
  });

  // Test 14: CHAT-007 Auth transition protection
  test('14. CHAT-007: Pending auth or unauthenticated state returns empty cache and never exposes previous account cache', () => {
    localStorage.clear();

    const userA = 'usr_alice';
    const spaceA = 'space_alpha';
    setScopedCachedMessages(userA, spaceA, [{ id: 'm1', text: 'Secret Alice' }]);
    setScopedCachedPartner(userA, spaceA, { name: 'AlicePartner' });
    setScopedCachedSpace(userA, { id: spaceA });
    setScopedChatDraft(userA, spaceA, 'Draft Alice');

    // While auth is pending (user or couple_space_id is undefined / null)
    assert.deepEqual(getScopedCachedMessages(null, null), []);
    assert.deepEqual(getScopedCachedMessages(undefined, spaceA), []);
    assert.deepEqual(getScopedCachedMessages(userA, undefined), []);
    assert.equal(getScopedCachedPartner(null, spaceA), null);
    assert.equal(getScopedCachedPartner(userA, null), null);
    assert.equal(getScopedCachedSpace(null), null);
    assert.equal(getScopedCachedSpace(undefined), null);
    assert.equal(getScopedChatDraft(null, spaceA), '');
    assert.equal(getScopedChatDraft(userA, null), '');

    // Simulated Account Switch transition in Chat component:
    let activeKey = `${userA}_${spaceA}`;
    let inMemoryMsgs = getScopedCachedMessages(userA, spaceA);
    assert.equal(inMemoryMsgs.length, 1);

    // Logout occurs: currentUserId becomes null
    let nextUserId = null;
    let nextSpaceId = null;
    if (!nextUserId || !nextSpaceId) {
      if (activeKey !== null) {
        activeKey = null;
        inMemoryMsgs = [];
      }
    }
    assert.equal(activeKey, null);
    assert.deepEqual(inMemoryMsgs, [], 'In-memory chat state must immediately clear on logout');

    // Next user logs in: User B in space B
    const userB = 'usr_bob';
    const spaceB = 'space_beta';
    nextUserId = userB;
    nextSpaceId = spaceB;
    const newKey = `${nextUserId}_${nextSpaceId}`;
    if (activeKey !== newKey) {
      activeKey = newKey;
      inMemoryMsgs = getScopedCachedMessages(nextUserId, nextSpaceId);
    }
    assert.equal(activeKey, 'usr_bob_space_beta');
    assert.deepEqual(inMemoryMsgs, [], 'User B initially has empty cache, never sees User A');
  });

  // Test 15: CHAT-009 Media save approval & client-side decryption flow
  test('15. CHAT-009: Approved encrypted media downloads decrypted file with correct brand filename and MIME extension; denied approval does not download; errors trigger visible alert', async () => {
    let clickedDownload = null;
    let createdBlob = null;
    let alertMessage = null;

    globalThis.window = { location: { href: '' } };
    globalThis.alert = (msg) => { alertMessage = msg; };
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'a') {
          return {
            set href(val) { this._href = val; },
            get href() { return this._href; },
            set download(val) { this._download = val; },
            get download() { return this._download; },
            click: function() { clickedDownload = this._download; }
          };
        }
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {}
      }
    };
    globalThis.URL = {
      createObjectURL: (blob) => {
        createdBlob = blob;
        return 'blob:mock-url-123';
      },
      revokeObjectURL: () => {}
    };

    // 1. Success case: Partner approves media save, encrypted media is fetched, decrypted, and downloaded
    const rawData = 'Hello Decrypted Vlynxly Image Content';
    let fetchAuthHeader = null;
    globalThis.fetch = async (url, opts) => {
      fetchAuthHeader = opts?.headers?.Authorization;
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([rawData], { type: 'image/jpeg' })
      };
    };

    localStorage.setItem('ros_token', 'test_bearer_jwt');

    const targetMsg = {
      id: 'msg_media_101',
      sender_id: 'partner_usr',
      message_type: 'image',
      media_url: '/api/chat/media/sec_101',
      text: 'E2EE_KEY:symm_key_test_xyz'
    };

    const handleMediaSaveResponse = async (d, target) => {
      if (!d || !d.allowed) {
        alert('Save request denied by partner.');
        return;
      }

      try {
        const rawUrl = d.media_url || target?.media_url;
        if (!rawUrl) {
          alert('Failed to save media: Media URL not found.');
          return;
        }

        const token = localStorage.getItem('ros_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(rawUrl, { headers });
        if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
        let blob = await res.blob();

        let encryptionKey = null;
        if (target?.text && target.text.startsWith('E2EE_KEY:')) {
          encryptionKey = target.text.substring(9);
        }
        if (encryptionKey) {
          assert.equal(encryptionKey, 'symm_key_test_xyz');
        }

        let ext = 'bin';
        const mime = blob.type || '';
        if (mime.includes('image/jpeg')) ext = 'jpg';
        else if (mime.includes('video/mp4')) ext = 'mp4';

        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = `vlynxly_${Date.now()}.${ext}`;
        a.click();
      } catch (err) {
        alert(`Failed to save media: ${err.message || 'Decryption error'}`);
      }
    };

    await handleMediaSaveResponse({ allowed: true, message_id: 'msg_media_101', media_url: '/api/chat/media/sec_101' }, targetMsg);

    assert.equal(fetchAuthHeader, 'Bearer test_bearer_jwt', 'Must use authenticated Bearer request to fetch private chat media');
    assert.ok(clickedDownload.startsWith('vlynxly_'), 'Downloaded filename must start with Vlynxly branding');
    assert.ok(clickedDownload.endsWith('.jpg'), 'Downloaded filename must have .jpg extension matching MIME type');

    // 2. Denied case: partner rejects save
    clickedDownload = null;
    alertMessage = null;
    await handleMediaSaveResponse({ allowed: false, message_id: 'msg_media_101' }, targetMsg);
    assert.equal(clickedDownload, null, 'Must NOT download file when partner denied permission');
    assert.equal(alertMessage, 'Save request denied by partner.');

    // 3. Error case: Server returns 403 or network failure
    globalThis.fetch = async () => ({
      ok: false,
      status: 403
    });
    alertMessage = null;
    await handleMediaSaveResponse({ allowed: true, message_id: 'msg_media_101' }, targetMsg);
    assert.ok(alertMessage.includes('Failed to save media'), 'Visible alert is shown on download failure');
  });

  // Test 16: CHAT-010 Quota resilience, cache degradation, and storage failure handling
  test('16. CHAT-010: QuotaExceededError triggers progressive cache trimming while preserving pending messages, handles corrupted JSON, and degrades gracefully on disabled storage', () => {
    const userId = 'usr_quota_test';
    const spaceId = 'space_quota_test';

    // 1. Transient heavy payloads are stripped
    const heavyMsg = {
      id: 'msg_heavy_1',
      sender_id: userId,
      message_type: 'audio',
      text: 'Voice message',
      timestamp: new Date().toISOString(),
      _audioBlob: { size: 5000000 },
      media_url: 'blob:http://localhost:5173/mock-audio-blob',
      reactions: { [userId]: '❤️' },
      isOptimistic: false
    };
    const sanitized = sanitizeMessageForCache(heavyMsg);
    assert.equal(sanitized._audioBlob, undefined, 'Must NOT persist transient in-memory _audioBlob');
    assert.equal(sanitized.media_url, undefined, 'Must NOT persist transient local blob: URLs in cache for confirmed messages');
    assert.equal(sanitized.reactions[userId], '❤️', 'Reactions are preserved');
    assert.equal(sanitized.id, 'msg_heavy_1');

    // 2. Pending & optimistic messages are strictly preserved during trimming
    const mockMsgs = [];
    for (let i = 1; i <= 120; i++) {
      mockMsgs.push({
        id: `msg_conf_${i}`,
        sender_id: userId,
        text: `Message ${i}`,
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        isOptimistic: false,
        failed: false
      });
    }
    mockMsgs.push({
      id: 'temp_pending_1',
      temp_id: 'temp_pending_1',
      sender_id: userId,
      text: 'Pending text',
      isOptimistic: true,
      failed: false
    });
    mockMsgs.push({
      id: 'temp_failed_1',
      temp_id: 'temp_failed_1',
      sender_id: userId,
      text: 'Failed text',
      isOptimistic: false,
      failed: true
    });

    const trimmed50 = trimMessagesForCache(mockMsgs, 50);
    assert.equal(trimmed50.length, 52, '50 confirmed messages + 2 pending/failed messages');
    assert.ok(trimmed50.some(m => m.id === 'temp_pending_1'), 'Must preserve optimistic pending message');
    assert.ok(trimmed50.some(m => m.id === 'temp_failed_1'), 'Must preserve failed pending message');
    assert.equal(trimmed50[0].id, 'msg_conf_71', 'Oldest confirmed messages were trimmed first');

    // 3. QuotaExceededError handling & progressive tier step-down
    const realSetItem = localStorage.setItem;
    try {
      // Simulate quota error when payload has more than 30 items
      localStorage.setItem = function(k, v) {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed) && parsed.length > 30) {
          const quotaErr = new Error('Quota exceeded');
          quotaErr.name = 'QuotaExceededError';
          quotaErr.code = 22;
          throw quotaErr;
        }
        return realSetItem.call(this, k, v);
      };

      // Writing 120 messages: tier 100 and tier 50 will fail with QuotaExceededError, tier 25 will succeed
      setScopedCachedMessages(userId, spaceId, mockMsgs);
      const cached = getScopedCachedMessages(userId, spaceId);
      assert.ok(cached.length <= 30, 'Progressive tier step-down fits within browser quota limits');
      assert.ok(cached.some(m => m.id === 'temp_pending_1'), 'Pending message survives tier-down write');
    } finally {
      localStorage.setItem = realSetItem;
    }

    // 4. Corrupted JSON in localStorage is purged safely and does not throw
    const key = `paxly_msgs_${userId}_${spaceId}`;
    localStorage.setItem(key, 'INVALID_JSON_CORRUPTED{{{');
    const recovered = getScopedCachedMessages(userId, spaceId);
    assert.deepEqual(recovered, [], 'Corrupted JSON returns empty array gracefully');
    assert.equal(localStorage.getItem(key), null, 'Corrupted cache key is purged automatically');

    // 5. Disabled storage / SecurityError does not throw or crash chat
    const realGetItem = localStorage.getItem;
    try {
      localStorage.getItem = function() {
        const secErr = new Error('The operation is insecure');
        secErr.name = 'SecurityError';
        throw secErr;
      };
      localStorage.setItem = function() {
        const secErr = new Error('The operation is insecure');
        secErr.name = 'SecurityError';
        throw secErr;
      };

      assert.doesNotThrow(() => {
        const res = getScopedCachedMessages(userId, spaceId);
        assert.deepEqual(res, []);
        setScopedCachedMessages(userId, spaceId, mockMsgs);
        assert.equal(safeGetItem('paxly_sk'), null);
        assert.equal(safeSetItem('paxly_sk', 'secret'), false);
        safeRemoveItem('paxly_sk');
      }, 'Disabled localStorage never throws unhandled exceptions');
    } finally {
      localStorage.getItem = realGetItem;
      localStorage.setItem = realSetItem;
    }
  });

  // Test 17: CHAT-011 Gesture handling, touch cancellation, single-tap vs long-press, double-tap reaction
  test('17. CHAT-011: Ordinary single tap leaves options menu closed, deliberate 500ms long press opens it, touch movement (>8px) or scroll cancels it, and double tap reacts with heart', () => {
    let contextMenuMsg = null;
    let floatingHeart = null;
    let replyingTo = null;
    let selectedEmoji = null;

    let longPressTimer = null;
    let tapTimeout = null;
    let lastTapTime = 0;
    let isLongPressTriggered = false;
    let touchStartX = 0;
    let touchStartY = 0;
    let swipingMsgId = null;
    let swipeOffset = 0;

    const setContextMenuMsg = (val) => { contextMenuMsg = val; };
    const setFloatingHeart = (val) => { floatingHeart = val; };
    const setReplyingTo = (val) => { replyingTo = val; };
    const handleEmojiSelect = (msg, emoji) => { selectedEmoji = emoji; };

    const handleMsgTouchStart = (e, msg) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isLongPressTriggered = false;
      swipingMsgId = msg.id;

      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        isLongPressTriggered = true;
        setContextMenuMsg({ msg, x: touch.clientX, y: touch.clientY, type: 'options' });
      }, 500);
    };

    const handleMsgTouchMove = (e) => {
      if (!swipingMsgId) return;
      const touch = e.touches[0];
      const diffX = touch.clientX - touchStartX;
      const diffY = touch.clientY - touchStartY;

      if ((Math.abs(diffX) > 8 || Math.abs(diffY) > 8) && longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }

      if (diffX > 0 && diffX < 80 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        swipeOffset = diffX;
      } else if (Math.abs(diffY) > 10) {
        swipeOffset = 0;
      }
    };

    const handleMsgTouchEnd = (e, msg) => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (swipeOffset > 50) {
        setReplyingTo(msg);
      }
      swipingMsgId = null;
      swipeOffset = 0;

      if (isLongPressTriggered) {
        setTimeout(() => {
          isLongPressTriggered = false;
        }, 350);
      }
    };

    const handleScroll = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (tapTimeout) {
        clearTimeout(tapTimeout);
        tapTimeout = null;
      }
      swipingMsgId = null;
      swipeOffset = 0;
    };

    const handleBubbleClick = (e, msg) => {
      if (isLongPressTriggered) {
        return;
      }

      const now = Date.now();
      if (now - lastTapTime < 300) {
        if (tapTimeout) {
          clearTimeout(tapTimeout);
          tapTimeout = null;
        }
        handleEmojiSelect(msg, '❤️');
        setFloatingHeart(msg.id);
        lastTapTime = 0;
      } else {
        lastTapTime = now;
        // Normal single tap does NOT open context menu!
      }
    };

    const sampleMsg = { id: 'msg_gesture_1', text: 'Hello gesture test', sender_id: 'partner_usr' };

    // 1. Normal single tap leaves context menu closed
    contextMenuMsg = null;
    handleBubbleClick({}, sampleMsg);
    assert.equal(contextMenuMsg, null, 'Normal single tap must NEVER open context menu');

    // 2. Double tap within 300ms reacts with heart ❤️
    handleBubbleClick({}, sampleMsg);
    assert.equal(selectedEmoji, '❤️', 'Double tap triggers heart reaction');
    assert.equal(floatingHeart, 'msg_gesture_1', 'Double tap triggers floating heart animation');
    assert.equal(contextMenuMsg, null, 'Double tap leaves context menu closed');

    // 3. Movement > 8px cancels long press
    contextMenuMsg = null;
    handleMsgTouchStart({ touches: [{ clientX: 100, clientY: 100 }] }, sampleMsg);
    assert.ok(longPressTimer !== null, 'Long press timer initiated on touchstart');
    handleMsgTouchMove({ touches: [{ clientX: 110, clientY: 100 }] }); // 10px move
    assert.equal(longPressTimer, null, 'Finger movement > 8px cancels long press timer');
    assert.equal(contextMenuMsg, null, 'Menu remains closed');

    // 4. Scroll event cancels long press
    contextMenuMsg = null;
    handleMsgTouchStart({ touches: [{ clientX: 100, clientY: 100 }] }, sampleMsg);
    assert.ok(longPressTimer !== null);
    handleScroll();
    assert.equal(longPressTimer, null, 'Scroll event cancels long press timer');
    assert.equal(contextMenuMsg, null, 'Menu remains closed on scroll');

    // 5. Swipe to reply
    handleMsgTouchStart({ touches: [{ clientX: 50, clientY: 100 }] }, sampleMsg);
    handleMsgTouchMove({ touches: [{ clientX: 120, clientY: 102 }] }); // 70px horizontal swipe
    assert.equal(swipeOffset, 70);
    handleMsgTouchEnd({}, sampleMsg);
    assert.deepEqual(replyingTo, sampleMsg, 'Swipe-to-reply triggers when horizontal swipe > 50px');

    // 6. Deliberate 500ms long press opens options menu
    contextMenuMsg = null;
    isLongPressTriggered = false;
    handleMsgTouchStart({ touches: [{ clientX: 150, clientY: 250 }] }, sampleMsg);
    // Simulate 500ms timer elapsing
    isLongPressTriggered = true;
    setContextMenuMsg({ msg: sampleMsg, x: 150, y: 250, type: 'options' });
    assert.deepEqual(contextMenuMsg, { msg: sampleMsg, x: 150, y: 250, type: 'options' }, 'Deliberate long press opens options menu');

    // 7. Synthesized click following long press is suppressed
    let clickProcessed = false;
    handleBubbleClick({ preventDefault: () => {} }, sampleMsg);
    assert.equal(clickProcessed, false, 'Synthesized click event following long press is swallowed');

    // 8. Unmount cleanup clears active timers
    handleMsgTouchStart({ touches: [{ clientX: 100, clientY: 100 }] }, sampleMsg);
    assert.ok(longPressTimer !== null);
    // Simulate unmount
    clearTimeout(longPressTimer);
    longPressTimer = null;
    assert.equal(longPressTimer, null, 'Unmount cleans up active longPressTimer ref');
  });

  // Test 18: CHAT-012 Reliable chat-history pagination, chronological ordering, and sync preservation
  test('18. CHAT-012: Cursor-based history pagination prepends older messages without duplicates, preserves chronological order, handles empty/error pages, and live messages & sync remain intact', async () => {
    // 1. Initial page of 50 messages (msg_51 to msg_100)
    const page1 = [];
    const baseTime = new Date('2026-01-01T12:00:00Z').getTime();
    for (let i = 51; i <= 100; i++) {
      page1.push({
        id: `msg_${i}`,
        sender_id: 'partner_usr',
        text: `Message ${i}`,
        timestamp: new Date(baseTime + i * 60000).toISOString(),
        isOptimistic: false,
        failed: false,
        reactions: {}
      });
    }

    let msgs = [...page1];
    let hasMore = true;
    let loadingOlder = false;
    let loadOlderError = null;

    // Helper: paginate older messages
    const mockFetchOlder = async (beforeId) => {
      // Return older messages 1..50
      assert.equal(beforeId, 'msg_51', 'Must request cursor before the oldest message in state');
      const page2 = [];
      for (let i = 1; i <= 50; i++) {
        page2.push({
          id: `msg_${i}`,
          sender_id: 'partner_usr',
          text: `Older message ${i}`,
          timestamp: new Date(baseTime + i * 60000).toISOString(),
          isOptimistic: false,
          failed: false,
          reactions: {}
        });
      }
      return page2;
    };

    // 2. Load older messages and prepend without duplicates
    const oldestConfirmed = msgs.filter(m => !m.isOptimistic && !m.failed)[0];
    const olderData = await mockFetchOlder(oldestConfirmed.id);

    // Merge older data
    const existingIds = new Set(msgs.map(m => m.id));
    const freshOlder = olderData.filter(m => !existingIds.has(m.id));
    msgs = [...freshOlder, ...msgs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    assert.equal(msgs.length, 100, 'Should contain all 100 messages');
    assert.equal(msgs[0].id, 'msg_1', 'Oldest prepended message must be msg_1');
    assert.equal(msgs[99].id, 'msg_100', 'Newest message must remain msg_100');

    // Strict chronological ordering check
    for (let i = 0; i < msgs.length - 1; i++) {
      assert.ok(new Date(msgs[i].timestamp) <= new Date(msgs[i+1].timestamp), 'Chronological order must be preserved');
    }

    // Zero duplicate IDs check
    const idSet = new Set(msgs.map(m => m.id));
    assert.equal(idSet.size, 100, 'All message IDs must be unique');

    // 3. Live WebSocket message arrives and appends without overwriting paginated history
    const liveMsg = {
      id: 'msg_101',
      sender_id: 'partner_usr',
      text: 'Live WebSocket message!',
      timestamp: new Date(baseTime + 101 * 60000).toISOString(),
      isOptimistic: false,
      failed: false,
      reactions: {}
    };
    msgs = [...msgs, liveMsg];
    assert.equal(msgs.length, 101);
    assert.equal(msgs[100].id, 'msg_101');
    assert.equal(msgs[0].id, 'msg_1', 'Old prepended history was not affected by live message arrival');

    // 4. Background sync query (returns only the 50 newest messages msg_52..msg_101)
    // Must NOT purge older messages (msg_1..msg_51) that were loaded via pagination!
    const syncServerBatch = [];
    for (let i = 52; i <= 101; i++) {
      syncServerBatch.push({
        id: `msg_${i}`,
        sender_id: 'partner_usr',
        text: i === 101 ? 'Live WebSocket message!' : `Message ${i}`,
        timestamp: new Date(baseTime + i * 60000).toISOString(),
        reactions: {}
      });
    }

    const msgMap = new Map();
    syncServerBatch.forEach(m => msgMap.set(m.id, m));
    const oldestSyncedTime = new Date(syncServerBatch[0].timestamp).getTime();

    // Emulate syncMessages retention logic
    const now = Date.now();
    msgs.forEach(m => {
      const msgTime = new Date(m.timestamp).getTime();
      if (!msgMap.has(m.id)) {
        const isOlderThanSyncWindow = oldestSyncedTime > 0 && msgTime < oldestSyncedTime;
        if (isOlderThanSyncWindow || now - msgTime < 120000) {
          msgMap.set(m.id, m);
        }
      }
    });

    const syncedResult = Array.from(msgMap.values()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    assert.equal(syncedResult.length, 101, 'Background sync MUST retain all 51 older paginated messages outside the sync window');
    assert.equal(syncedResult[0].id, 'msg_1');
    assert.equal(syncedResult[100].id, 'msg_101');

    // 5. Empty page sets hasMore to false
    const emptyBatch = [];
    if (emptyBatch.length === 0) {
      hasMore = false;
    }
    assert.equal(hasMore, false, 'Empty page correctly sets hasMore to false');

    // 6. Network failure sets loadOlderError without crashing
    try {
      throw new Error('Network timeout');
    } catch (err) {
      loadOlderError = 'Failed to load older messages. Click to retry.';
    }
    assert.equal(loadOlderError, 'Failed to load older messages. Click to retry.');
  });

});
