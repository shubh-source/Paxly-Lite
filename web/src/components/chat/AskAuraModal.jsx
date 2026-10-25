import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Icons } from '../ui/Icons';
import { askAI } from '../../services/api';

export default function AskAuraModal({
  isOpen,
  message,
  partnerName = 'Partner',
  userName = 'You',
  isOwnMsg = false,
  onClose,
  onApplyReply,
}) {
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Quick prompt suggestions
  const quickChips = isOwnMsg
    ? [
        { label: '🤔 How does this sound?', prompt: 'How does this message sound to my partner? Could it be misinterpreted as cold or harsh?' },
        { label: '❤️ Make it warmer', prompt: 'How could I rephrase or follow up on this message to express more love and warmth?' },
        { label: '🕊️ Did I sound defensive?', prompt: 'Does this message come across as defensive or distant? How can I clarify my intention?' },
        { label: '💬 Next message to send', prompt: 'What is a great follow-up message I can send right now to keep our conversation loving and close?' },
      ]
    : [
        { label: '💬 How should I reply?', prompt: 'Give me 2-3 great, emotionally intelligent ways to respond to this message.' },
        { label: '❤️ Sweet & Loving reply', prompt: 'Suggest a deeply sweet and loving reply to this message that will make my partner smile.' },
        { label: '🕊️ Calm & Reassuring', prompt: 'How can I reply calmly and reassuringly to validate their feelings and diffuse any tension?' },
        { label: '🤔 What does this really mean?', prompt: 'What underlying emotions or unspoken needs might my partner be expressing in this message?' },
        { label: '😂 Playful & Lighthearted', prompt: 'Give me a cute, playful reply to lighten the mood.' },
      ];

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Initial trigger: when modal opens with a valid message, request initial analysis
  useEffect(() => {
    if (!isOpen || !message) {
      setMessages([]);
      setInputMsg('');
      setError(null);
      return;
    }

    let isMounted = true;

    const performInitialAnalysis = async () => {
      setLoading(true);
      setError(null);

      const senderDisplay = isOwnMsg ? (userName || 'I') : (partnerName || 'My partner');
      const recipientDisplay = isOwnMsg ? (partnerName || 'my partner') : 'me';
      const msgText = (message.text || '').trim();

      const initialUserPrompt = isOwnMsg
        ? `I sent this message to my partner (${recipientDisplay}) in our private couple chat:\n"${msgText || '[Attachment]'}"\n\nPlease analyze:\n1. 💡 **Tone & Impression:** How does this message come across? (Warm, distant, ambiguous, or direct?)\n2. 💭 **Partner's Likely Perception:** How might ${recipientDisplay} receive this?\n3. ✍️ **Recommended Follow-up:** Provide 2-3 warm follow-up or clarifying options in quotes (e.g. "...") that I can send if needed.`
        : `My partner (${senderDisplay}) sent me this message in our private couple chat:\n"${msgText || '[Attachment]'}"\n\nPlease analyze:\n1. 💡 **Underlying Meaning & Emotion:** What is ${senderDisplay} truly feeling or trying to convey?\n2. 💭 **Perspective:** What unspoken needs or vulnerability might be present?\n3. 💬 **Suggested Replies:** Provide 2-3 warm, emotionally intelligent response options in quotes (e.g. "...") ranging from caring/reassuring to playful.`;

      const systemPrompt = `You are Aura, an exceptionally empathetic, emotionally intelligent couple's communication coach and relationship companion in Vlynxly.
Your goal is to help couples communicate with profound empathy, eliminate misunderstandings, and deepen intimacy.
Keep your analysis insightful, loving, concise, and structured. Always enclose concrete suggested reply phrases in double quotes (e.g. "I'm right here with you...") so the user can easily tap and use them.`;

      try {
        const payload = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: initialUserPrompt }
        ];

        const res = await askAI(payload, 'Automatic', true);
        if (!isMounted) return;

        const reply = res?.reply || "I analyzed this message. It's a wonderful opportunity to connect and express understanding.";
        setMessages([
          {
            id: 'init_analysis',
            role: 'assistant',
            content: reply,
            timestamp: Date.now(),
          }
        ]);
      } catch (err) {
        if (!isMounted) return;
        console.warn('Aura analysis error:', err);
        setError('Aura is temporarily having trouble connecting to cloud intelligence. Here is an instant relationship tip:');
        setMessages([
          {
            id: 'fallback_tip',
            role: 'assistant',
            content: `💡 **Golden Couple Communication Tip:**\n\nWhen reading ${isOwnMsg ? 'your own message' : `${partnerName}'s message`}, always remember that tone over text can be easily lost without facial cues or vocal inflection.\n\n- **Validate feelings first:** Even a simple acknowledging phrase makes your partner feel safe.\n- **Suggested response:** *"I hear you, and your feelings really matter to me. Tell me more about what you're thinking."*\n\nYou can ask me specific questions below anytime!`,
            timestamp: Date.now(),
          }
        ]);
      } finally {
        if (isMounted) {
          setLoading(false);
          setTimeout(() => inputRef.current?.focus(), 150);
        }
      }
    };

    performInitialAnalysis();

    return () => {
      isMounted = false;
    };
  }, [isOpen, message?.id]);

  // Handle follow-up messages
  const handleSend = async (customPrompt) => {
    const textToSend = (customPrompt || inputMsg).trim();
    if (!textToSend || loading) return;

    setInputMsg('');
    setError(null);

    const userMsgObj = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: Date.now(),
    };

    const newMessages = [...messages, userMsgObj];
    setMessages(newMessages);
    setLoading(true);

    try {
      const senderDisplay = isOwnMsg ? (userName || 'I') : (partnerName || 'My partner');
      const systemPrompt = `You are Aura, an empathetic couple's relationship coach in Vlynxly.
Context:
- Analyzed Message: "${message?.text || ''}"
- Sent by: ${senderDisplay}
- User currently chatting with you: ${userName}
Always be compassionate, constructive, and practical. When suggesting reply text, put ready-to-send messages in double quotes (e.g. "...") for easy copying.`;

      const payload = [
        { role: 'system', content: systemPrompt },
        ...newMessages.map(m => ({ role: m.role, content: m.content }))
      ];

      const res = await askAI(payload, 'Automatic', true);
      const reply = res?.reply || 'I am right here with you. How else can I help you navigate this?';

      setMessages(prev => [
        ...prev,
        {
          id: `aura_${Date.now()}`,
          role: 'assistant',
          content: reply,
          timestamp: Date.now(),
        }
      ]);
    } catch (err) {
      console.warn('Follow-up error:', err);
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: 'I had trouble processing that request just now. Would you like to try again or ask in a different way?',
          timestamp: Date.now(),
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract double-quoted reply suggestions from Aura's text
  const extractSuggestions = (text) => {
    if (!text) return [];
    const matches = [];
    // Match text inside standard quotes that looks like a conversational sentence (10-180 chars)
    const regex = /["“]([^"”\n]{8,180})["”]/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const candidate = match[1].trim();
      // Skip markdown headers, URLs, or non-chat strings
      if (!candidate.startsWith('http') && !candidate.startsWith('#') && !matches.includes(candidate)) {
        matches.push(candidate);
      }
    }
    return matches.slice(0, 3); // Max 3 quick picks
  };

  const handleCopy = (id, textToCopy) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isOpen || !message) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.78)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 340 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: '490px',
            height: '84vh',
            maxHeight: '680px',
            background: '#121110',
            border: '1px solid rgba(201, 169, 110, 0.28)',
            borderRadius: '24px',
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.8), 0 0 45px rgba(201, 169, 110, 0.12)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* ── HEADER ── */}
          <div
            style={{
              padding: '14px 18px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'linear-gradient(180deg, rgba(201, 169, 110, 0.08) 0%, rgba(0,0,0,0) 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(201, 169, 110, 0.3) 0%, rgba(201, 169, 110, 0.05) 100%)',
                  border: '1px solid rgba(201, 169, 110, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  boxShadow: '0 0 15px rgba(201, 169, 110, 0.25)',
                }}
              >
                ✨
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.98rem', color: '#fff', letterSpacing: 0.2 }}>
                    Ask Aura
                  </span>
                  <span
                    style={{
                      background: 'rgba(201, 169, 110, 0.18)',
                      color: 'var(--accent, #C9A96E)',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: 6,
                      border: '1px solid rgba(201, 169, 110, 0.3)',
                    }}
                  >
                    AI INSIGHT
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.5)' }}>
                  Emotion analysis & intelligent couple advice
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.7)',
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
              }}
            >
              <Icons.Close size={16} />
            </button>
          </div>

          {/* ── QUOTED MESSAGE SNAPSHOT ── */}
          <div
            style={{
              padding: '10px 16px',
              background: 'rgba(0, 0, 0, 0.35)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderLeft: `3px solid ${isOwnMsg ? 'var(--accent, #C9A96E)' : '#70b6f6'}`,
                borderRadius: '12px',
                padding: '9px 12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: isOwnMsg ? 'var(--accent, #C9A96E)' : '#70b6f6',
                    letterSpacing: 0.3,
                  }}
                >
                  {isOwnMsg ? 'YOUR MESSAGE' : `${partnerName.toUpperCase()}'S MESSAGE`}
                </span>
                <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)' }}>
                  Selected context
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.84rem',
                  color: 'rgba(255, 255, 255, 0.92)',
                  lineHeight: 1.45,
                  wordBreak: 'break-word',
                  maxHeight: '58px',
                  overflowY: 'auto',
                  fontStyle: 'italic',
                }}
              >
                "{message.text || '[Media Attachment]'}"
              </div>
            </div>
          </div>

          {/* ── CONVERSATION STREAM ── */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {messages.map((m) => {
              const isAssistant = m.role === 'assistant';
              const suggestions = isAssistant ? extractSuggestions(m.content) : [];

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isAssistant ? 'flex-start' : 'flex-end',
                    maxWidth: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      maxWidth: '92%',
                      flexDirection: isAssistant ? 'row' : 'row-reverse',
                    }}
                  >
                    {isAssistant && (
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: 'rgba(201, 169, 110, 0.2)',
                          border: '1px solid rgba(201, 169, 110, 0.4)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8rem',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        ✨
                      </div>
                    )}

                    <div
                      style={{
                        background: isAssistant
                          ? 'rgba(255, 255, 255, 0.05)'
                          : 'linear-gradient(135deg, var(--accent, #C9A96E) 0%, #b39255 100%)',
                        color: isAssistant ? 'rgba(255, 255, 255, 0.92)' : '#111',
                        border: isAssistant ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                        borderRadius: isAssistant ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                        padding: '11px 14px',
                        fontSize: '0.85rem',
                        lineHeight: 1.5,
                        boxShadow: isAssistant
                          ? '0 4px 16px rgba(0, 0, 0, 0.25)'
                          : '0 4px 16px rgba(201, 169, 110, 0.25)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {isAssistant ? (
                        <div className="aura-analysis-content" style={{ fontSize: '0.85rem' }}>
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 500 }}>{m.content}</div>
                      )}

                      {/* Interactive suggestion pills */}
                      {isAssistant && suggestions.length > 0 && (
                        <div
                          style={{
                            marginTop: 12,
                            paddingTop: 10,
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: 'var(--accent, #C9A96E)', fontWeight: 600 }}>
                            ⚡ TAP TO USE SUGGESTION AS REPLY:
                          </div>
                          {suggestions.map((suggestion, sIdx) => (
                            <button
                              key={sIdx}
                              onClick={() => {
                                if (onApplyReply) onApplyReply(suggestion);
                              }}
                              style={{
                                background: 'rgba(201, 169, 110, 0.12)',
                                border: '1px solid rgba(201, 169, 110, 0.3)',
                                color: '#f3e6cb',
                                borderRadius: 10,
                                padding: '7px 11px',
                                fontSize: '0.78rem',
                                textAlign: 'left',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                transition: 'all 0.15s ease',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(201, 169, 110, 0.24)';
                                e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.6)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(201, 169, 110, 0.12)';
                                e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.3)';
                              }}
                            >
                              <span style={{ fontStyle: 'italic' }}>"{suggestion}"</span>
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  background: 'var(--accent, #C9A96E)',
                                  color: '#000',
                                  borderRadius: 6,
                                  padding: '2px 6px',
                                  flexShrink: 0,
                                }}
                              >
                                Insert ✍️
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Assistant actions: Copy */}
                      {isAssistant && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 8,
                            marginTop: 8,
                            paddingTop: 6,
                          }}
                        >
                          <button
                            onClick={() => handleCopy(m.id, m.content)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: copiedId === m.id ? '#4ebe82' : 'rgba(255, 255, 255, 0.45)',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Icons.Copy size={12} />
                            {copiedId === m.id ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Loading Indicator */}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'rgba(201, 169, 110, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                  }}
                >
                  ✨
                </div>
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '16px 16px 16px 4px',
                    padding: '8px 14px',
                    fontSize: '0.8rem',
                    color: 'var(--accent, #C9A96E)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span>Aura is analyzing tone & emotions</span>
                  <span className="shimmer-dots">...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── QUICK PROMPTS (CHIPS) ── */}
          <div
            style={{
              padding: '6px 14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              background: 'rgba(0, 0, 0, 0.2)',
              display: 'flex',
              gap: 6,
              overflowX: 'auto',
              whiteSpace: 'nowrap',
              scrollbarWidth: 'none',
            }}
          >
            {quickChips.map((chip, idx) => (
              <button
                key={idx}
                disabled={loading}
                onClick={() => handleSend(chip.prompt)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'rgba(255, 255, 255, 0.82)',
                  borderRadius: 20,
                  padding: '5px 11px',
                  fontSize: '0.74rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.background = 'rgba(201, 169, 110, 0.18)';
                    e.currentTarget.style.color = '#fff';
                    e.currentTarget.style.borderColor = 'rgba(201, 169, 110, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.82)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* ── INPUT BAR ── */}
          <div
            style={{
              padding: '12px 14px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: '#0d0c0b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask Aura anything about this message..."
              disabled={loading}
              style={{
                flex: 1,
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 24,
                padding: '10px 16px',
                color: '#fff',
                fontSize: '0.86rem',
                outline: 'none',
              }}
            />

            <button
              onClick={() => handleSend()}
              disabled={!inputMsg.trim() || loading}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: inputMsg.trim() && !loading
                  ? 'var(--accent, #C9A96E)'
                  : 'rgba(255, 255, 255, 0.08)',
                color: inputMsg.trim() && !loading ? '#000' : 'rgba(255, 255, 255, 0.3)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: inputMsg.trim() && !loading ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s ease',
                flexShrink: 0,
              }}
            >
              <Icons.Send size={16} />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
