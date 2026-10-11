import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api, { askAI, getAuraSettings } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';
import PremiumUpgrade from '../../components/premium/PremiumUpgrade';
import AuraSettingsModal from '../../components/ai/AuraSettingsModal';
import {
  DEFAULT_AURA_SETTINGS,
  getAuraSettingsStorageKey,
  getAuraPersonalityStorageKey,
  getAuraThreadsStorageKey
} from '../../services/auraStorage';
import ReactMarkdown from 'react-markdown';

export default function AIAssistant() {
  const { user } = useAuth();
  
  // User-isolated cache key helpers
  const threadsKey = getAuraThreadsStorageKey(user?.id);
  const settingsKey = getAuraSettingsStorageKey(user?.id);
  const personalityKey = getAuraPersonalityStorageKey(user?.id);

  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [msgs, setMsgs] = useState([]);

  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null); 
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [importantDates, setImportantDates] = useState([]);
  
  // Custom AI Personality & Settings
  const [customPersonality, setCustomPersonality] = useState(() => {
    try { return localStorage.getItem(personalityKey) || ''; } catch { return ''; }
  });
  const [auraSettings, setAuraSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(settingsKey);
      return saved ? JSON.parse(saved) : DEFAULT_AURA_SETTINGS;
    } catch { return DEFAULT_AURA_SETTINGS; }
  });
  const [showPersonalityModal, setShowPersonalityModal] = useState(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  useEffect(() => {
    api.get('/dates/').then(res => {
      if (Array.isArray(res.data)) {
        setImportantDates(res.data);
        
        // Proactive AI check
        const today = new Date();
        const upcoming = res.data.find(d => {
          if (!d.date) return false;
          const annDate = new Date(d.date);
          annDate.setFullYear(today.getFullYear());
          if (annDate < today) annDate.setFullYear(today.getFullYear() + 1);
          const diff = Math.ceil((annDate - today) / (1000 * 60 * 60 * 24));
          return diff >= 0 && diff <= 7;
        });

        if (user?.is_premium && upcoming) {
          const cacheKey = `paxly_aura_proactive_${upcoming.id}`;
          const lastReminded = localStorage.getItem(cacheKey);
          
          if (!lastReminded || (today.getTime() - parseInt(lastReminded)) > 7 * 24 * 60 * 60 * 1000) {
            setTimeout(() => {
              const annDate = new Date(upcoming.date);
              annDate.setFullYear(today.getFullYear());
              if (annDate < today) annDate.setFullYear(today.getFullYear() + 1);
              const diff = Math.ceil((annDate - today) / (1000 * 60 * 60 * 24));
              
              const daysText = diff === 0 ? "TODAY" : `in ${diff} days`;
              const msg = `Hey! Mujhe yaad aaya ki aapka **${upcoming.title}** aa raha hai ${daysText}! 🎉\nKya humein iske liye koi special surprise, gift ya Vibe Site plan karni chahiye?`;
              
              setMsgs(prev => {
                if (prev.some(m => m.content === msg)) return prev;
                return [...prev, { role: 'assistant', content: msg }];
              });
              
              localStorage.setItem(cacheKey, today.getTime().toString());
            }, 1000);
          }
        }
      }
    }).catch(() => {});
  }, [user?.is_premium]);


  // Load settings on mount and when user switches
  useEffect(() => {
    let isCancelled = false;

    try {
      const localCached = localStorage.getItem(settingsKey);
      if (localCached) {
        setAuraSettings({ ...DEFAULT_AURA_SETTINGS, ...JSON.parse(localCached) });
      }
      const localPers = localStorage.getItem(personalityKey);
      if (localPers) {
        setCustomPersonality(localPers);
      }
    } catch (_) {}

    getAuraSettings()
      .then(cloud => {
        if (isCancelled || !cloud || typeof cloud !== 'object') return;
        const merged = { ...DEFAULT_AURA_SETTINGS, ...cloud };
        setAuraSettings(merged);
        localStorage.setItem(settingsKey, JSON.stringify(merged));
        if (merged.customInstructions) {
          setCustomPersonality(merged.customInstructions);
          localStorage.setItem(personalityKey, merged.customInstructions);
        }
      })
      .catch(() => {});

    return () => { isCancelled = true; };
  }, [user?.id, settingsKey, personalityKey]);

  // Load threads on mount and when user switches
  useEffect(() => {
    // Purge deprecated un-namespaced cache to prevent data leaks across accounts
    localStorage.removeItem('paxly_aura_threads');
    localStorage.removeItem('paxly_aura_chat_history');

    let isCancelled = false;

    const initThreads = async () => {
      try {
        const { data } = await api.get('/ai/threads');
        if (isCancelled) return;

        if (data && data.length > 0) {
          setThreads(data);
          const startFresh = auraSettings?.startupBehavior === 'New session';
          if (startFresh) {
            setActiveThreadId(null);
            setMsgs([]);
          } else {
            setActiveThreadId(prev => prev || data[0].id);
            setMsgs(prev => (prev && prev.length > 0 ? prev : (data[0].messages || [])));
          }
          localStorage.setItem(threadsKey, JSON.stringify(data));
        } else {
          // Server has no threads for this user - do NOT inherit previous user's cached threads!
          const cachedThisUser = localStorage.getItem(threadsKey);
          if (cachedThisUser) {
            try {
              const parsed = JSON.parse(cachedThisUser);
              if (parsed && parsed.length > 0) {
                setThreads(parsed);
                const startFresh = auraSettings?.startupBehavior === 'New session';
                if (startFresh) {
                  setActiveThreadId(null);
                  setMsgs([]);
                } else {
                  setActiveThreadId(parsed[0].id);
                  setMsgs(parsed[0].messages || []);
                }
                return;
              }
            } catch (e) {}
          }
          // Clean state for fresh user
          setThreads([]);
          setActiveThreadId(null);
          setMsgs([]);
        }
      } catch (err) {
        if (isCancelled) return;
        console.error("Failed to load threads from server", err);
        // Load only this user's local cache on offline/error
        const cachedThreads = localStorage.getItem(threadsKey);
        if (cachedThreads) {
          try {
            const parsed = JSON.parse(cachedThreads);
            setThreads(parsed);
            if (parsed.length > 0) {
              const startFresh = auraSettings?.startupBehavior === 'New session';
              if (startFresh) {
                setActiveThreadId(null);
                setMsgs([]);
              } else {
                setActiveThreadId(parsed[0].id);
                setMsgs(parsed[0].messages || []);
              }
            }
          } catch(e) {}
        }
      }
    };

    initThreads();
    return () => { isCancelled = true; };
  }, [user?.id, threadsKey]);

  // Sync active thread messages
  useEffect(() => {
    if (msgs.length === 0) return;
    const threadsKey = getThreadsStorageKey(user?.id);

    if (!activeThreadId) {
      const id = 'thread_' + Date.now();
      const title = msgs[0].content.substring(0, 30) + '...';
      const newThread = { id, title, messages: msgs, updated_at: Date.now() };
      setThreads(prev => {
        const next = [newThread, ...prev];
        localStorage.setItem(threadsKey, JSON.stringify(next));
        return next;
      });
      setActiveThreadId(id);
      api.post('/ai/threads/sync', {id, title, messages: msgs}).catch(()=>{});
    } else {
      const existingThread = threads.find(t => t.id === activeThreadId);
      const title = existingThread ? existingThread.title : "Chat";

      setThreads(prev => {
        const next = prev.map(t => {
          if (t.id === activeThreadId) {
            return { ...t, messages: msgs, updated_at: Date.now() };
          }
          return t;
        });
        localStorage.setItem(threadsKey, JSON.stringify(next));
        return next;
      });
      
      api.post('/ai/threads/sync', {id: activeThreadId, title, messages: msgs}).catch(()=>{});
    }
  }, [msgs, activeThreadId, user?.id]);

  const startNewChat = () => {
    setActiveThreadId(null);
    setMsgs([]);
    setIsDrawerOpen(false);
  };

  const switchThread = (id) => {
    const thread = threads.find(t => t.id === id);
    if (thread) {
      setActiveThreadId(id);
      setMsgs(thread.messages);
      setIsDrawerOpen(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (auraSettings?.fileAccessEnabled === false) {
      alert("File attachment analysis is disabled in your Aura Settings.");
      e.target.value = '';
      return;
    }

    const maxMb = auraSettings?.maxAttachmentSizeMb || 5;
    if (file.size > maxMb * 1024 * 1024) {
      alert(`File is too large! Please select a file under ${maxMb}MB.`);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setAttachment({
        file: file,
        mime_type: file.type,
        data: ev.target.result.split(',')[1],
        preview_url: URL.createObjectURL(file)
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const AI_FREE_LIMIT = 15;

  const send = async (msg) => {
    const content = (msg || text).trim();
    if (!content && !attachment) return;
    if (loading) return;

    if (!user?.is_premium) {
      const today = new Date().toDateString();
      let usage = { date: '', count: 0 };
      try {
        usage = JSON.parse(localStorage.getItem('paxly_ai_usage') || '{}');
      } catch(e) {}
      
      if (usage.date !== today) {
        usage = { date: today, count: 0 };
      }
      
      if (usage.count >= AI_FREE_LIMIT) {
        setMsgs(prev => [...prev, { 
          role: 'assistant', 
          content: "Oops! Aapki aaj ki free AI limit (15 msgs) khatam ho chuki hai. Unlimited chats aur Deep Lab ke liye Premium mein upgrade karein! ✨",
          isPremiumPrompt: true
        }]);
        return;
      }
      usage.count++;
      localStorage.setItem('paxly_ai_usage', JSON.stringify(usage));
    }
    
    const userMsg = { role: 'user', content, timestamp: Date.now() };
    if (attachment) {
      userMsg.attachments = [{ mime_type: attachment.mime_type, data: attachment.data, preview_url: attachment.preview_url }];
    }
    const updated = [...msgs, userMsg];
    setMsgs(updated);
    setText('');
    setAttachment(null);
    setLoading(true);

    try {
      // Logic for contextual "Lab Mode" trigger
      const triggerWords = ['fight', 'tension', 'problem', 'sad', 'angry', 'upset', 'ladayi', 'jhagda', 'breakup'];
      const needsCounseling = triggerWords.some(w => content.toLowerCase().includes(w));

      // Global Context Injection
      let globalContext = '';
      const isMemoryEnabled = auraSettings?.memoryEnabled ?? true;
      const shouldRetrieveContext = auraSettings?.retrievePastContext ?? true;

      if (isMemoryEnabled && importantDates.length > 0) {
        globalContext += "User's Important Dates (anniversaries, birthdays, etc): " + importantDates.map(d => `${d.title} on ${d.date}`).join(' | ') + ". ";
      }
      if (isMemoryEnabled && shouldRetrieveContext && threads.length > 0) {
        const otherThreads = threads.filter(t => t.id !== activeThreadId).slice(0, 3);
        let pastMsgs = [];
        otherThreads.forEach(t => {
          if (t.messages && t.messages.length > 0) {
            pastMsgs.push(...t.messages.slice(-4));
          }
        });
        if (pastMsgs.length > 0) {
           globalContext += "\n\nCRITICAL CONTEXT FROM PAST CHATS (The user expects you to remember these past interactions even in this new chat thread): " + pastMsgs.map(m => `[${m.role}]: ${m.content}`).join(' | ');
        }
      }

      // App Knowledge
      globalContext += "\nApp Knowledge: Vlynxly Premium features: Deep Lab (counseling), Vibe Sites (webpages for partner), Stealth Mode, E2EE chats. You are Aura, the AI guide. CRITICAL RULE: You ONLY talk to the current user. You CANNOT and DO NOT communicate with their partner. NEVER pretend, joke, or hallucinate that you were talking to their partner.";
      
      // Dynamic Personality & Behavior Settings
      if (auraSettings) {
        let behaviorDirectives = [];
        if (auraSettings.preset) behaviorDirectives.push(`Preset: ${auraSettings.preset}`);
        if (auraSettings.warmth) behaviorDirectives.push(`Warmth: ${auraSettings.warmth}`);
        if (auraSettings.formality) behaviorDirectives.push(`Formality: ${auraSettings.formality}`);
        if (auraSettings.humor) behaviorDirectives.push(`Humor: ${auraSettings.humor}`);
        if (auraSettings.directness) behaviorDirectives.push(`Directness: ${auraSettings.directness}`);
        if (auraSettings.teachingStyle) behaviorDirectives.push(`Teaching Style: ${auraSettings.teachingStyle}`);
        if (auraSettings.correctionStyle) behaviorDirectives.push(`Correction Style: ${auraSettings.correctionStyle}`);
        if (auraSettings.supportStyle) behaviorDirectives.push(`Emotional Support Style: ${auraSettings.supportStyle}`);
        if (auraSettings.proactivity) behaviorDirectives.push(`Proactivity: ${auraSettings.proactivity}`);
        if (auraSettings.stepByStep) behaviorDirectives.push('Step-by-step reasoning: Provide numbered structured points');
        if (auraSettings.explanationLevel) behaviorDirectives.push(`Explanation Level: ${auraSettings.explanationLevel}`);
        if (auraSettings.language) behaviorDirectives.push(`Language preference: ${auraSettings.language}`);
        if (auraSettings.responseLength) behaviorDirectives.push(`Response length: ${auraSettings.responseLength}`);
        if (auraSettings.formatStyle) behaviorDirectives.push(`Format preference: ${auraSettings.formatStyle}`);
        if (auraSettings.webSearchEnabled === false) behaviorDirectives.push('Web search disabled: Rely strictly on internal model knowledge');
        if (auraSettings.deepReasoning) behaviorDirectives.push('Deep reasoning: Perform in-depth psychological analysis before concluding');
        
        if (behaviorDirectives.length > 0) {
          globalContext += "\n\nAURA PERSONALITY & BEHAVIOR DIRECTIVES:\n" + behaviorDirectives.join(' | ');
        }
      }

      // Custom User Instructions
      const activeCustomInstructions = auraSettings?.customInstructions || customPersonality;
      if (activeCustomInstructions) {
        globalContext += "\n\nCRITICAL USER INSTRUCTIONS FOR YOUR PERSONALITY/BEHAVIOR:\n" + activeCustomInstructions;
      }

      // Send recent messages for instant response latency
      const aiRequestPayload = updated.slice(-8).map(m => {
        const payload = { role: m.role, content: m.content };
        if (m.attachments) {
          payload.attachments = m.attachments.map(a => ({ mime_type: a.mime_type, data: a.data }));
        }
        return payload;
      });
      if (globalContext) {
        aiRequestPayload.unshift({ role: 'system', content: globalContext });
      }

      if (auraSettings?.verboseLogging) {
        console.log('[Aura AI Request Payload]', aiRequestPayload);
      }

      const startTime = Date.now();
      const { reply } = await askAI(
        aiRequestPayload, 
        auraSettings?.modelProvider || 'Automatic',
        auraSettings?.fastResponseMode ?? true
      );
      const durationMs = Date.now() - startTime;

      if (auraSettings?.verboseLogging) {
        console.log(`[Aura AI Response received in ${durationMs}ms]`, reply);
      }
      
      let finalReply = reply;
      if (needsCounseling && !msgs.some(m => m.isLabPrompt)) {
        finalReply += "\n\nI can help you analyze the situation, but I'll need your **One-Time Permission** to read your recent chat history. Want me to request access for the last (7, 30, or 90) days?";
      }

      // Voice Audio Response (SpeechSynthesis) when enabled
      if (auraSettings?.voiceResponses && typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
          const cleanSpeech = finalReply.replace(/[*_#`[\]()]/g, '').trim();
          const utterance = new SpeechSynthesisUtterance(cleanSpeech);
          if (auraSettings.speechSpeed) {
            utterance.rate = parseFloat(auraSettings.speechSpeed) || 1.0;
          }
          window.speechSynthesis.speak(utterance);
        } catch (ttsErr) {
          console.warn('TTS playback error:', ttsErr);
        }
      }

      setMsgs(prev => [...prev, { 
        role: 'assistant', 
        content: finalReply,
        isLabPrompt: needsCounseling,
        timestamp: Date.now(),
        debugMeta: {
          model: auraSettings?.modelProvider || 'Automatic',
          fast: auraSettings?.fastResponseMode ?? true,
          durationMs
        }
      }]);
    } catch (err) {
      console.error("AI Error:", err);
      let errorMsg;
      const errDetail = err.response?.data?.detail || err.message || "Unknown error";

      if (!err.response || err.message === 'Network Error') {
        errorMsg = "Aura ka server abhi wakeup ho raha hai (Render free tier). Please 30 seconds baad dobara try karein! 🔄";
      } else if (err.response?.status === 503) {
        errorMsg = "Aura ka AI engine configure nahi hua hai. Backend me GOOGLE_API_KEY set karein! 🔑";
      } else {
        errorMsg = `Aura: ${errDetail}`;
      }

      // Force log to backend (even if axios interceptor missed it due to Network Error)
      try {
        fetch(`${import.meta.env.VITE_API_URL || 'https://paxly-lite.onrender.com'}/api/health/report-client-error`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: `[Aura AI Error] ${errDetail}`,
            componentStack: `Status: ${err.response?.status || 'Network Error'} | Endpoint: /api/ai/chat`,
            url: window.location.href
          })
        }).catch(() => {});
      } catch (_) {}

      setMsgs(prev => [...prev, { role: 'assistant', content: errorMsg }]);
    } finally {
      setLoading(false);
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.focus();
      }
    }
  };

  const clearChat = () => {
    if (confirm("Delete this conversation?")) {
      const idToDelete = activeThreadId;
      setThreads(prev => {
        const next = prev.filter(t => t.id !== idToDelete);
        const threadsKey = getThreadsStorageKey(user?.id);
        localStorage.setItem(threadsKey, JSON.stringify(next));
        return next;
      });
      setActiveThreadId(null);
      setMsgs([]);
      if (idToDelete) {
        api.delete('/ai/threads/' + idToDelete).catch(()=>{});
      }
    }
  };

  const handleDeepAnalytics = async () => {
    if (!user?.is_premium) {
      setShowPremiumModal(true);
      return;
    }
    setLoading(true);
    try {
      const { getDeepAnalytics } = await import('../../services/api');
      const data = await getDeepAnalytics();
      setMsgs(prev => [...prev, {
        role: 'assistant',
        content: `**Deep Relationship Analytics Report** 🧠\n\n**Engagement Score:** ${data.engagement_score}/100\n\n**Analysis:**\n${data.analysis}\n\n**Proactive Suggestion:**\n${data.proactive_suggestion}`
      }]);
    } catch (err) {
      setMsgs(prev => [...prev, { role: 'assistant', content: "Failed to generate Deep Analytics. " + (err.response?.data?.detail || err.message) }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>

      {/* Comprehensive Aura Settings Modal */}
      <AuraSettingsModal 
        isOpen={showPersonalityModal}
        onClose={() => setShowPersonalityModal(false)}
        onSettingsChange={(newSettings) => {
          setAuraSettings(newSettings);
          setCustomPersonality(newSettings.customInstructions || '');
        }}
        onClearAllChats={() => {
          setThreads([]);
          setMsgs([]);
          setActiveThreadId(null);
        }}
        userId={user?.id}
      />

      {/* Responsive Header Style */}
      <style>{`
        .ai-assistant-header {
          background: rgba(22,22,24,0.7);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          margin: 14px 16px 0;
          border-radius: 20px;
          padding: 12px 18px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.35);
          flex-shrink: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .ai-header-btn {
          transition: transform 0.15s ease, background 0.2s ease;
        }
        .ai-header-btn:active {
          transform: scale(0.94);
        }
        @media (max-width: 640px) {
          .ai-assistant-header {
            margin: 8px 10px 0 !important;
            padding: 10px 14px !important;
            border-radius: 18px !important;
          }
          .ai-header-desktop-actions {
            display: none !important;
          }
          .ai-header-mobile-action {
            display: block !important;
          }
        }
      `}</style>

      {/* Header */}
      <header className="ai-assistant-header">
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
          <Link to="/dashboard" style={{ color: 'var(--text)', display: 'flex', alignItems: 'center', textDecoration: 'none' }} title="Back to Dashboard">
            <Icons.Back size={20} />
          </Link>
          <button onClick={() => setIsDrawerOpen(true)} style={{ background: 'none', border: 'none', color: 'var(--muted)', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: 0 }} title="Chat History">
            <Icons.Menu size={22} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <Icons.Aura size={18} color="var(--accent)" /> Aura
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', display: 'inline-block' }}></span>
            Always here
          </span>
        </div>

        <div className="ai-header-desktop-actions" style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <button 
            onClick={() => setShowPersonalityModal(true)}
            className="ai-header-btn personality-btn"
            title="Aura Personality"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--muted)', width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Icons.Settings size={17} />
          </button>
          
          <button 
            onClick={handleDeepAnalytics} 
            className="ai-header-btn analytics-btn"
            title="Relationship Analytics"
            style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 600, background: 'rgba(255,255,255,0.08)', padding: '7px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            <span className="ai-btn-text">Analytics</span>
          </button>

          <Link 
            to="/ai/lab" 
            className="ai-header-btn lab-btn"
            title="Aura Deep Lab"
            style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', background: 'rgba(201,169,110,0.12)', padding: '7px 12px', borderRadius: 12, border: '1px solid rgba(201,169,110,0.25)', display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31L4.62 19.4A2 2 0 0 0 6.38 22h11.24a2 2 0 0 0 1.76-2.6L14 9.31V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
            <span className="ai-btn-text">Deep Lab</span>
          </Link>
        </div>

        {/* Mobile Header Quick Action (New Chat) */}
        <div className="ai-header-mobile-action" style={{ display: 'none' }}>
          <button 
            onClick={startNewChat} 
            title="New Chat" 
            style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <Icons.Plus size={18} />
          </button>
        </div>
      </header>

      {/* Drawer */}
      <div style={{ position: 'fixed', top: 0, left: 0, height: '100vh', width: 290, background: 'var(--bg)', borderRight: '1px solid rgba(255,255,255,0.06)', transform: isDrawerOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 1000, display: 'flex', flexDirection: 'column', boxShadow: '10px 0 35px rgba(0,0,0,0.6)' }}>
        
        {/* 1. SBSE UPR: Back to Dashboard & Close */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link to="/dashboard" onClick={() => setIsDrawerOpen(false)} style={{ color: 'var(--text)', textDecoration: 'none', fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.Back size={18} /> Back to Dashboard
          </Link>
          <button onClick={() => setIsDrawerOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1.3rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* 2. THEN: Analytics & Deep Lab (Chat History ke upr) */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 10 }}>
          <button 
            onClick={() => { setIsDrawerOpen(false); handleDeepAnalytics(); }} 
            style={{ flex: 1, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, color: '#fff', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Analytics
          </button>
          <Link 
            to="/ai/lab" 
            onClick={() => setIsDrawerOpen(false)}
            style={{ flex: 1, padding: '10px 12px', background: 'rgba(201,169,110,0.12)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: 12, color: 'var(--accent)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, transition: 'all 0.2s' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.31L4.62 19.4A2 2 0 0 0 6.38 22h11.24a2 2 0 0 0 1.76-2.6L14 9.31V2"></path><line x1="8.5" y1="2" x2="15.5" y2="2"></line><line x1="9" y1="14" x2="15" y2="14"></line></svg>
            Deep Lab
          </Link>
        </div>

        {/* 3. AND THEN: + New Chat & Chat History */}
        <div style={{ padding: '14px 16px 8px' }}>
          <button onClick={() => { setIsDrawerOpen(false); startNewChat(); }} style={{ width: '100%', background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '11px', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.88rem' }}>
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> New Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Chat History</div>
          {threads.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: '0.82rem', padding: '8px 0' }}>No recent chats.</div> : null}
          {threads.map(t => (
            <div 
              key={t.id} 
              onClick={() => { switchThread(t.id); }} 
              style={{ 
                padding: '11px 12px', 
                borderRadius: 10, 
                background: activeThreadId === t.id ? 'rgba(255,255,255,0.1)' : 'transparent', 
                color: activeThreadId === t.id ? 'var(--text)' : 'var(--muted)', 
                cursor: 'pointer', 
                marginBottom: 4, 
                fontSize: '0.85rem', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                border: activeThreadId === t.id ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent'
              }}
            >
              {t.title}
            </div>
          ))}
        </div>

        {/* 4. FIR SBSE NEECHE: Settings (jha pehle back to dashboard tha) */}
        <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button 
            onClick={() => { setIsDrawerOpen(false); setShowPersonalityModal(true); }}
            style={{ width: '100%', background: 'transparent', border: 'none', color: 'var(--muted)', textDecoration: 'none', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: 0 }}
          >
            <Icons.Settings size={18} /> Settings
          </button>
        </div>
      </div>

      {/* Drawer Overlay */}
      {isDrawerOpen && <div onClick={() => setIsDrawerOpen(false)} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999, backdropFilter: 'blur(2px)' }} />}

      <div style={{ textAlign: 'center', padding: '8px 0', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icons.Shield size={12} color="var(--muted)" />
        <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 500, letterSpacing: 0.5 }}>E2EE: AI HAS NO PERMANENT ACCESS TO YOUR CHATS</span>
      </div>

      {/* Chat Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px' }}>
        {msgs.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60, opacity: 0.85 }}>
            <div style={{ fontSize: '3.5rem', marginBottom: 16 }}><Icons.Aura size={56} color="var(--accent)" /></div>
            <h2 style={{ color: 'var(--text)', marginBottom: 8, fontSize: '1.4rem', fontWeight: 600 }}>
              Hey {user?.name?.split(' ')[0]}
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', maxWidth: 260, margin: '0 auto 32px', lineHeight: 1.7 }}>
              Kuch bhi baat karo — jaise ek dost se karte ho. Main yahan hun aapka din aur rishta behtar banane ke liye.
            </p>
            {/* Quick starter chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 320, margin: '0 auto' }}>
              {[
                'Kya chal raha hai? 😊',
                'Aaj kuch suggest karo',
                'Mujhe ek achha date idea chahiye',
                'Yaar baat karni hai',
              ].map(q => (
                <button key={q} onClick={() => send(q)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '8px 16px', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.2s' }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', width: '100%', animation: auraSettings?.reducedMotion ? 'none' : 'fadeInUp 0.3s ease-out' }}>
              {m.role === 'assistant' && (
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 8, flexShrink: 0, alignSelf: 'flex-end' }}>
                  <Icons.Aura size={16} color="#000" />
                </div>
              )}
              <div style={{
                maxWidth: auraSettings?.chatWidth === 'Compact' ? '65%' : '80%',
                padding: auraSettings?.chatDensity === 'Compact' ? '8px 12px' : '12px 18px',
                borderRadius: auraSettings?.bubbleStyle === 'Classic' ? 14 : auraSettings?.bubbleStyle === 'Minimal Compact' ? 8 : 22,
                borderBottomRightRadius: m.role === 'user' ? 4 : (auraSettings?.bubbleStyle === 'Classic' ? 14 : 22),
                borderBottomLeftRadius: m.role === 'user' ? (auraSettings?.bubbleStyle === 'Classic' ? 14 : 22) : 4,
                background: m.role === 'user' ? 'var(--accent)' : auraSettings?.bubbleStyle === 'Minimal Compact' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.06)',
                color: m.role === 'user' ? '#000' : '#fff',
                border: auraSettings?.highContrastMode ? '1px solid rgba(255,255,255,0.35)' : (m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)'),
                backdropFilter: auraSettings?.bubbleStyle === 'Modern Glass' ? 'blur(16px)' : 'none',
                fontSize: auraSettings?.fontSize === 'Small' ? '0.85rem' : auraSettings?.fontSize === 'Large' ? '1.05rem' : '0.95rem',
                lineHeight: 1.6,
                boxShadow: m.role === 'user' ? '0 6px 20px rgba(201,169,110,0.2)' : '0 4px 15px rgba(0,0,0,0.2)',
                whiteSpace: 'pre-wrap',
              }}>
                {m.attachments && m.attachments.map((a, idx) => (
                  <div key={idx} style={{ marginBottom: m.content ? 8 : 0 }}>
                    {a.mime_type.startsWith('image/') ? (
                      <img src={a.preview_url || `data:${a.mime_type};base64,${a.data}`} style={{ maxWidth: '100%', borderRadius: 12, display: 'block' }} alt="attachment" />
                    ) : (
                      <div style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.1)', borderRadius: 8, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Icons.Paperclip size={14} /> Attachment ({a.mime_type.split('/')[1]})
                      </div>
                    )}
                  </div>
                ))}
                {m.role === 'assistant' && (auraSettings?.markdownRendering ?? true) ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  m.content
                )}
                {auraSettings?.showTimestamps && (
                  <div style={{ fontSize: '0.65rem', opacity: 0.5, marginTop: 4, textAlign: 'right' }}>
                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {auraSettings?.debugMode && m.debugMeta && (
                  <div style={{ fontSize: '0.62rem', background: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '2px 6px', marginTop: 4, display: 'inline-block', color: 'var(--accent)' }}>
                    ⚡ {m.debugMeta.model} • {m.debugMeta.fast ? 'Fast LPU' : 'Standard'} • {m.debugMeta.durationMs}ms
                  </div>
                )}
                {m.isPremiumPrompt && (
                  <button onClick={() => setShowPremiumModal(true)} style={{ marginTop: 12, padding: '10px 20px', borderRadius: 20, background: '#000', color: 'var(--accent)', border: 'none', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                    Upgrade to Premium
                  </button>
                )}
                {m.isLabPrompt && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    {[7, 30, 90].map(days => (
                      <Link key={days} to={`/ai/lab?days=${days}`} style={{ background: 'rgba(201,169,110,0.2)', border: '1px solid var(--accent)', color: 'var(--accent)', padding: '6px 12px', borderRadius: 10, fontSize: '0.75rem', textDecoration: 'none', fontWeight: 600 }}>
                        {days} Days
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Follow-up suggestions */}
            {(auraSettings?.followUpSuggestions ?? true) && m.role === 'assistant' && i === msgs.length - 1 && !loading && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, marginLeft: 38, flexWrap: 'wrap' }}>
                {[
                  'Aur detail me batao',
                  'Ek practical example do',
                  'Iska solution kya hai?'
                ].map(chip => (
                  <button
                    key={chip}
                    onClick={() => send(chip)}
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '4px 10px', color: 'var(--muted)', fontSize: '0.72rem', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 4px' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icons.Aura size={16} color="#000" />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '22px 22px 22px 6px', padding: '12px 18px', display: 'flex', gap: 5, alignItems: 'center' }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--purple)', animation: `pulse 0.9s infinite ${d}s` }} />
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input Bar */}
      <div style={{ padding: '8px 16px 20px', flexShrink: 0 }}>
        {attachment && (
          <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 12, width: 'max-content' }}>
            {attachment.mime_type.startsWith('image/') ? (
              <img src={attachment.preview_url} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} alt="preview" />
            ) : (
              <div style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.1)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Icons.Paperclip size={16} color="var(--muted)" />
              </div>
            )}
            <div style={{ flex: 1, fontSize: '0.8rem', color: '#fff', maxWidth: 150, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {attachment.file.name}
            </div>
            <button onClick={() => setAttachment(null)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}>
               <Icons.Close size={16} />
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(22,22,26,0.65)', backdropFilter: 'blur(25px) saturate(200%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 28, padding: '10px 10px 10px 16px', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          <label htmlFor="ai-attach" style={{ cursor: 'pointer', display: 'flex', color: attachment ? 'var(--accent)' : 'var(--muted)', padding: '4px' }} onClick={() => { window.isFilePicking = true; setTimeout(() => { if (!document.hidden) window.isFilePicking = false; }, 2000); }}>
            <Icons.Paperclip size={20} />
          </label>
          <input type="file" id="ai-attach" hidden accept="image/*,video/*,application/pdf" onChange={handleFileSelect} />
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={e => {
              const shouldSendWithEnter = auraSettings?.sendWithEnter ?? true;
              if (shouldSendWithEnter && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Kuch bhi bolo..."
            style={{ flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '1rem', outline: 'none', padding: '6px 0', minWidth: 0, resize: 'none', fontFamily: 'inherit', lineHeight: '1.4' }}
          />
          <button
            onClick={() => send()}
            disabled={loading || (!text.trim() && !attachment)}
            style={{ width: 44, height: 44, borderRadius: '50%', background: (text.trim() || attachment) ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: 'none', cursor: (text.trim() || attachment) ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s', boxShadow: (text.trim() || attachment) ? '0 6px 18px rgba(201,169,110,0.35)' : 'none' }}
          >
            <Icons.Send size={20} color={(text.trim() || attachment) ? '#000' : 'var(--muted)'} />
          </button>
        </div>
        {(auraSettings?.showKeyboardShortcuts ?? true) && (
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textAlign: 'right', marginTop: 4, opacity: 0.7 }}>
            Enter ↵ to send • Shift+Enter for new line
          </div>
        )}
      </div>
      
      {showPremiumModal && (
        <PremiumUpgrade 
          onCancel={() => setShowPremiumModal(false)}
          onUpgradeSuccess={() => {
            setShowPremiumModal(false);
            window.location.reload();
          }}
        />
      )}

      <style>{`
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.1); } }
      `}</style>
    </div>
  );
}
