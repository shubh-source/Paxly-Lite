import React, { useState } from 'react';
import { Icons } from '../ui/Icons';

export const DEFAULT_AURA_SETTINGS = {
  // 1. Personality
  preset: 'Balanced',
  customInstructions: '',
  warmth: 'High',
  formality: 'Casual',
  humor: 'Medium',
  directness: 'Balanced',
  initiative: 'Suggestive',
  correctionStyle: 'Gentle',
  supportStyle: 'Supportive',

  // 2. Chat & Responses
  language: 'Hinglish',
  responseLength: 'Balanced',
  explanationLevel: 'Adaptive',
  formatStyle: 'Paragraphs',
  stepByStep: true,
  useContext: true,
  streaming: true,

  // 3. Memory
  memoryEnabled: true,
  autoSavePreferences: true,
  retention: 'Until deleted',
  showMemoryReason: true,

  // 4. Voice & Real-Time
  voiceInput: true,
  voiceResponses: false,
  speechSpeed: '1.0x',
  pushToTalk: true,

  // 5. Models & Intelligence
  modelProvider: 'Automatic',
  fastResponseMode: true,
  deepReasoning: false,
  structuredOutput: true,

  // 6. Safety & Trusted Contacts
  emotionalSupportMode: true,
  crisisDetection: true,
  escalationMode: 'Suggest', // Off, Suggest, Ask first, Pre-authorized
  trustedContact: '',

  // 7. Appearance
  theme: 'Dark',
  bubbleStyle: 'Modern Glass',
  chatDensity: 'Comfortable',
  chatWidth: 'Standard',

  // 8. Performance
  performanceMode: 'Balanced', // Fast, Balanced, Quality
  cacheRetention: true,

  // 9. Privacy & Security
  dataRetention: 'Standard',
  analyticsConsent: true,
};

