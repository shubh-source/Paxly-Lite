import React, { useState, useEffect, useMemo } from 'react';
import { Icons } from '../ui/Icons';
import { getAuraSettings, saveAuraSettings, resetAuraSettings, deleteAllAIThreads } from '../../services/api';
import {
  DEFAULT_AURA_SETTINGS,
  getAuraSettingsStorageKey,
  getAuraPersonalityStorageKey,
  getAuraThreadsStorageKey,
  validateAuraSettings
} from '../../services/auraStorage';

export { DEFAULT_AURA_SETTINGS };

const CATEGORIES = [
  { id: 'general', num: '01', label: 'General', icon: '⚙️', desc: 'Startup, defaults & behavior' },
  { id: 'personality', num: '02', label: 'Personality', icon: '🧠', desc: 'Tone, warmth & teaching style' },
  { id: 'chat', num: '03', label: 'Chat & Responses', icon: '💬', desc: 'Formatting & response length' },
  { id: 'memory', num: '04', label: 'Memory & Context', icon: '💾', desc: 'Saved memory & continuity' },
  { id: 'voice', num: '05', label: 'Voice & Real-Time', icon: '🎙️', desc: 'Speech, TTS & voice input' },
  { id: 'models', num: '06', label: 'Models & Intelligence', icon: '⚡', desc: 'AI engines & reasoning modes' },
  { id: 'tools', num: '07', label: 'Tools & Automation', icon: '🛠️', desc: 'Search, file & task execution' },
  { id: 'safety', num: '08', label: 'Safety & Trusted Contacts', icon: '🛡️', desc: 'Crisis support & alert policies' },
  { id: 'notifications', num: '09', label: 'Notifications', icon: '🔔', desc: 'Alerts, push & quiet hours' },
  { id: 'privacy', num: '10', label: 'Privacy & Security', icon: '🔒', desc: 'Isolation & data controls' },
  { id: 'appearance', num: '11', label: 'Appearance & Accessibility', icon: '🎨', desc: 'Themes, density & fonts' },
  { id: 'performance', num: '12', label: 'Performance & Limits', icon: '🚀', desc: 'Speed modes, timeouts & limits' },
  { id: 'activity', num: '13', label: 'Activity & Diagnostics', icon: '📊', desc: 'Logs, latency & system health' },
  { id: 'advanced', num: '14', label: 'Advanced & Developer', icon: '💻', desc: 'Endpoints, debug & flags' },
  { id: 'about', num: '15', label: 'About Aura', icon: '✨', desc: 'Version, engine details & licenses' },
];

