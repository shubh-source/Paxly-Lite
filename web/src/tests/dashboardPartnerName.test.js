import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getScopedCachedPartner, setScopedCachedPartner } from '../services/chatCache.js';

describe('Dashboard & Mood Sync Partner Dynamic Name Resolution Suite', () => {
  // Mock localStorage for test environment
  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (i) => Array.from(store.keys())[i] || null
    };
  }

  function resolvePartnerDisplayName(partner, moods) {
    const partnerRawName = (partner?.name && partner.name.toLowerCase() !== 'partner')
      ? partner.name
      : (moods?.partner_mood?.user_name && moods.partner_mood.user_name !== 'Unknown' && moods.partner_mood.user_name.toLowerCase() !== 'partner'
        ? moods.partner_mood.user_name
        : null);

    return partnerRawName
      ? partnerRawName.trim().split(' ')[0].toUpperCase()
      : 'PARTNER';
  }

  test('1. Resolves partner name "Ud" dynamically to "UD" for Sneha', () => {
    const partner = { id: 'u_ud', name: 'Ud' };
    const moods = null;
    assert.equal(resolvePartnerDisplayName(partner, moods), 'UD');
  });

  test('2. Resolves partner full name "Ud Sharma" dynamically to first name "UD"', () => {
    const partner = { id: 'u_ud', name: 'Ud Sharma' };
    const moods = null;
    assert.equal(resolvePartnerDisplayName(partner, moods), 'UD');
  });

  test('3. Resolves partner lowercase name "ud" to uppercase "UD"', () => {
    const partner = { id: 'u_ud', name: 'ud' };
    const moods = null;
    assert.equal(resolvePartnerDisplayName(partner, moods), 'UD');
  });

  test('4. Works dynamically for other couples (e.g. Shubh, Rahul, Priya, Alex)', () => {
    assert.equal(resolvePartnerDisplayName({ name: 'Shubh' }, null), 'SHUBH');
    assert.equal(resolvePartnerDisplayName({ name: 'Rahul Verma' }, null), 'RAHUL');
    assert.equal(resolvePartnerDisplayName({ name: 'priya' }, null), 'PRIYA');
    assert.equal(resolvePartnerDisplayName({ name: 'Alex' }, null), 'ALEX');
  });

  test('5. Falls back to partner_mood user_name when partner profile is pending or generic', () => {
    const partner = { name: 'Partner' };
    const moods = { partner_mood: { user_name: 'Ud', emoji: '😊' } };
    assert.equal(resolvePartnerDisplayName(partner, moods), 'UD');

    const noPartner = null;
    assert.equal(resolvePartnerDisplayName(noPartner, moods), 'UD');
  });

  test('6. Gracefully falls back to "PARTNER" when user is uncoupled and no partner exists', () => {
    assert.equal(resolvePartnerDisplayName(null, null), 'PARTNER');
    assert.equal(resolvePartnerDisplayName({ name: 'Partner' }, null), 'PARTNER');
    assert.equal(resolvePartnerDisplayName(null, { partner_mood: { user_name: 'Unknown' } }), 'PARTNER');
  });

  test('7. Scoped partner cache roundtrip preserves partner name across sessions', () => {
    const userId = 'usr_sneha';
    const spaceId = 'space_sneha_ud';
    setScopedCachedPartner(userId, spaceId, { id: 'usr_ud', name: 'Ud' });

    const cached = getScopedCachedPartner(userId, spaceId);
    assert.ok(cached);
    assert.equal(cached.name, 'Ud');
    assert.equal(resolvePartnerDisplayName(cached, null), 'UD');
  });
});
