import test from 'node:test';
import assert from 'node:assert/strict';

// Simulated provider client with fallback and redaction logic identical to backend/app/api/routes/ai.py
class MockAIProviderRouter {
  constructor(config = {}) {
    this.primaryProvider = config.primaryProvider || 'groq';
    this.groqKey = config.groqKey || 'gsk_test_secret_key_12345';
    this.geminiKey = config.geminiKey || 'AIzaSy_test_secret_key_67890';
    this.failGroq = config.failGroq || false;
    this.failGemini = config.failGemini || false;
    this.timeoutGroq = config.timeoutGroq || false;
  }

  async callGroq(prompt) {
    if (this.timeoutGroq) {
      throw new Error(`Groq request timed out after 10000ms. Authorization: Bearer ${this.groqKey}`);
    }
    if (this.failGroq) {
      throw new Error(`Groq 429 Rate limit exceeded. Key: ${this.groqKey}`);
    }
    return { provider: 'groq', text: `Groq response to: ${prompt}` };
  }

  async callGemini(prompt) {
    if (this.failGemini) {
      throw new Error(`Gemini 500 Internal error. Key: ${this.geminiKey}`);
    }
    return { provider: 'gemini', text: `Gemini response to: ${prompt}` };
  }

  sanitizeError(errMessage) {
    // Redact API keys from logs and client error responses
    return errMessage
      .replace(new RegExp(this.groqKey, 'g'), '[REDACTED_GROQ_KEY]')
      .replace(new RegExp(this.geminiKey, 'g'), '[REDACTED_GEMINI_KEY]');
  }

  async route(prompt) {
    const isGroqPrimary = this.primaryProvider === 'groq';

    if (isGroqPrimary) {
      try {
        return await this.callGroq(prompt);
      } catch (err) {
        const maskedPrimaryErr = this.sanitizeError(err.message);
        // Fallback to Gemini
        try {
          const fallbackRes = await this.callGemini(prompt);
          return {
            ...fallbackRes,
            fallbackUsed: true,
            primaryError: maskedPrimaryErr
          };
        } catch (fallbackErr) {
          throw new Error(`All providers failed. Primary: ${maskedPrimaryErr}, Fallback: ${this.sanitizeError(fallbackErr.message)}`);
        }
      }
    } else {
      // Gemini Primary
      try {
        return await this.callGemini(prompt);
      } catch (err) {
        const maskedPrimaryErr = this.sanitizeError(err.message);
        // Fallback to Groq
        try {
          const fallbackRes = await this.callGroq(prompt);
          return {
            ...fallbackRes,
            fallbackUsed: true,
            primaryError: maskedPrimaryErr
          };
        } catch (fallbackErr) {
          throw new Error(`All providers failed. Primary: ${maskedPrimaryErr}, Fallback: ${this.sanitizeError(fallbackErr.message)}`);
        }
      }
    }
  }
}

test('Aura Model Routing & Provider Fallback Suite', async (t) => {
  await t.test('should successfully use primary Groq when operational', async () => {
    const router = new MockAIProviderRouter({ primaryProvider: 'groq' });
    const res = await router.route('Hello Aura');
    assert.equal(res.provider, 'groq');
    assert.equal(res.fallbackUsed, undefined);
  });

  await t.test('should gracefully fallback from Groq to Gemini when Groq rate-limits or fails', async () => {
    const router = new MockAIProviderRouter({ primaryProvider: 'groq', failGroq: true });
    const res = await router.route('Hello Aura');
    assert.equal(res.provider, 'gemini');
    assert.equal(res.fallbackUsed, true);
    assert.ok(res.primaryError.includes('[REDACTED_GROQ_KEY]'));
    assert.ok(!res.primaryError.includes('gsk_test_secret_key_12345'), 'Private API key must never be exposed');
  });

  await t.test('should gracefully handle timeout and fallback without hanging', async () => {
    const router = new MockAIProviderRouter({ primaryProvider: 'groq', timeoutGroq: true });
    const res = await router.route('Hello Aura');
    assert.equal(res.provider, 'gemini');
    assert.equal(res.fallbackUsed, true);
    assert.ok(res.primaryError.includes('timed out'));
    assert.ok(!res.primaryError.includes('gsk_test_secret_key_12345'));
  });

  await t.test('should sanitize credentials if all providers fail', async () => {
    const router = new MockAIProviderRouter({ primaryProvider: 'groq', failGroq: true, failGemini: true });
    await assert.rejects(
      async () => await router.route('Hello Aura'),
      (err) => {
        assert.ok(!err.message.includes('gsk_test_secret_key_12345'));
        assert.ok(!err.message.includes('AIzaSy_test_secret_key_67890'));
        assert.ok(err.message.includes('[REDACTED_GROQ_KEY]'));
        assert.ok(err.message.includes('[REDACTED_GEMINI_KEY]'));
        return true;
      }
    );
  });
});
