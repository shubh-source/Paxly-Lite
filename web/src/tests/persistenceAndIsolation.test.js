import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Step 4 QA Test Suite:
 * - Settings Persistence: Save -> Reload -> Reset
 * - Single-thread and multi-thread deletion
 * - Two-account multi-tenant isolation:
 *    User A cannot see User B's settings or threads
 *    User A deleting threads only deletes User A's data
 *    User A modifying settings never alters User B's settings
 */

class MockDatabase {
  constructor() {
    this.users = new Map(); // id -> user object
    this.aiChatThreads = new Map(); // id -> thread object
  }

  addUser(id, name, auraSettings = {}) {
    const user = {
      id,
      name,
      aura_settings: { ...auraSettings },
      ai_personality: 'balanced',
      crisis_escalation_enabled: true
    };
    this.users.set(id, user);
    return user;
  }

  // GET /ai/settings
  getSettings(userId, defaultSettings) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    return { ...defaultSettings, ...(user.aura_settings || {}) };
  }

  // PUT /ai/settings
  updateSettings(userId, newSettings) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.aura_settings = { ...newSettings };
    if (newSettings.preset) user.ai_personality = newSettings.preset.toLowerCase();
    if (newSettings.escalationMode) user.crisis_escalation_enabled = (newSettings.escalationMode !== 'Off');
    return user.aura_settings;
  }

  // POST /ai/settings/reset
  resetSettings(userId, defaultSettings) {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.aura_settings = { ...defaultSettings };
    user.ai_personality = 'balanced';
    user.crisis_escalation_enabled = true;
    return defaultSettings;
  }

  // POST /ai/threads/sync
  syncThread(userId, threadId, title, messages) {
    const existing = this.aiChatThreads.get(threadId);
    if (existing && existing.user_id !== userId) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }
    const thread = { id: threadId, user_id: userId, title, messages, updated_at: Date.now() };
    this.aiChatThreads.set(threadId, thread);
    return { status: 'synced' };
  }

  // GET /ai/threads
  getThreads(userId) {
    const list = [];
    for (const thread of this.aiChatThreads.values()) {
      if (thread.user_id === userId) {
        list.push({ ...thread });
      }
    }
    return list.sort((a, b) => b.updated_at - a.updated_at);
  }

  // DELETE /ai/threads/:thread_id
  deleteThread(userId, threadId) {
    const thread = this.aiChatThreads.get(threadId);
    if (!thread || thread.user_id !== userId) {
      const err = new Error('Thread not found');
      err.statusCode = 404;
      throw err;
    }
    this.aiChatThreads.delete(threadId);
    return { status: 'deleted' };
  }

  // DELETE /ai/threads (delete all user threads)
  deleteAllThreads(userId) {
    let deletedCount = 0;
    for (const [id, thread] of Array.from(this.aiChatThreads.entries())) {
      if (thread.user_id === userId) {
        this.aiChatThreads.delete(id);
        deletedCount++;
      }
    }
    return { status: 'all_threads_deleted', count: deletedCount };
  }
}

const DEFAULT_SETTINGS = {
  defaultLanguage: 'Hinglish',
  defaultResponseLength: 'Balanced',
  preset: 'Balanced',
  customInstructions: '',
  warmth: 'High',
  formality: 'Casual',
  escalationMode: 'Suggest',
  modelProvider: 'Automatic',
  requestTimeoutSec: 30
};

