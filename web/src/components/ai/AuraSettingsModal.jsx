import React, { useState, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { getAuraSettings, saveAuraSettings, resetAuraSettings, deleteAllAIThreads } from '../../services/api';

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
  streaming: false,

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

export default function AuraSettingsModal({ isOpen, onClose, onSettingsChange, onClearAllChats }) {
  const [activeTab, setActiveTab] = useState('personality');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDestructiveModal, setShowDestructiveModal] = useState(false);
  const [destructiveActionType, setDestructiveActionType] = useState(null); // 'reset' | 'clear_chats'

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('paxly_aura_comprehensive_settings');
      if (saved) return { ...DEFAULT_AURA_SETTINGS, ...JSON.parse(saved) };
      const legacyPersonality = localStorage.getItem('paxly_aura_personality') || '';
      return { ...DEFAULT_AURA_SETTINGS, customInstructions: legacyPersonality };
    } catch {
      return DEFAULT_AURA_SETTINGS;
    }
  });

  // Fetch settings from authenticated backend on modal open
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    setLoading(true);
    setErrorMsg('');

    getAuraSettings()
      .then(cloudSettings => {
        if (!isMounted) return;
        if (cloudSettings && typeof cloudSettings === 'object') {
          const merged = { ...DEFAULT_AURA_SETTINGS, ...cloudSettings };
          setSettings(merged);
          localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(merged));
          if (merged.customInstructions) {
            localStorage.setItem('paxly_aura_personality', merged.customInstructions);
          }
        }
      })
      .catch(err => {
        // Fallback to local storage if offline or guest
        console.warn('Could not fetch cloud settings, using local:', err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen]);

  if (!isOpen) return null;

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    // 1. Validation
    if (settings.customInstructions && settings.customInstructions.length > 2500) {
      setErrorMsg('Custom instructions cannot exceed 2500 characters.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 2. Persist to Backend API
      await saveAuraSettings(settings);

      // 3. Persist to Local Storage
      localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(settings));
      localStorage.setItem('paxly_aura_personality', settings.customInstructions || '');

      if (onSettingsChange) onSettingsChange(settings);
      setSuccessMsg('Settings saved securely! ✓');

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 700);
    } catch (err) {
      // Save locally as resilient fallback
      localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(settings));
      localStorage.setItem('paxly_aura_personality', settings.customInstructions || '');
      if (onSettingsChange) onSettingsChange(settings);
      setErrorMsg(err.response?.data?.detail || 'Failed to sync to cloud. Saved on this device.');
    } finally {
      setSaving(false);
    }
  };

  const executeDestructiveAction = async () => {
    if (destructiveActionType === 'reset') {
      setSaving(true);
      try {
        await resetAuraSettings();
        setSettings(DEFAULT_AURA_SETTINGS);
        localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(DEFAULT_AURA_SETTINGS));
        localStorage.setItem('paxly_aura_personality', '');
        if (onSettingsChange) onSettingsChange(DEFAULT_AURA_SETTINGS);
        setSuccessMsg('Settings restored to defaults! ✓');
        setTimeout(() => setSuccessMsg(''), 1200);
      } catch (err) {
        setSettings(DEFAULT_AURA_SETTINGS);
        localStorage.setItem('paxly_aura_comprehensive_settings', JSON.stringify(DEFAULT_AURA_SETTINGS));
      } finally {
        setSaving(false);
        setShowDestructiveModal(false);
      }
    } else if (destructiveActionType === 'clear_chats') {
      setSaving(true);
      try {
        await deleteAllAIThreads();
        localStorage.removeItem('paxly_aura_threads');
        if (onClearAllChats) onClearAllChats();
        setSuccessMsg('All chat history permanently deleted! ✓');
        setTimeout(() => setSuccessMsg(''), 1500);
      } catch (err) {
        localStorage.removeItem('paxly_aura_threads');
        if (onClearAllChats) onClearAllChats();
        setErrorMsg('Cleared local chats. (Cloud sync error: ' + (err.message || 'offline') + ')');
      } finally {
        setSaving(false);
        setShowDestructiveModal(false);
      }
    }
  };

  const tabs = [
    { id: 'personality', label: 'Personality', icon: '🧠', desc: 'Behavior & Tone' },
    { id: 'chat', label: 'Chat & Responses', icon: '💬', desc: 'Language & Style' },
    { id: 'memory', label: 'Memory', icon: '💾', desc: 'Saved Context' },
    { id: 'voice', label: 'Voice & Speech', icon: '🎙️', desc: 'Audio Controls' },
    { id: 'models', label: 'Models & Engine', icon: '⚡', desc: 'Inference Routing' },
    { id: 'safety', label: 'Safety & Contacts', icon: '🛡️', desc: 'Crisis Escalation' },
    { id: 'appearance', label: 'Appearance', icon: '🎨', desc: 'UI & Theme' },
    { id: 'privacy', label: 'Privacy & Data', icon: '🔒', desc: 'Data Protection' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(10px)' }}>
      <div className="aura-settings-container" style={{
        background: 'linear-gradient(180deg, #18181b 0%, #111114 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        width: '100%',
        maxWidth: 840,
        height: '88vh',
        maxHeight: 740,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        overflow: 'hidden',
        color: '#fff',
        fontFamily: 'inherit'
      }}>
        {/* Top Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.3rem' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text, #fff)' }}>Aura Settings</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Personalization, intelligence & safety preferences</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'var(--muted, #8E8E96)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: 'all 0.2s' }}>×</button>
        </div>

        {/* Feedback / Alert Banners */}
        {errorMsg && (
          <div style={{ background: 'rgba(255,70,70,0.15)', borderBottom: '1px solid rgba(255,70,70,0.3)', padding: '10px 20px', color: '#ff8585', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠️ {errorMsg}</span>
            <button onClick={() => setErrorMsg('')} style={{ background: 'none', border: 'none', color: '#ff8585', cursor: 'pointer', fontSize: '1rem' }}>×</button>
          </div>
        )}
        {successMsg && (
          <div style={{ background: 'rgba(78,190,130,0.15)', borderBottom: '1px solid rgba(78,190,130,0.3)', padding: '10px 20px', color: '#4ebe82', fontSize: '0.82rem' }}>
            {successMsg}
          </div>
        )}

        {/* Body Layout */}
        <div className="aura-settings-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Navigation Sidebar */}
          <div className="settings-nav-sidebar" style={{ width: 220, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '12px 8px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
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
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.7 }}>
                <div style={{ width: 30, height: 30, border: '3px solid rgba(201,169,110,0.2)', borderTopColor: 'var(--accent, #C9A96E)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Loading your saved preferences...</span>
              </div>
            ) : (
              <>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Custom Instructions</label>
                        <span style={{ fontSize: '0.72rem', color: (settings.customInstructions?.length || 0) > 2500 ? '#ff6b6b' : 'var(--muted, #8E8E96)' }}>
                          {(settings.customInstructions?.length || 0)} / 2500
                        </span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)', margin: '0 0 8px' }}>
                        Aura aapse kaise baat kare? (e.g. "treat me like a student", "use playful Hinglish", "keep answers short and direct").
                      </p>
                      <textarea
                        value={settings.customInstructions || ''}
                        onChange={e => updateSetting('customInstructions', e.target.value)}
                        placeholder="Enter custom behavior instructions..."
                        style={{ width: '100%', height: 90, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 12, color: '#fff', fontSize: '0.85rem', resize: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Warmth</label>
                        <select
                          value={settings.warmth}
                          onChange={e => updateSetting('warmth', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                        style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                      >
                        <option value="Auto-detect">Auto-detect (Language Mirroring)</option>
                        <option value="Hinglish">Natural Hinglish (Hindi + English mix)</option>
                        <option value="Hindi">Pure Hindi (हिंदी)</option>
                        <option value="English">English</option>
                      </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Response Length</label>
                        <select
                          value={settings.responseLength}
                          onChange={e => updateSetting('responseLength', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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

                      {/* Explicitly marked unsupported streaming toggle */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', opacity: 0.65 }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Fast streaming replies
                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 6, color: '#ffb347' }}>v2.0 Beta</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>
                            Server uses fast batch response pipeline under 1s. SSE stream is in testing.
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          disabled
                          checked={false}
                          style={{ width: 18, height: 18, cursor: 'not-allowed' }}
                        />
                      </div>
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

                    <div style={{ background: 'rgba(255,70,70,0.05)', border: '1px solid rgba(255,70,70,0.2)', padding: 14, borderRadius: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ff8585', marginBottom: 4 }}>Destructive Actions</div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)', margin: '0 0 10px' }}>
                        Delete all past chat conversations and session context from both your cloud account and this device.
                      </p>
                      <button
                        onClick={() => {
                          setDestructiveActionType('clear_chats');
                          setShowDestructiveModal(true);
                        }}
                        style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,70,70,0.15)', border: '1px solid rgba(255,70,70,0.4)', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Delete All AI Chat History
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
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Voice Audio Responses (TTS)
                            <span style={{ fontSize: '0.65rem', background: 'rgba(78,190,130,0.15)', color: '#4ebe82', padding: '2px 6px', borderRadius: 6 }}>Experimental</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Read Aura's answers aloud using web browser SpeechSynthesis</div>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.voiceResponses}
                          onChange={e => updateSetting('voiceResponses', e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }}
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Speech Speed</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Voice playback rate</div>
                        </div>
                        <select
                          value={settings.speechSpeed}
                          onChange={e => updateSetting('speechSpeed', e.target.value)}
                          style={{ background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: '0.8rem' }}
                        >
                          <option value="0.8x">0.8x (Slower)</option>
                          <option value="1.0x">1.0x (Normal)</option>
                          <option value="1.2x">1.2x (Faster)</option>
                        </select>
                      </div>

                      {/* Unsupported Wake Word Banner */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)', opacity: 0.6 }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Always-On Wake Word ("Hey Aura")
                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', color: '#ffb347', padding: '2px 6px', borderRadius: 6 }}>Requires OS Daemon</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Continuous background listening is restricted by browser security policies</div>
                        </div>
                        <input
                          type="checkbox"
                          disabled
                          checked={false}
                          style={{ width: 18, height: 18, cursor: 'not-allowed' }}
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
                        style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                      >
                        <option value="Automatic">Automatic (Primary: Gemini 2.5 Flash, Fallback: Groq Ultra-Fast)</option>
                        <option value="Gemini">Gemini Cloud Only (Google Generative AI)</option>
                        <option value="Groq">Groq LPU Only (Sub-second LLaMA-3.3)</option>
                      </select>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted, #8E8E96)', marginTop: 4 }}>
                        Connected to backend server inference dispatcher.
                      </span>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Fast Response Mode ⚡</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Disables deliberate reasoning budgets to deliver sub-second responses</div>
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
                    <h4 style={{ margin: '0 0 16px', color: '#ff8585', fontSize: '1rem' }}>Safety & Crisis Escalation</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--muted, #8E8E96)', marginBottom: 16 }}>
                      Emotional safety protocols. Severe distress ya crisis conditions par Aura trusted contact policy trigger karta hai.
                    </p>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Trusted Contact Escalation Policy</label>
                      <select
                        value={settings.escalationMode}
                        onChange={e => updateSetting('escalationMode', e.target.value)}
                        style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}
                      >
                        <option value="Suggest">Suggest (Aura will recommend reaching out to partner/friend)</option>
                        <option value="Ask first">Ask First (Aura will ask before sending notification)</option>
                        <option value="Pre-authorized">Pre-authorized (Notify only in severe crisis)</option>
                        <option value="Off">Off (Never auto-notify)</option>
                      </select>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--muted, #8E8E96)', marginTop: 4 }}>
                        Synced to backend user profile: <code>crisis_escalation_enabled = {settings.escalationMode !== 'Off' ? 'true' : 'false'}</code>.
                      </span>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Self-harm & Distress Guardrails</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Automatic emergency helplines (Tele-MANAS: 14416, Vandrevala: 9999 666 555)</div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Theme</label>
                        <select
                          value={settings.theme}
                          onChange={e => updateSetting('theme', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
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
                    <h4 style={{ margin: '0 0 16px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>Privacy & Data Isolation</h4>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.6, margin: '0 0 12px' }}>
                        🛡️ <strong>Zero-Knowledge Multi-Tenant Isolation:</strong> Har user ki settings aur conversation history database mein JWT-verified <code>user_id</code> se isolated hoti hain. Partner ya third party ke sath chats share nahi ki jaati hain.
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Anonymous Error Diagnostics</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Report API timeouts to Sentra health system without personal messages</div>
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
              </>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <button
            onClick={() => {
              setDestructiveActionType('reset');
              setShowDestructiveModal(true);
            }}
            disabled={saving || loading}
            style={{ background: 'transparent', border: 'none', color: 'var(--muted, #8E8E96)', fontSize: '0.82rem', cursor: 'pointer', padding: '6px 8px' }}
          >
            Reset to Defaults
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              style={{
                background: saving ? 'rgba(201,169,110,0.5)' : successMsg ? 'var(--success, #4EBE82)' : 'var(--accent, #C9A96E)',
                border: 'none',
                color: '#000',
                padding: '8px 24px',
                borderRadius: 20,
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              {saving ? 'Saving...' : successMsg ? 'Saved ✓' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Confirmation Modal for Destructive Actions */}
        {showDestructiveModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#1c1c20', border: '1px solid rgba(255,70,70,0.3)', borderRadius: 16, padding: 22, maxWidth: 380, width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', marginBottom: 10 }}>
                {destructiveActionType === 'reset' ? '🔄' : '🗑️'}
              </div>
              <h3 style={{ margin: '0 0 10px', fontSize: '1.05rem', color: '#fff' }}>
                {destructiveActionType === 'reset' ? 'Reset Settings to Defaults?' : 'Permanently Delete All AI Chats?'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.5, marginBottom: 20 }}>
                {destructiveActionType === 'reset'
                  ? 'Aura ki sabhi custom instructions, personality presets aur routing preferences standard defaults par restore ho jayengi.'
                  : 'Aapke aur Aura ke beech ke sabhi conversation threads cloud database aur is phone se permanently delete ho jayenge.'}
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  onClick={() => setShowDestructiveModal(false)}
                  style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  onClick={executeDestructiveAction}
                  disabled={saving}
                  style={{ background: '#ff4d4d', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                >
                  {saving ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media (max-width: 640px) {
            .aura-settings-container {
              max-height: 95vh !important;
              height: 95vh !important;
              border-radius: 16px !important;
            }
            .aura-settings-body {
              flex-direction: column !important;
            }
            .settings-nav-sidebar {
              width: 100% !important;
              display: flex !important;
              flex-direction: row !important;
              overflow-x: auto !important;
              border-right: none !important;
              border-bottom: 1px solid rgba(255,255,255,0.06) !important;
              padding: 8px !important;
              white-space: nowrap !important;
              gap: 6px !important;
            }
            .settings-nav-sidebar button {
              width: auto !important;
              margin-bottom: 0 !important;
              padding: 6px 10px !important;
            }
            .settings-nav-sidebar button div div:last-child {
              display: none !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