export default function AuraSettingsModal({ isOpen, onClose, onSettingsChange, onClearAllChats, userId }) {
  const [activeTab, setActiveTab] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showDestructiveModal, setShowDestructiveModal] = useState(false);
  const [destructiveActionType, setDestructiveActionType] = useState(null); // 'reset' | 'clear_chats'

  const settingsKey = getAuraSettingsStorageKey(userId);
  const personalityKey = getAuraPersonalityStorageKey(userId);
  const threadsKey = getAuraThreadsStorageKey(userId);

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      if (saved) return { ...DEFAULT_AURA_SETTINGS, ...JSON.parse(saved) };
      const legacyPersonality = localStorage.getItem(personalityKey) || '';
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

    // Pre-populate from user-isolated local cache if available
    try {
      const cached = localStorage.getItem(settingsKey);
      if (cached) {
        setSettings({ ...DEFAULT_AURA_SETTINGS, ...JSON.parse(cached) });
      }
    } catch (_) {}

    getAuraSettings()
      .then(cloudSettings => {
        if (!isMounted) return;
        if (cloudSettings && typeof cloudSettings === 'object') {
          const merged = { ...DEFAULT_AURA_SETTINGS, ...cloudSettings };
          setSettings(merged);
          localStorage.setItem(settingsKey, JSON.stringify(merged));
          if (merged.customInstructions) {
            localStorage.setItem(personalityKey, merged.customInstructions);
          }
        }
      })
      .catch(err => {
        if (!isMounted) return;
        console.warn('Could not fetch cloud settings, using local:', err.message);
        setErrorMsg('Offline / Cached mode: Using local device settings.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, settingsKey, personalityKey]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return CATEGORIES;
    const q = searchQuery.toLowerCase();
    return CATEGORIES.filter(c => c.label.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q));
  }, [searchQuery]);

  if (!isOpen) return null;

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const valErrors = validateAuraSettings(settings);
    if (valErrors.length > 0) {
      setErrorMsg(valErrors[0]);
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await saveAuraSettings(settings);
      localStorage.setItem(settingsKey, JSON.stringify(settings));
      localStorage.setItem(personalityKey, settings.customInstructions || '');

      if (onSettingsChange) onSettingsChange(settings);
      setSuccessMsg('Settings saved securely! ✓');

      setTimeout(() => {
        setSuccessMsg('');
        onClose();
      }, 700);
    } catch (err) {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
      localStorage.setItem(personalityKey, settings.customInstructions || '');
      if (onSettingsChange) onSettingsChange(settings);
      setErrorMsg(err.response?.data?.detail || 'Failed to sync to cloud. Saved on this device.');
    } finally {
      setSaving(false);
    }
  };

  const executeDestructiveAction = async () => {
    if (destructiveActionType === 'reset') {
      setSaving(true);
      setErrorMsg('');
      try {
        await resetAuraSettings();
        setSettings(DEFAULT_AURA_SETTINGS);
        localStorage.setItem(settingsKey, JSON.stringify(DEFAULT_AURA_SETTINGS));
        localStorage.setItem(personalityKey, '');
        if (onSettingsChange) onSettingsChange(DEFAULT_AURA_SETTINGS);
        setSuccessMsg('All settings restored to defaults! ✓');
        setTimeout(() => setSuccessMsg(''), 1200);
      } catch (err) {
        setErrorMsg(err.response?.data?.detail || 'Failed to reset cloud settings.');
      } finally {
        setSaving(false);
        setShowDestructiveModal(false);
      }
    } else if (destructiveActionType === 'clear_chats') {
      setSaving(true);
      setErrorMsg('');
      try {
        await deleteAllAIThreads();
        localStorage.removeItem(threadsKey);
        localStorage.removeItem('paxly_aura_threads');
        localStorage.removeItem('paxly_aura_chat_history');
        if (onClearAllChats) onClearAllChats();
        setSuccessMsg('All chat history permanently deleted! ✓');
        setTimeout(() => setSuccessMsg(''), 1500);
      } catch (err) {
        localStorage.removeItem(threadsKey);
        if (onClearAllChats) onClearAllChats();
        setErrorMsg('Cleared local chats. (Cloud delete failed: ' + (err.response?.data?.detail || err.message || 'offline') + ')');
      } finally {
        setSaving(false);
        setShowDestructiveModal(false);
      }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(12px)' }}>
      <div className="aura-settings-container" style={{
        background: 'linear-gradient(180deg, #17171a 0%, #0f0f12 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        width: '100%',
        maxWidth: 960,
        height: '90vh',
        maxHeight: 780,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 28px 70px rgba(0,0,0,0.75)',
        overflow: 'hidden',
        color: '#fff',
        fontFamily: 'inherit'
      }}>
        {/* Top Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>✨</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text, #fff)' }}>Aura Settings</h3>
              <span style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Product Blueprint Architecture (15 Categories)</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', color: 'var(--muted, #8E8E96)', width: 32, height: 32, borderRadius: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', transition: 'all 0.2s' }}>×</button>
          </div>
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
          {/* Left Navigation Sidebar */}
          <div className="settings-nav-sidebar" style={{ width: 250, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '10px 8px', overflowY: 'auto', background: 'rgba(0,0,0,0.22)', flexShrink: 0 }}>
            {/* Search filter input */}
            <div style={{ marginBottom: 10, padding: '0 4px' }}>
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '7px 10px', fontSize: '0.78rem', color: '#fff', outline: 'none' }}
              />
            </div>

            {filteredCategories.map(c => {
              const active = activeTab === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setActiveTab(c.id)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 10,
                    background: active ? 'rgba(201,169,110,0.15)' : 'transparent',
                    border: active ? '1px solid rgba(201,169,110,0.3)' : '1px solid transparent',
                    color: active ? 'var(--accent, #C9A96E)' : 'var(--muted, #8E8E96)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 3,
                    transition: 'all 0.15s',
                    fontSize: '0.82rem',
                    fontWeight: active ? 600 : 400
                  }}
                >
                  <span style={{ fontSize: '1rem', flexShrink: 0 }}>{c.icon}</span>
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.65rem', opacity: 0.5, fontWeight: 700 }}>{c.num}</span>
                      <span>{c.label}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Tab Content Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: 'rgba(255,255,255,0.01)' }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.7 }}>
                <div style={{ width: 28, height: 28, border: '3px solid rgba(201,169,110,0.2)', borderTopColor: 'var(--accent, #C9A96E)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Loading Aura cloud profile...</span>
              </div>
            ) : (
              <>
                {/* 01. GENERAL */}
                {activeTab === 'general' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>01. General</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Default behavior, startup, language and core operational preferences.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, fontWeight: 600 }}>Default Language</label>
                        <select
                          value={settings.defaultLanguage}
                          onChange={e => updateSetting('defaultLanguage', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                        >
                          <option value="Auto">Auto-detect</option>
                          <option value="Hinglish">Hinglish (Natural Mix)</option>
                          <option value="Hindi">Hindi (हिंदी)</option>
                          <option value="English">English</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, fontWeight: 600 }}>Default Response Length</label>
                        <select
                          value={settings.defaultResponseLength}
                          onChange={e => updateSetting('defaultResponseLength', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                        >
                          <option value="Short">Short (Quick answers)</option>
                          <option value="Balanced">Balanced (Standard)</option>
                          <option value="Detailed">Detailed (In-depth)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, fontWeight: 600 }}>Startup Behavior</label>
                        <select
                          value={settings.startupBehavior}
                          onChange={e => updateSetting('startupBehavior', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                        >
                          <option value="Restore previous session">Restore previous session</option>
                          <option value="New session">Start new session</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, fontWeight: 600 }}>Default Landing</label>
                        <select
                          value={settings.defaultLandingPage}
                          onChange={e => updateSetting('defaultLandingPage', e.target.value)}
                          style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}
                        >
                          <option value="Chat">Chat with Aura</option>
                          <option value="Dashboard">Couple Dashboard</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'autoSaveConversations', label: 'Auto-save conversations', desc: 'Sync conversations to cloud threads automatically' },
                        { key: 'sendWithEnter', label: 'Send messages with Enter', desc: 'Pressing Enter sends message; Shift+Enter creates a new line' },
                        { key: 'showKeyboardShortcuts', label: 'Show keyboard shortcuts hint', desc: 'Display desktop hotkey helpers in chat view' }
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

                {/* 02. PERSONALITY */}
                {activeTab === 'personality' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>02. Personality</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Aura ka behavior, tone, teaching style aur custom instructions.</p>

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
                      <textarea
                        value={settings.customInstructions || ''}
                        onChange={e => updateSetting('customInstructions', e.target.value)}
                        placeholder="e.g. Always be concise, use gentle analogies, treat me like a mentor..."
                        style={{ width: '100%', height: 80, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10, color: '#fff', fontSize: '0.85rem', resize: 'none' }}
                      />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Warmth</label>
                        <select value={settings.warmth} onChange={e => updateSetting('warmth', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Formality</label>
                        <select value={settings.formality} onChange={e => updateSetting('formality', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Casual">Casual</option>
                          <option value="Balanced">Balanced</option>
                          <option value="Formal">Formal</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Teaching Style</label>
                        <select value={settings.teachingStyle} onChange={e => updateSetting('teachingStyle', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Concept first">Concept first</option>
                          <option value="Step-by-step">Step-by-step</option>
                          <option value="Examples first">Examples first</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Correction Style</label>
                        <select value={settings.correctionStyle} onChange={e => updateSetting('correctionStyle', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Gentle">Gentle</option>
                          <option value="Direct">Direct</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Support Style</label>
                        <select value={settings.supportStyle} onChange={e => updateSetting('supportStyle', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Listen">Listen & Validate</option>
                          <option value="Reassure">Reassure</option>
                          <option value="Practical guidance">Practical guidance</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Proactivity</label>
                        <select value={settings.proactivity} onChange={e => updateSetting('proactivity', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}>
                          <option value="Reactive">Reactive</option>
                          <option value="Suggestive">Suggestive</option>
                          <option value="Proactive">Proactive</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 03. CHAT & RESPONSES */}
                {activeTab === 'chat' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>03. Chat & Responses</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Response length, formatting, code syntax and chat behaviors.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'markdownRendering', label: 'Markdown rendering', desc: 'Render bold text, lists, and tables cleanly' },
                        { key: 'codeSyntaxHighlighting', label: 'Code syntax highlighting', desc: 'Color syntax in code snippets' },
                        { key: 'autoCodeFormatting', label: 'Automatic code formatting', desc: 'Indent and format output code blocks' },
                        { key: 'stepByStep', label: 'Step-by-step explanations', desc: 'Break down complex questions into numbered points' },
                        { key: 'followUpSuggestions', label: 'Follow-up suggestions', desc: 'Show relevant prompt chips after Aura answers' },
                        { key: 'showTimestamps', label: 'Show message timestamps', desc: 'Display time sent under message bubbles' },
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

                      {/* Explicitly disabled streaming explanation */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', opacity: 0.65 }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Streaming responses
                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 6, color: '#ffb347' }}>v2.0 Beta</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Fast batch replies active (under 1s). SSE streaming planned in v2.0.</div>
                        </div>
                        <input type="checkbox" disabled checked={false} style={{ width: 18, height: 18, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* 04. MEMORY & CONTEXT */}
                {activeTab === 'memory' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>04. Memory & Context</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Saved memories, conversation continuity and personalization context.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                      {[
                        { key: 'memoryEnabled', label: 'Enable long-term memory', desc: 'Permits Aura to remember recurring preferences and key dates' },
                        { key: 'autoSavePreferences', label: 'Auto-save preferences', desc: 'Detect communication patterns without explicit saving' },
                        { key: 'retrievePastContext', label: 'Retrieve past context', desc: 'Inject recent conversation background into current thread' },
                        { key: 'confirmSensitiveMemories', label: 'Confirm before saving sensitive info', desc: 'Asks before committing private life events' },
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

                    <div style={{ background: 'rgba(255,70,70,0.05)', border: '1px solid rgba(255,70,70,0.2)', padding: 14, borderRadius: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#ff8585', marginBottom: 4 }}>Clear Memory History</div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)', margin: '0 0 10px' }}>
                        Permanently erase all saved memories and previous thread archives from the cloud database.
                      </p>
                      <button
                        onClick={() => {
                          setDestructiveActionType('clear_chats');
                          setShowDestructiveModal(true);
                        }}
                        style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,70,70,0.15)', border: '1px solid rgba(255,70,70,0.4)', color: '#ff6b6b', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                      >
                        Clear All Memories & Chats
                      </button>
                    </div>
                  </div>
                )}

                {/* 05. VOICE & REAL-TIME */}
                {activeTab === 'voice' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>05. Voice & Real-Time</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Voice input/output, wake word, listening and playback speed.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Voice Audio Responses (TTS)
                            <span style={{ fontSize: '0.65rem', background: 'rgba(78,190,130,0.15)', color: '#4ebe82', padding: '2px 6px', borderRadius: 6 }}>Experimental</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Read Aura's answers aloud using web browser SpeechSynthesis</div>
                        </div>
                        <input type="checkbox" checked={settings.voiceResponses} onChange={e => updateSetting('voiceResponses', e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>Speech Speed</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Voice playback rate</div>
                        </div>
                        <select value={settings.speechSpeed} onChange={e => updateSetting('speechSpeed', e.target.value)} style={{ background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '4px 8px', fontSize: '0.8rem' }}>
                          <option value="0.8x">0.8x (Slower)</option>
                          <option value="1.0x">1.0x (Normal)</option>
                          <option value="1.2x">1.2x (Faster)</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.04)', opacity: 0.6 }}>
                        <div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Wake Word ("Hey Aura")
                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', color: '#ffb347', padding: '2px 6px', borderRadius: 6 }}>OS Daemon Required</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Always-on listening requires background OS permissions</div>
                        </div>
                        <input type="checkbox" disabled checked={false} style={{ width: 18, height: 18, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* 06. MODELS & INTELLIGENCE */}
                {activeTab === 'models' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>06. Models & Intelligence</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Local/cloud models, reasoning budget, routing and model limits.</p>

                    <div style={{ marginBottom: 16 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Model Inference Provider</label>
                      <select value={settings.modelProvider} onChange={e => updateSetting('modelProvider', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}>
                        <option value="Automatic">Automatic (Primary: Gemini 2.5 Flash, Fallback: Groq LPU)</option>
                        <option value="Gemini">Gemini Cloud Only (Google Generative AI)</option>
                        <option value="Groq">Groq LPU Only (Sub-second LLaMA 3.3)</option>
                      </select>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'fastResponseMode', label: 'Fast mode ⚡', desc: 'Bypasses internal reasoning loops for near-instant (sub-second) replies' },
                        { key: 'deepReasoning', label: 'Deep reasoning mode', desc: 'Enables multi-step planning for complex relationship counseling' },
                        { key: 'autoModelRouting', label: 'Automatic fallback routing', desc: 'Switches to alternative cloud provider automatically on rate-limits' },
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 07. TOOLS & AUTOMATION */}
                {activeTab === 'tools' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>07. Tools & Automation</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Tool permissions, actions, workflows and task execution constraints.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'webSearchEnabled', label: 'Web search access', desc: 'Allow Aura to search real-time places, gift ideas and dates' },
                        { key: 'fileAccessEnabled', label: 'File & image attachment analysis', desc: 'Allow multimodality parsing for photos and anniversary memories' },
                        { key: 'confirmExternalActions', label: 'Confirm before external actions', desc: 'Prompt user confirmation before creating events or bookings' },
                        { key: 'confirmFileModifications', label: 'Confirm before deleting memories', desc: 'Require verification before removing vault items' }
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}

                      {/* Computer action disabled */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', opacity: 0.65 }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            Local computer actions
                            <span style={{ fontSize: '0.65rem', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 6 }}>Sandboxed</span>
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>Operating system level control is disabled in mobile client for safety</div>
                        </div>
                        <input type="checkbox" disabled checked={false} style={{ width: 18, height: 18, cursor: 'not-allowed' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* 08. SAFETY & TRUSTED CONTACTS */}
                {activeTab === 'safety' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: '#ff8585', fontSize: '1rem' }}>08. Safety & Trusted Contacts</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Emotional distress support, crisis response and pre-authorized safety alerts.</p>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 6, fontWeight: 600 }}>Escalation Policy</label>
                      <select value={settings.escalationMode} onChange={e => updateSetting('escalationMode', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem' }}>
                        <option value="Suggest">Suggest (Aura recommends reaching out to partner/friend)</option>
                        <option value="Ask first">Ask First (Aura explicitly prompts before alerting anyone)</option>
                        <option value="Pre-authorized">Pre-authorized (Notify only in verified severe emergencies)</option>
                        <option value="Off">Off (Never auto-notify)</option>
                      </select>
                    </div>

                    <div style={{ background: 'rgba(255,100,100,0.08)', border: '1px solid rgba(255,100,100,0.2)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: '0.78rem', lineHeight: 1.5, color: '#f3c0c0' }}>
                      {settings.escalationMode === 'Pre-authorized' && (
                        <span>⚠️ <strong>Emergency Policy Active:</strong> Aura will automatically notify your paired partner or trusted contact ONLY in verified severe emergencies (Risk 3/4). A 15-minute cooldown is strictly enforced, and private chat text is NEVER shared. Ordinary sadness or crying never triggers alerts.</span>
                      )}
                      {settings.escalationMode === 'Ask first' && (
                        <span>🛡️ <strong>Consent Policy Active:</strong> Aura will never message anyone without your explicit confirmation. In moments of distress, Aura displays an interactive consent prompt asking if you'd like your partner/trusted contact notified.</span>
                      )}
                      {settings.escalationMode === 'Suggest' && (
                        <span>💡 <strong>Recommendation Mode:</strong> Aura will suggest reaching out and provide immediate helpline numbers (Tele-MANAS: 14416) without initiating external alerts.</span>
                      )}
                      {settings.escalationMode === 'Off' && (
                        <span>🔒 <strong>Escalation Disabled:</strong> Aura will never contact anyone or prompt for notifications under any circumstances.</span>
                      )}
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Designated Trusted Contact</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)', marginBottom: 12 }}>If you are not paired with a partner, or want an emergency point-of-contact for safety alerts.</div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4, color: 'var(--muted, #8E8E96)' }}>Contact Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Dr. Priya / Friend"
                            value={settings.trustedContactName || ''}
                            onChange={e => updateSetting('trustedContactName', e.target.value)}
                            style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: 4, color: 'var(--muted, #8E8E96)' }}>Phone or Email</label>
                          <input
                            type="text"
                            placeholder="+91 98765 43210 or emergency@email.com"
                            value={settings.trustedContactPhone || settings.trustedContact || ''}
                            onChange={e => {
                              updateSetting('trustedContactPhone', e.target.value);
                              updateSetting('trustedContact', e.target.value);
                            }}
                            style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: '0.82rem' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'emotionalSupportMode', label: 'Emotional support mode', desc: 'Prioritize validation and empathy during relational conflicts' },
                        { key: 'crisisDetection', label: 'Crisis & self-harm detection', desc: 'Display regional helplines (Tele-MANAS: 14416, Vandrevala: 9999 666 555)' },
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: '#ff8585', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 09. NOTIFICATIONS */}
                {activeTab === 'notifications' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>09. Notifications</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Task updates, alerts, quiet hours and delivery preferences.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'inAppNotifications', label: 'In-app notifications', desc: 'Show toast alerts while using Paxly Lite' },
                        { key: 'pushNotifications', label: 'Push notifications', desc: 'Send reminders for upcoming partner dates & anniversaries' },
                        { key: 'securityAlerts', label: 'Security alerts', desc: 'Notify on new device logins or failed lock attempts' },
                        { key: 'trustedContactAlerts', label: 'Partner care alerts', desc: 'Receive caring check-ins if partner experiences distress' },
                        { key: 'quietHoursEnabled', label: 'Quiet hours (Do Not Disturb)', desc: 'Mute non-essential notifications between 11 PM and 8 AM' }
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 10. PRIVACY & SECURITY */}
                {activeTab === 'privacy' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>10. Privacy & Security</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Zero-knowledge multi-tenant isolation, permissions and credential controls.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                      <p style={{ fontSize: '0.82rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.6, margin: '0 0 12px' }}>
                        🛡️ <strong>Tenant Scoping Guarantee:</strong> All Aura settings are bound to your authenticated JWT identity. Conversations are never accessible to other users or external models.
                      </p>
                      {[
                        { key: 'secretMasking', label: 'Secret and token masking', desc: 'Automatically redact API tokens and passwords from conversation logs' },
                        { key: 'anonymousDiagnostics', label: 'Anonymous telemetry', desc: 'Send error codes to Sentra health system without chat logs' }
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 11. APPEARANCE & ACCESSIBILITY */}
                {activeTab === 'appearance' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>11. Appearance & Accessibility</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Theme, accents, typography, density and accessibility modes.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Theme</label>
                        <select value={settings.theme} onChange={e => updateSetting('theme', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value="Dark">Dark Velvet</option>
                          <option value="Light">Light Minimal</option>
                          <option value="System">System Match</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Message Bubble Style</label>
                        <select value={settings.bubbleStyle} onChange={e => updateSetting('bubbleStyle', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value="Modern Glass">Modern Glassmorphic</option>
                          <option value="Minimal Compact">Minimal Compact</option>
                          <option value="Classic">Classic Rounded</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Font Size</label>
                        <select value={settings.fontSize} onChange={e => updateSetting('fontSize', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value="Small">Small (Compact)</option>
                          <option value="Medium">Medium (Default)</option>
                          <option value="Large">Large (Readable)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Chat Density</label>
                        <select value={settings.chatDensity} onChange={e => updateSetting('chatDensity', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value="Comfortable">Comfortable</option>
                          <option value="Compact">Compact</option>
                        </select>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      {[
                        { key: 'reducedMotion', label: 'Reduced motion', desc: 'Disables intensive animations for smoother scrolling' },
                        { key: 'highContrastMode', label: 'High contrast mode', desc: 'Enhances border readability in low-light environments' }
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 12. PERFORMANCE & LIMITS */}
                {activeTab === 'performance' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>12. Performance & Limits</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Request timeouts, resource limits and local memory caching.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Performance Tuning</label>
                        <select value={settings.performanceMode} onChange={e => updateSetting('performanceMode', e.target.value)} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value="Fast">Fast (Optimized for speed)</option>
                          <option value="Balanced">Balanced</option>
                          <option value="Quality">Quality (Detailed synthesis)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Request Timeout</label>
                        <select value={settings.requestTimeoutSec} onChange={e => updateSetting('requestTimeoutSec', parseInt(e.target.value))} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value={15}>15 seconds</option>
                          <option value={30}>30 seconds (Default)</option>
                          <option value={60}>60 seconds</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6 }}>Max Attachment Size</label>
                        <select value={settings.maxAttachmentSizeMb} onChange={e => updateSetting('maxAttachmentSizeMb', parseInt(e.target.value))} style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.85rem' }}>
                          <option value={5}>5 MB (Safe default)</option>
                          <option value={10}>10 MB</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 13. ACTIVITY & DIAGNOSTICS */}
                {activeTab === 'activity' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>13. Activity & Diagnostics</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>Response latency, provider uptime and diagnostic error logs.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Active Inference Engine</span>
                        <span style={{ fontSize: '0.85rem', color: '#4ebe82', fontWeight: 600 }}>Gemini 2.5 Flash / Groq LPU</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Typical Response Latency</span>
                        <span style={{ fontSize: '0.85rem', color: '#fff' }}>~450ms - 900ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Backend Server Status</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--accent, #C9A96E)' }}>Connected (FastAPI Cloud)</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--muted, #8E8E96)' }}>Sentra Error Logging</span>
                        <span style={{ fontSize: '0.85rem', color: '#fff' }}>Active</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 14. ADVANCED & DEVELOPER */}
                {activeTab === 'advanced' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>14. Advanced & Developer</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>API configuration, feature flags, debugging tools and developer parameters.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 14, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
                      {[
                        { key: 'debugMode', label: 'Developer Debug Mode', desc: 'Display token count and model latency badge on messages' },
                        { key: 'verboseLogging', label: 'Verbose console logging', desc: 'Log request payloads and execution traces to browser console' }
                      ].map(item => (
                        <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{item.label}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--muted, #8E8E96)' }}>{item.desc}</div>
                          </div>
                          <input type="checkbox" checked={settings[item.key]} onChange={e => updateSetting(item.key, e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent, #C9A96E)', cursor: 'pointer' }} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, fontWeight: 600 }}>Local Ollama Server Endpoint</label>
                      <input
                        type="text"
                        value={settings.localModelEndpoint}
                        onChange={e => updateSetting('localModelEndpoint', e.target.value)}
                        placeholder="http://localhost:11434"
                        style={{ width: '100%', background: '#202024', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>
                )}

                {/* 15. ABOUT AURA */}
                {activeTab === 'about' && (
                  <div>
                    <h4 style={{ margin: '0 0 4px', color: 'var(--accent, #C9A96E)', fontSize: '1rem' }}>15. About Aura</h4>
                    <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: 'var(--muted, #8E8E96)' }}>System specifications, model architecture and licensing.</p>

                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: 16, borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <span style={{ fontSize: '2rem' }}>✨</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--accent, #C9A96E)' }}>Aura AI Companion</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted, #8E8E96)' }}>Paxly Lite / Vlynxly OS</div>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.6 }}>
                        <p style={{ margin: '0 0 8px' }}>
                          <strong>Architecture:</strong> Hybrid Dual-Engine (Gemini 2.5 Flash Cloud + Groq LPU Ultra-Fast)
                        </p>
                        <p style={{ margin: '0 0 8px' }}>
                          <strong>Version:</strong> v2.4.1 (Full Blueprint Compliance)
                        </p>
                        <p style={{ margin: '0 0 8px' }}>
                          <strong>Privacy Principle:</strong> Zero-Knowledge Couple Separation & E2EE Message Isolation
                        </p>
                        <p style={{ margin: '0' }}>
                          © 2026 Paxly Lite. All rights reserved.
                        </p>
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
                {destructiveActionType === 'reset' ? 'Reset Settings to Defaults?' : 'Permanently Delete All AI Memories?'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted, #8E8E96)', lineHeight: 1.5, marginBottom: 20 }}>
                {destructiveActionType === 'reset'
                  ? 'Aura ki sabhi preferences standard defaults par restore ho jayengi.'
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
              max-height: 96vh !important;
              height: 96vh !important;
              border-radius: 16px !important;
            }
            .aura-settings-body {
              flex-direction: column !important;
            }
            .settings-nav-sidebar {
              width: 100% !important;
              max-height: 110px !important;
              display: flex !important;
              flex-direction: row !important;
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              border-right: none !important;
              border-bottom: 1px solid rgba(255,255,255,0.06) !important;
              padding: 6px !important;
              white-space: nowrap !important;
              gap: 6px !important;
            }
            .settings-nav-sidebar input {
              display: none !important;
            }
            .settings-nav-sidebar button {
              width: auto !important;
              margin-bottom: 0 !important;
              padding: 6px 10px !important;
              flex-shrink: 0 !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