test('Step 4: Persistence, Deletion & Two-Account Isolation API Test Suite', async (t) => {
  let db;

  t.beforeEach(() => {
    db = new MockDatabase();
    db.addUser('user_A', 'Shubh');
    db.addUser('user_B', 'Partner');
  });

  await t.test('1. Settings Save & Reload: User A updates settings and reloads persistently', async () => {
    const customConfig = {
      ...DEFAULT_SETTINGS,
      preset: 'Teacher',
      customInstructions: 'Speak concise Hindi',
      warmth: 'Medium',
      requestTimeoutSec: 60
    };

    // PUT /ai/settings
    const saved = db.updateSettings('user_A', customConfig);
    assert.equal(saved.preset, 'Teacher');
    assert.equal(saved.customInstructions, 'Speak concise Hindi');
    assert.equal(saved.requestTimeoutSec, 60);

    // GET /ai/settings (reload)
    const reloaded = db.getSettings('user_A', DEFAULT_SETTINGS);
    assert.equal(reloaded.preset, 'Teacher');
    assert.equal(reloaded.customInstructions, 'Speak concise Hindi');
    assert.equal(reloaded.requestTimeoutSec, 60);
  });

  await t.test('2. Settings Reset: Restores defaults cleanly', async () => {
    db.updateSettings('user_A', { ...DEFAULT_SETTINGS, preset: 'Technical', customInstructions: 'Testing reset' });
    assert.equal(db.getSettings('user_A', DEFAULT_SETTINGS).preset, 'Technical');

    // POST /ai/settings/reset
    const reset = db.resetSettings('user_A', DEFAULT_SETTINGS);
    assert.equal(reset.preset, 'Balanced');
    assert.equal(reset.customInstructions, '');

    const check = db.getSettings('user_A', DEFAULT_SETTINGS);
    assert.equal(check.preset, 'Balanced');
  });

  await t.test('3. Two-Account Settings Isolation: User A settings never leak into User B', async () => {
    // User A sets confidential personality instructions
    db.updateSettings('user_A', {
      ...DEFAULT_SETTINGS,
      preset: 'Minimal',
      customInstructions: 'Confidential notes: Anniversary surprise plan'
    });

    // User B sets different instructions
    db.updateSettings('user_B', {
      ...DEFAULT_SETTINGS,
      preset: 'Friendly',
      customInstructions: 'Public notes: Help with cooking'
    });

    const userASettings = db.getSettings('user_A', DEFAULT_SETTINGS);
    const userBSettings = db.getSettings('user_B', DEFAULT_SETTINGS);

    // Confirm completely isolated
    assert.equal(userASettings.customInstructions, 'Confidential notes: Anniversary surprise plan');
    assert.equal(userBSettings.customInstructions, 'Public notes: Help with cooking');
    assert.notEqual(userASettings.customInstructions, userBSettings.customInstructions);
  });

  await t.test('4. Chat Thread Sync & Deletion: Only owner can access and delete their threads', async () => {
    // User A syncs 2 threads
    db.syncThread('user_A', 'thread_a1', 'Trip planning', [{ role: 'user', content: 'Where to go?' }]);
    db.syncThread('user_A', 'thread_a2', 'Gift ideas', [{ role: 'user', content: 'Surprise gift' }]);

    // User B syncs 1 thread
    db.syncThread('user_B', 'thread_b1', 'Recipe search', [{ role: 'user', content: 'Pasta recipe' }]);

    // User A lists threads
    const aThreads = db.getThreads('user_A');
    assert.equal(aThreads.length, 2);
    assert.ok(aThreads.every(t => t.user_id === 'user_A'));

    // User B lists threads -> NEVER sees User A threads
    const bThreads = db.getThreads('user_B');
    assert.equal(bThreads.length, 1);
    assert.equal(bThreads[0].id, 'thread_b1');
    assert.equal(bThreads[0].title, 'Recipe search');

    // User B attempts to hijack or overwrite User A thread -> 403 Forbidden!
    assert.throws(
      () => db.syncThread('user_B', 'thread_a1', 'Malicious overwrite', []),
      (err) => err.statusCode === 403
    );

    // User B attempts to delete User A thread -> 404 Thread not found!
    assert.throws(
      () => db.deleteThread('user_B', 'thread_a1'),
      (err) => err.statusCode === 404
    );

    // User A deletes thread_a1
    const delRes = db.deleteThread('user_A', 'thread_a1');
    assert.equal(delRes.status, 'deleted');
    assert.equal(db.getThreads('user_A').length, 1);
    assert.equal(db.getThreads('user_B').length, 1); // User B unaffected
  });

  await t.test('5. Multi-Tenant Batch Delete: delete_all_threads affects ONLY the calling account', async () => {
    db.syncThread('user_A', 't1', 'A1', []);
    db.syncThread('user_A', 't2', 'A2', []);
    db.syncThread('user_B', 't3', 'B1', []);
    db.syncThread('user_B', 't4', 'B2', []);

    // User A calls DELETE /ai/threads
    const deleteBatch = db.deleteAllThreads('user_A');
    assert.equal(deleteBatch.status, 'all_threads_deleted');
    assert.equal(deleteBatch.count, 2);

    // User A has 0 threads
    assert.equal(db.getThreads('user_A').length, 0);

    // User B STILL HAS all 2 threads completely intact
    const bThreads = db.getThreads('user_B');
    assert.equal(bThreads.length, 2);
    assert.equal(bThreads[0].id, 't3');
    assert.equal(bThreads[1].id, 't4');
  });
});
