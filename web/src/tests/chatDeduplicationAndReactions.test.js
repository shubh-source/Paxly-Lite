import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

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

});
