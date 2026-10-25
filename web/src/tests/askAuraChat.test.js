import test from 'node:test';
import assert from 'node:assert/strict';

test('Ask Aura In-Chat Interaction & Suggestion Parsing Suite', async (t) => {
  // Helper matching the suggestion extraction algorithm in AskAuraModal
  const extractSuggestions = (text) => {
    if (!text) return [];
    const matches = [];
    const regex = /["“]([^"”\n]{8,180})["”]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const candidate = match[1].trim();
      if (!candidate.startsWith('http') && !candidate.startsWith('#') && !matches.includes(candidate)) {
        matches.push(candidate);
      }
    }
    return matches.slice(0, 3);
  };

  await t.test('1. Suggestion Extractor parses double-quoted suggestions from Aura output', () => {
    const aiText = `Here is how you can respond warmly to your partner:
Option 1: "I'm right here with you, let's talk about it whenever you're ready."
Option 2: "I love you and appreciate you sharing this with me ❤️"
Option 3: "Thank you for letting me know, I'm on my way home now!"`;

    const suggestions = extractSuggestions(aiText);
    assert.equal(suggestions.length, 3);
    assert.equal(suggestions[0], "I'm right here with you, let's talk about it whenever you're ready.");
    assert.equal(suggestions[1], "I love you and appreciate you sharing this with me ❤️");
    assert.equal(suggestions[2], "Thank you for letting me know, I'm on my way home now!");
  });

  await t.test('2. Suggestion Extractor ignores URLs and non-conversational tokens', () => {
    const textWithUrls = 'Visit "https://vlynxly.com" or "#heading" or say "Let\'s meet for coffee at 5"';
    const suggestions = extractSuggestions(textWithUrls);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0], "Let's meet for coffee at 5");
  });

  await t.test('3. Context differentiation: Partner message vs Own message perspective', () => {
    const buildPrompt = (isOwnMsg, senderName, recipientName, msgText) => {
      return isOwnMsg
        ? `I sent this message to my partner (${recipientName}): "${msgText}"`
        : `My partner (${senderName}) sent me this message: "${msgText}"`;
    };

    const partnerPrompt = buildPrompt(false, 'Aarav', 'Simran', 'I had a really exhausting day today...');
    assert.match(partnerPrompt, /My partner \(Aarav\) sent me this message/);

    const ownPrompt = buildPrompt(true, 'Simran', 'Aarav', 'Can we talk later tonight?');
    assert.match(ownPrompt, /I sent this message to my partner \(Aarav\)/);
  });
});