export default function AuraSettingsModal({ isOpen, onClose, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState('personality');
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('paxly_aura_comprehensive_settings');
      if (saved) return { ...DEFAULT_AURA_SETTINGS, ...JSON.parse(saved) };
      // Fallback from legacy personality
      const legacyPersonality = localStorage.getItem('paxly_aura_personality') || '';
      return { ...DEFAULT_AURA_SETTINGS, customInstructions: legacyPersonality };
    } catch {
      return DEFAULT_AURA_SETTINGS;
    }
  });

  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(settings));
    // Keep legacy key synced for backward compatibility
    localStorage.setItem('paxly_aura_personality', settings.customInstructions || '');
    if (onSettingsChange) onSettingsChange(settings);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    if (confirm("Reset Aura settings to default?")) {
      setSettings(DEFAULT_AURA_SETTINGS);
      localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(DEFAULT_AURA_SETTINGS));
      localStorage.setItem('paxly_aura_personality', '');
      if (onSettingsChange) onSettingsChange(DEFAULT_AURA_SETTINGS);
    }
  };

  const tabs = [
    { id: 'personality', label: 'Personality', icon: '🧠', desc: 'Behavior & Tone' },
    { id: 'chat', label: 'Chat & Responses', icon: '💬', desc: 'Language & Format' },
    { id: 'memory', label: 'Memory', icon: '💾', desc: 'Saved Preferences' },
    { id: 'voice', label: 'Voice & Speech', icon: '🎙️', desc: 'Voice Controls' },
    { id: 'models', label: 'Models & Engine', icon: '⚡', desc: 'Intelligence Mode' },
    { id: 'safety', label: 'Safety & Contacts', icon: '🛡️', desc: 'Crisis & Escalation' },
    { id: 'appearance', label: 'Appearance', icon: '🎨', desc: 'UI & Theme' },
    { id: 'privacy', label: 'Privacy & Data', icon: '🔒', desc: 'Data Controls' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(8px)' }}>
      <div style={{
        background: 'linear-gradient(180deg, #18181b 0%, #121215 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        width: '100%',
        maxWidth: 820,
        height: '88vh',
        maxHeight: 740,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        overflow: 'hidden',
        color: '#fff',
        fontFamily: 'inherit'
      }}>
        {/* Top Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text, #fff)' }}>Aura Settings</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Personalization, intelligence & safety preferences</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--muted, #8E8E96)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: 'all 0.2s' }}>×</button>
        </div>

        {/* Body (Sidebar + Content) */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Navigation Sidebar */}
          <div style={{ width: 220, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '12px 8px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }} className="settings-nav-sidebar">
            {tabs.map(t => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
                    border: active ? '1px solid rgba(201,169,110,0.3)' : '1px solid transparent',
                    color: active ? 'var(--accent, #C9A96E)' : 'var(--muted, #8E8E96)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 4,
                    transition: 'all 0.18s',
                    fontSize: '0.85rem',
                    fontWeight: active ? 600 : 500
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{t.label}</div>
                    <div style={{ fontSize: '0.68rem', opacity: 0.65, fontWeight: 400 }}>{t.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'rgba(255,255,255,0.01)' }}>
            {/* 1. PERSONALITY */}
            {activeTab === 'personality' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Personality & Behavior</h4>
                
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Personality Preset</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
                    {['Balanced', 'Friendly', 'Professional', 'Teacher', 'Technical', 'Minimal'].map(p => (
                      <button
                        key={p}
                        onClick={() => updateSetting('preset', p)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 10,
                          background: settings.preset === p ? 'rgba(201,169,110,0.2)' : 'rgba(255,255,255,0.04)',
                          border: settings.preset === p ? '1px solid var(--accent, #C9A96E)' : '1px solid rgba(255,255,255,0.08)',
                          color: settings.preset === p ? '#fff' : 'var(--muted, #8E8E96)',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          fontWeight: settings.preset === p ? 600 : 400
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Custom Instructions</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)', margin: '0 0 8px' }}>
                    Aura aapse kaise baat kare? (e.g. "treat me like a student", "use playful Hinglish", "keep it concise").
                  </p>
                  <textarea
                    value={settings.customInstructions}
                    onChange={e => updateSetting('customInstructions', e.target.value)}
                    placeholder="Enter custom behavior instructions..."
                    style={{ width: '100%', height: 90, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: '0.85rem', resize: 'none' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Warmth</label>
                    <select
                      value={settings.warmth}
                      onChange={e => updateSetting('warmth', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Low">Low (Cool & Objective)</option>
                      <option value="Medium">Medium (Balanced)</option>
                      <option value="High">High (Affectionate & Caring)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Formality</label>
                    <select
                      value={settings.formality}
                      onChange={e => updateSetting('formality', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Casual">Casual (Friend vibe)</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Formal">Formal (Respectful)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Humor</label>
                    <select
                      value={settings.humor}
                      onChange={e => updateSetting('humor', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Off">Off</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium (Playful)</option>
                      <option value="High">High (Witty)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Correction Style</label>
                    <select
                      value={settings.correctionStyle}
                      onChange={e => updateSetting('correctionStyle', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Gentle">Gentle (Polite explanation)</option>
                      <option value="Direct">Direct (Straight to point)</option>
                      <option value="Detailed">Detailed</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 2. CHAT & RESPONSES */}
            {activeTab === 'chat' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Chat & Response Preferences</h4>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Preferred Language</label>
                  <select
                    value={settings.language}
                    onChange={e => updateSetting('language', e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                  >
                    <option value="Auto-detect">Auto-detect (Language Mirroring)</option>
                    <option value="Hinglish">Natural Hinglish (Hindi + English mix)</option>
                    <option value="Hindi">Pure Hindi (हिंदी)</option>
                    <option value="English">English</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Response Length</label>
                    <select
                      value={settings.responseLength}
                      onChange={e => updateSetting('responseLength', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Short">Short & Snappy</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Detailed">Detailed & Comprehensive</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Explanation Depth</label>
                    <select
                      value={settings.explanationLevel}
                      onChange={e => updateSetting('explanationLevel', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Adaptive">Adaptive (Matches context)</option>
                      <option value="Beginner">Beginner-friendly</option>
                      <option value="Advanced">Advanced / In-depth</option>
                    </select>
                  </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  {[
                    { key: 'stepByStep', label: 'Step-by-step explanations', desc: 'Break down complex advice into numbered steps' },
                    { key: 'useContext', label: 'Use conversation context', desc: 'Remember recent topic threads in current chat' },
                    { key: 'streaming', label: 'Fast streaming replies', desc: 'Start showing answer immediately as it generates' },
                  ].map(item => (
                    <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings[item.key]}
                        onChange={e => updateSetting(item.key, e.target.checked)}
                        style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. MEMORY */}
            {activeTab === 'memory' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Memory & Personalization</h4>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Long-term Memory</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Allow Aura to remember your couple preferences & past conversations</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.memoryEnabled}
                      onChange={e => updateSetting('memoryEnabled', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Auto-save preferences</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Automatically remember likes, dates, and communication habits</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.autoSavePreferences}
                      onChange={e => updateSetting('autoSavePreferences', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => {
                      if (confirm("Clear local chat memory cache?")) {
                        localStorage.removeItem('paxly_aura_threads');
                        alert("Chat memory cache cleared.");
                      }
                    }}
                    style={{ padding: '10px 16px', borderRadius: 10, background: 'rgba(255,70,70,0.12)', border: '1px solid rgba(255,70,70,0.3)', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    Clear Saved Memory Cache
                  </button>
                </div>
              </div>
            )}

            {/* 4. VOICE & REAL-TIME */}
            {activeTab === 'voice' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Voice & Speech Assistant</h4>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Voice Input (Microphone)</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Dictate notes and send voice messages directly to Aura</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.voiceInput}
                      onChange={e => updateSetting('voiceInput', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Voice Audio Responses</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Read Aura's answers aloud via Text-to-Speech (TTS)</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.voiceResponses}
                      onChange={e => updateSetting('voiceResponses', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 5. MODELS & INTELLIGENCE */}
            {activeTab === 'models' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>AI Models & Reasoning Engines</h4>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Inference Routing</label>
                  <select
                    value={settings.modelProvider}
                    onChange={e => updateSetting('modelProvider', e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                  >
                    <option value="Automatic">Automatic (Primary: Gemini 2.5 Flash, Fallback: Groq Ultra-Fast)</option>
                    <option value="Gemini">Gemini Cloud Only</option>
                    <option value="Groq">Groq LPU Only (Fastest)</option>
                  </select>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Fast Response Mode ⚡</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Bypasses internal reasoning loops for near-instant (under 1s) replies</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.fastResponseMode}
                      onChange={e => updateSetting('fastResponseMode', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 6. SAFETY & TRUSTED CONTACTS */}
            {activeTab === 'safety' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: '#ff6b6b', fontSize: '1rem' }}>Safety & Crisis Escalation</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted, #8E8E96)', marginBottom: 16 }}>
                  Emotional safety protocols. Severe distress ya crisis conditions par Aura trusted contact policy trigger karta hai.
                </p>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Trusted Contact Policy</label>
                  <select
                    value={settings.escalationMode}
                    onChange={e => updateSetting('escalationMode', e.target.value)}
                    style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                  >
                    <option value="Suggest">Suggest (Aura will recommend reaching out to partner/friend)</option>
                    <option value="Ask first">Ask First (Aura will ask before sending notification)</option>
                    <option value="Pre-authorized">Pre-authorized (Send notification only in critical emergency)</option>
                    <option value="Off">Off (Never auto-notify)</option>
                  </select>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Self-harm & Distress Guardrails</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Automatic emergency resources and helpline numbers display</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.crisisDetection}
                      onChange={e => updateSetting('crisisDetection', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: '#ff6b6b', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 7. APPEARANCE */}
            {activeTab === 'appearance' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Interface & Theme</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Theme</label>
                    <select
                      value={settings.theme}
                      onChange={e => updateSetting('theme', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Dark">Dark Velvet</option>
                      <option value="Light">Light Minimal</option>
                      <option value="System">System Match</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Message Bubble Style</label>
                    <select
                      value={settings.bubbleStyle}
                      onChange={e => updateSetting('bubbleStyle', e.target.value)}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                    >
                      <option value="Modern Glass">Modern Glassmorphic</option>
                      <option value="Minimal Compact">Minimal Compact</option>
                      <option value="Classic">Classic Rounded</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 8. PRIVACY */}
            {activeTab === 'privacy' && (
              <div>
                <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Privacy & Security</h4>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.6, margin: '0 0 12px' }}>
                    🛡️ <strong>End-to-End Encryption Guarantee:</strong> Aapke aur Aura ke beech ki conversations encrypted hain. Partner ko bina aapki explicit permission ke koi bhi AI chat access nahi diya jaata.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Anonymous Diagnostics</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Help improve Aura error handling without logging personal chats</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.analyticsConsent}
                      onChange={e => updateSetting('analyticsConsent', e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <button
            onClick={handleReset}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted, #8E8E96)', fontSize: '0.82rem', cursor: 'pointer', padding: '6px 8px' }}
          >
            Reset to Defaults
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              style={{ background: savedSuccess ? 'var(--success, #4EBE82)' : 'var(--accent, #C9A96E)', border: 'none', color: '#000', padding: '8px 24px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s' }}
            >
              {savedSuccess ? 'Saved ✓' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
