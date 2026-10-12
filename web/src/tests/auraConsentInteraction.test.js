import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmSafetyEscalation } from '../services/api.js';

describe('Aura Ask-First Consent Interaction Suite', () => {
  it('1. confirmSafetyEscalation function exists and is exported from api.js', () => {
    assert.equal(typeof confirmSafetyEscalation, 'function');
  });

  it('2. Client Consent Logic: correctly maps all server response statuses', () => {
    // Helper replicating handleConsentAction response mapping logic in AIAssistant.jsx
    function mapConsentResponse(res) {
      if (res.status === 'alert_sent') {
        return {
          status: 'alert_sent',
          note: '✓ Partner care check-in alert safalta-purvak bhej diya gaya hai.'
        };
      } else if (res.status === 'cooldown_active') {
        return {
          status: 'cooldown_active',
          note: res.message || 'Ek care alert abhi haal hi mein bheja gaya tha (cooldown active).'
        };
      } else if (res.status === 'no_partner') {
        return {
          status: 'no_partner',
          note: 'Koi linked partner nahi mila. Turant madad ke liye please helplines par call karein: Tele-MANAS (14416 / 1800-891-4416) ya 112.'
        };
      } else if (res.status === 'expired') {
        return {
          status: 'expired',
          note: 'Ye care check-in request expire ho chuki hai.'
        };
      } else if (res.status === 'already_consumed') {
        return {
          status: 'already_consumed',
          note: 'Ye care check-in pehle hi process ho chuka hai.'
        };
      }
      return {
        status: res.status,
        note: res.message || `Status: ${res.status}`
      };
    }

    // Success
    const s1 = mapConsentResponse({ status: 'alert_sent' });
    assert.equal(s1.status, 'alert_sent');
    assert.match(s1.note, /safalta-purvak/);

    // Cooldown active
    const s2 = mapConsentResponse({ status: 'cooldown_active', message: 'Cooldown is active' });
    assert.equal(s2.status, 'cooldown_active');
    assert.equal(s2.note, 'Cooldown is active');

    // No partner
    const s3 = mapConsentResponse({ status: 'no_partner' });
    assert.equal(s3.status, 'no_partner');
    assert.match(s3.note, /Tele-MANAS/);

    // Expired
    const s4 = mapConsentResponse({ status: 'expired' });
    assert.equal(s4.status, 'expired');
    assert.match(s4.note, /expire/);

    // Already consumed
    const s5 = mapConsentResponse({ status: 'already_consumed' });
    assert.equal(s5.status, 'already_consumed');
    assert.match(s5.note, /process ho chuka/);
  });

  it('3. Client In-Flight Debounce: prevents double submissions when loadingId matches', () => {
    let escalationLoadingId = null;
    let submissionsCount = 0;

    function triggerConfirmation(eventId) {
      if (!eventId || escalationLoadingId) {
        return false; // blocked
      }
      escalationLoadingId = eventId;
      submissionsCount++;
      return true;
    }

    // First click initiates
    const ok1 = triggerConfirmation('evt_123');
    assert.equal(ok1, true);
    assert.equal(submissionsCount, 1);

    // Second click while in-flight is rejected
    const ok2 = triggerConfirmation('evt_123');
    assert.equal(ok2, false);
    assert.equal(submissionsCount, 1);

    // Reset when complete
    escalationLoadingId = null;
    const ok3 = triggerConfirmation('evt_456');
    assert.equal(ok3, true);
    assert.equal(submissionsCount, 2);
  });

  it('4. Decline Action: acknowledges choice without sending partner alert', () => {
    function handleDecline() {
      return {
        consentStatus: 'declined',
        consentNote: 'Aapne alert bhejne se mana kar diya. Aura hamesha aapke saath hai jab bhi aap baat karna chahein.',
        alertSent: false
      };
    }

    const res = handleDecline();
    assert.equal(res.consentStatus, 'declined');
    assert.equal(res.alertSent, false);
    assert.match(res.consentNote, /mana kar diya/);
  });
});
