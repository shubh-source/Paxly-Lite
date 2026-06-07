import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { wsService } from '../../services/websocket';
import { getMessages, getSpace, uploadMedia } from '../../services/api';
import { format } from 'date-fns';
import SecureViewer from '../../components/SecureViewer';
import ThemePicker from './ThemePickerDraft';
import DynamicPresence from '../../components/chat/DynamicPresence';
import VlynxlyStudio from '../../components/chat/VlynxlyStudio';
import ChatBackground from '../../components/chat/ChatBackgroundDraft';
import { CHAT_THEMES } from '../../data/chatThemesDraft';
import PremiumUpgrade from '../../components/premium/PremiumUpgrade';
import axios from 'axios';
import { Icons } from '../../components/ui/Icons';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';

export default function ChatDraft() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState(() => {
    try { 
      const cached = JSON.parse(localStorage.getItem('cached_messages'));
      if (cached && cached.length > 0) return cached;
    } catch {}
    return [
      { id: '1', sender_id: 'partner', text: 'Hey, I wanted to show you the new themes! 😊', timestamp: new Date(Date.now() - 60000).toISOString() },
      { id: '2', sender_id: user?.id || 'me', text: 'Wow, this looks amazing! The animated background is so cool.', timestamp: new Date().toISOString() }
    ];
  });
  const [text, setText] = useState('');
  const [partner, setPartner] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_partner')) || { name: 'Sneha (Preview)' }; } catch { return { name: 'Sneha (Preview)' }; }
  });
  const [typing, setTyping]           = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [sending, setSending]         = useState(false);

  // Voice
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecorder, setAudioRecorder]       = useState(null);
  const audioChunks = useRef([]);

  // Security / media
  const [pendingFile, setPendingFile]                   = useState(null);
  const [showGallerySecureModal, setShowGallerySecureModal] = useState(false);
  const [unblurred, setUnblurred]                       = useState({});
  const [viewingSecureMsg, setViewingSecureMsg]         = useState(null);

  // Presence / theme
  const [space, setSpace] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_space'))?.space || null; } catch { return null; }
  });
  const [showThemePicker, setShowThemePicker]   = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [partnerPresence, setPartnerPresence]   = useState('idle');
  const [partnerMood, setPartnerMood]           = useState('neutral');
  const [selfMood]                              = useState('neutral');
  const [showingStudio, setShowingStudio]       = useState(false);

  // Save requests
  const [saveRequest, setSaveRequest]   = useState(null);
  const [requestingSave, setRequestingSave] = useState(false);

  const bottomRef  = useRef(null);
  const typingTimer = useRef(null);
  const fileRef    = useRef(null);
  const scrollRef  = useRef(null);

  // Prevent body scrolling while in immersive chat
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    
    document.body.style.overflow = 'hidden'; document.body.style.position = 'fixed'; document.body.style.inset = '0px';
    
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    return () => {
      document.body.style.overflow = originalOverflow;
      
      document.body.style.width = ''; document.body.style.position = ''; document.body.style.inset = '';
      document.body.style.height = '';
    };
  }, []);

  /* ── data + websocket ─────────────────────────────────────── */
  useEffect(() => {
    getSpace().then(d => {
      setPartner(d.partner);
      localStorage.setItem('cached_partner', JSON.stringify(d.partner));
      setSpace(d.space);
      localStorage.setItem('cached_space', JSON.stringify(d));
    });
    getMessages(0, 500).then(data => {
      const sorted = [...data].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      setMsgs(sorted);
      localStorage.setItem('cached_messages', JSON.stringify(sorted));
    });

    const offs = [
      wsService.on('chat_message', msg => setMsgs(p => [...p, msg])),
      wsService.on('typing', d => { if (d.user_id !== user?.id) setTyping(d.is_typing); }),
      wsService.on('presence', d => { if (d.user_id !== user?.id) setPartnerOnline(d.online); }),
      wsService.on('presence_state', d => {
        if (d.user_id !== user?.id) {
          setPartnerPresence(d.state);
          setPartnerMood(d.mood || 'neutral');
          setTyping(d.state === 'typing');
        }
      }),
      wsService.on('reaction', d =>
        setMsgs(p => p.map(m => m.id === d.message_id
          ? { ...m, reactions: { ...m.reactions, [d.user_id]: d.emoji } } : m))
      ),
      wsService.on('media_save_request', d => {
        if (d.sender_id !== user?.id)
          setSaveRequest({ from: partner?.name || 'Partner', ...d });
      }),
      wsService.on('media_save_response', d => {
        if (d.sender_id !== user?.id) {
          setRequestingSave(false);
          if (d.allowed) {
            const a = document.createElement('a');
            a.href = d.media_url;
            a.download = `vlynxly_${Date.now()}`;
            a.click();
          } else alert('Save request denied by partner.');
        }
      }),
    ];
    return () => offs.forEach(f => f());
  }, [user?.id]);

  /* ── auto scroll ──────────────────────────────────────────── */
  // useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* ── self presence ────────────────────────────────────────── */
  useEffect(() => {
    const pulse = st => wsService.send({ type: 'presence_state', state: st, mood: selfMood });
    const onFocus = () => pulse('peeking');
    const onBlur  = () => pulse('idle');
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    pulse('peeking');
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); pulse('idle'); };
  }, [selfMood]);

  useEffect(() => {
    wsService.send({ type: 'presence_state', state: viewingSecureMsg ? 'watching' : 'peeking', mood: selfMood });
  }, [viewingSecureMsg]);

  /* ── iOS viewport fix: resize when keyboard appears ─────── */
  useEffect(() => {
    const onResize = () => {
      // Force repaint on iOS when keyboard opens/closes
      if (scrollRef.current) {
        scrollRef.current.style.maxHeight = '';
        requestAnimationFrame(() => {
          // bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      }
    };
    // window.visualViewport?.addEventListener('resize', onResize);
    // window.visualViewport?.addEventListener('scroll', onResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, []);

  /* ── handlers ─────────────────────────────────────────────── */
  const handleType = e => {
    setText(e.target.value);
    wsService.send({ type: 'presence_state', state: e.target.value ? 'typing' : 'peeking', mood: selfMood });
    wsService.sendTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      wsService.sendTyping(false);
      wsService.send({ type: 'presence_state', state: 'peeking', mood: selfMood });
    }, 1500);
  };

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    wsService.sendMessage(text.trim());
    setText('');
    setSending(false);
  };

  const onFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setShowGallerySecureModal(true);
  };

  const startVoiceRecord = async () => {
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = e => audioChunks.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const file = new File([blob], 'voice_note.webm', { type: 'audio/webm' });
        const { media_url } = await uploadMedia(file);
        wsService.sendMessage('', 'audio', media_url, false, 0);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setAudioRecorder(recorder);
      setIsRecordingAudio(true);
    } catch (err) { console.error('Audio recording failed', err); }
  };

  const stopVoiceRecord = () => {
    if (audioRecorder && isRecordingAudio) { audioRecorder.stop(); setIsRecordingAudio(false); }
  };

  const sendMedia = async (fileToUse, mode = 'standard') => {
    const f = fileToUse || pendingFile;
    if (!f) return;
    setSending(true);
    setShowGallerySecureModal(false);
    try {
      const { media_url } = await uploadMedia(f);
      const isOnceView = mode !== 'standard' && mode !== 'permanent';
      const limit      = mode === 'twice' ? 2 : 1;
      let finalUrl     = media_url;
      if (media_url?.includes('localhost') || media_url?.includes('127.0.0.1')) {
        try { finalUrl = (import.meta.env.VITE_API_URL || '') + new URL(media_url).pathname; } catch {}
      } else if (media_url?.startsWith('/')) {
        finalUrl = (import.meta.env.VITE_API_URL || '') + media_url;
      }
      const type = f.type?.startsWith('video') ? 'video' : 'image';
      wsService.sendMessage('', type, finalUrl, isOnceView, limit);
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSending(false);
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSecureView = msg => {
    if (msg.sender_id === user?.id || msg.views_used >= msg.view_limit) return;
    setViewingSecureMsg(msg);
  };

  const onSecurityEvent = async action => {
    if (!viewingSecureMsg) return;
    try {
      await axios.post(`/api/chat/messages/${viewingSecureMsg.id}/secure-event?action=${action}`);
      if (action === 'view')
        setMsgs(p => p.map(m => m.id === viewingSecureMsg.id ? { ...m, views_used: m.views_used + 1 } : m));
      else if (action === 'compromise')
        setMsgs(p => p.map(m => m.id === viewingSecureMsg.id ? { ...m, is_compromised: true, media_url: null } : m));
    } catch (err) { console.error(err); }
  };

  const updateTheme = async id => {
    // Optimistic update — change instantly in UI
    setSpace(p => ({ ...p, theme_id: id, chat_wallpaper: null }));
    // Also persist to localStorage so it survives refresh
    try {
      const cached = JSON.parse(localStorage.getItem('cached_space') || '{}');
      cached.space = { ...(cached.space || {}), theme_id: id, chat_wallpaper: null };
      localStorage.setItem('cached_space', JSON.stringify(cached));
    } catch {}
    // Save to server (best-effort)
    try {
      await axios.patch('/api/chat/space/theme', { theme_id: id });
    } catch (err) {
      console.warn('Theme save to server failed (UI already updated):', err?.response?.data || err.message);
    }
  };
  const updateWallpaper = url => setSpace(p => ({ ...p, theme_id: 'custom', chat_wallpaper: url }));

  const requestSave = msg => {
    if (msg.sender_id === user?.id) return;
    setRequestingSave(true);
    wsService.sendMediaSaveRequest(msg.media_url, msg.id);
  };
  const respondSave = allowed => {
    if (!saveRequest) return;
    wsService.sendMediaSaveResponse(saveRequest.sender_id, allowed, saveRequest.message_id);
    setSaveRequest(null);
  };

  const isMe      = m => m.sender_id === user?.id || m.sender_id === 'me';
  const ts        = m => m.timestamp ? format(new Date(m.timestamp), 'h:mm a') : '';
  const fixUrl    = url => {
    if (!url) return url;
    if (url.includes('localhost') || url.includes('127.0.0.1'))
      try { return (import.meta.env.VITE_API_URL || '') + new URL(url).pathname; } catch {}
    if (url.startsWith('/')) return (import.meta.env.VITE_API_URL || '') + url;
    return url;
  };

  const activeThemeId = space?.theme_id || 'classic';
  const activeTheme   = CHAT_THEMES[activeThemeId] || CHAT_THEMES.classic;

  /* ── render ───────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Scrollbar hide ── */
        .chat-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .chat-scroll::-webkit-scrollbar { display: none; }

        /* ── Animations ── */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%,80%,100% { transform: scale(0.55); opacity: .35; }
          40%         { transform: scale(1);    opacity: 1;   }
        }
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,90,60,0.5); }
          50%     { box-shadow: 0 0 0 8px rgba(255,90,60,0);  }
        }
        .chat-msg { animation: fadeInUp 0.22s ease-out both; }
        .rec-btn  { animation: recPulse 1s ease-in-out infinite; }

        /* ── Chat outer wrapper ── */
        .chat-root {
          width: 100%;
          height: 100%;
          position: fixed; inset: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #111;
          z-index: 100;
        }

        /* ── Header ── */
        .chat-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          margin: 25px 16px 0;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 10px 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 58px;
          width: calc(100% - 32px);
          transition: box-shadow 0.3s ease, background 0.3s ease;
        }
        .chat-header:hover {
          background: rgba(255,255,255,0.07);
          box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,169,110,0.15), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        /* ── Messages scroll area ── */
        .chat-scroll {
          position: fixed; inset: 0; display: flex; flex-direction: column-reverse; justify-content: flex-start;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          padding: 95px 12px 90px;
          z-index: 1;
        }

        /* ── Input bar ── */
        .chat-input-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 8px 16px;
          display: flex;
          justify-content: center;
        }
        .chat-input-inner {
          display: flex;
          gap: 6px;
          align-items: center;
          background: rgba(26, 20, 18, 0.55);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 26px;
          padding: 7px 7px 7px 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4);
          width: 100%;
        }
        .chat-input-inner input {
          flex: 1; display: flex; flex-direction: column;
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.97rem;
          color: #fff;
          padding: 5px 0;
          min-width: 0;
          /* prevent iOS auto-zoom on focus (font-size must be >= 16px to avoid zoom) */
          font-size: 16px;
        }
        .chat-input-inner input::placeholder { color: rgba(255,255,255,0.35); }

        /* icon buttons in input */
        .chat-icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          /* minimum 44px tap target */
          min-width: 40px;
          min-height: 40px;
          border-radius: 50%;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
        }

        /* send/mic round button */
        .chat-send-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.18s, background 0.18s, box-shadow 0.18s;
          -webkit-tap-highlight-color: transparent;
        }

        /* ── Call icon hover ── */
        .chat-icon-btn:hover {
          background: 
gba(255,255,255,0.06), var(--theme-accent) 15%, transparent);
          transform: scale(1.12);
        }
        .chat-icon-btn {
          transition: background 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .chat-header:hover .chat-icon-btn {
          color: var(--theme-accent);
        }
        .chat-bubble {
          border-radius: 20px;
          overflow: hidden;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          word-break: break-word;
        }

        /* ── PC-specific tweaks ── */
        @media (min-width: 768px) {
          .chat-input-bar { padding: 12px 24px 24px; }
          .chat-scroll { padding: 105px 24px 100px; }
          .chat-bubble { max-width: 65%; }
        }

        /* ── Mobile tweaks ── */
        @media (max-width: 767px) {
          .chat-header { margin: 0; width: 100%; border-radius: 0; }
          .chat-input-bar { padding: 5px 8px 8px; }
          .chat-bubble { max-width: 80%; }
          .chat-input-inner input { font-size: 16px; } /* prevent iOS zoom */
        }

        /* ── Modal ── */
        .chat-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.88);
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .chat-modal-card {
          max-width: 340px;
          width: 100%;
          text-align: center;
          background: #1a1614;
          padding: 28px 24px;
          border-radius: 22px;
          box-shadow: 0 20px 48px rgba(0,0,0,0.6);
        }
      `}</style>

      {/* ── ROOT ────────────────────────────────────────────── */}
      <div
        className="chat-root"
        style={{
          '--theme-accent': activeTheme.accent || '#C9A96E',
          '--theme-bubble-me': activeTheme.bubbleMe || '#C9A96E',
          '--theme-text-me': activeTheme.textMe || '#111',
          '--theme-bubble-other': activeTheme.bubbleOther || 'rgba(255,255,255,0.07)',
          '--theme-text-other': activeTheme.textOther || '#fff',
        }}
      >

        {/* ── BACKGROUND ────────────────────────────────────── */}
        <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none' }}>
          {space?.chat_wallpaper ? (
            <>
              <div style={{ width:'100%', height:'100%', background:`url(${space.chat_wallpaper}) center/cover` }} />
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(4px)' }} />
            </>
          ) : (
            <div style={{ width:'100%', height:'100%', position:'absolute', inset:0, zIndex:0, overflow:'hidden', background: activeTheme.bg || '#0E0C11' }}>
              <div style={{ position: 'absolute', inset: 0, background: activeTheme.bg, backgroundImage: activeTheme.bgImage || 'none', animation: activeTheme.bgAnimation || 'none', backgroundSize: activeTheme.bgAnimation ? '400% 400%' : 'auto', zIndex: 0 }} />
              <div style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}>
                <ChatBackground elements={activeTheme.elements} theme={activeTheme} />
              </div>
            </div>
          )}
        </div>
        <style>{`
          @keyframes auroraAnim {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>

        {/* ── HEADER ───────────────────────────────────────── */}
        <div
          className="chat-header"
          style={{
            background: '#1a1a20',
            borderBottom: `1px solid rgba(255,255,255,0.1)`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Back */}
          <Link to="/dashboard" style={{ color:'#fff', display:'flex', alignItems:'center', flexShrink:0 }}>
            <Icons.Back size={20} />
          </Link>

          {/* Avatar + name */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, cursor:'pointer', minWidth:0, justifyContent: 'center' }} onClick={() => setShowThemePicker(true)}>
            <div style={{
              width:36, height:36, borderRadius:'50%', overflow:'hidden', flexShrink:0,
              background: `linear-gradient(135deg, ${activeTheme.accent || '#a484c2'}88, ${activeTheme.accent || '#7a5f96'}55)`,
              border: `2px solid ${activeTheme.accent || '#C9A96E'}55`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1rem', fontWeight:700, color:'#fff',
              boxShadow: `0 0 12px ${activeTheme.accent || '#C9A96E'}33`,
            }}>
              {partner?.avatar_url
                ? <img src={partner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : (partner?.name?.[0]?.toUpperCase() || 'S')}
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 1 }}>
              <span style={{ fontWeight:700, fontSize:'1rem', color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {partner?.name || 'Sneha'}
              </span>
              <span style={{ fontSize:'0.68rem', color: activeTheme.accent || '#C9A96E', opacity: 0.8, letterSpacing: '0.3px' }}>
                {typing ? 'typing...' : partnerOnline ? 'online' : 'tap to change theme'}
              </span>
            </div>
          </div>

          {/* Call icons */}
          <div style={{ display:'flex', gap:14, flexShrink:0, alignItems: 'center' }}>
            <button
              className="chat-icon-btn"
              style={{ color: activeTheme.accent || 'var(--accent)' }}
              onClick={() => navigate('/call?type=audio')}
              title="Voice Call"
            >
              <Icons.Phone size={18} />
            </button>
            <button
              className="chat-icon-btn"
              style={{ color: activeTheme.accent || 'var(--accent)' }}
              onClick={() => navigate('/call?type=video')}
              title="Video Call"
            >
              <Icons.Video size={20} />
            </button>
          </div>
        </div>

        {/* ── MESSAGES ─────────────────────────────────────── */}
        <div className="chat-scroll" ref={scrollRef}>
          {[...msgs].reverse().map((msg, i) => {
            const me            = isMe(msg);
            const isSecure      = msg.is_once_view;
            const isSpent       = isSecure && msg.views_used >= msg.view_limit;
            const isCompromised = msg.is_compromised;
            const isMedia       = msg.message_type === 'image' || msg.message_type === 'video';

            return (
              <div
                key={msg.id}
                className="chat-msg"
                style={{
                  marginBottom: 9,
                  display:'flex', gap:7,
                  justifyContent: me ? 'flex-end' : 'flex-start',
                  animationDelay: `${Math.min(i * 0.025, 0.25)}s`,
                }}
              >
                {/* Partner avatar */}
                {!me && (
                  <div style={{
                    width:28, height:28, borderRadius:'50%', overflow:'hidden',
                    flexShrink:0, alignSelf:'flex-end',
                    border:'1px solid rgba(255,255,255,0.08)',
                    background:'rgba(255,255,255,0.07)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.7rem', fontWeight:700, color:'var(--accent)',
                  }}>
                    {partner?.avatar_url
                      ? <img src={partner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : partner?.name?.[0]?.toUpperCase()}
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', alignItems: me ? 'flex-end' : 'flex-start' }}
                  className="chat-bubble-col">

                  {/* Bubble */}
                  <div
                    className="chat-bubble"
                    onClick={() => {
                      if (isSecure && !me && !isSpent && !isCompromised) handleSecureView(msg);
                      else if (msg.message_type === 'image' && user?.blur_sensitive && !unblurred[msg.id])
                        setUnblurred(p => ({ ...p, [msg.id]: true }));
                    }}
                    style={{
                      maxWidth: '75%',
                      padding: isMedia ? 4 : '10px 16px',
                      background: isMedia ? 'transparent'
                        : me
                          ? (activeTheme.bubbleMe || '#E3BE86')
                          : (activeTheme.bubbleOther || 'rgba(255,255,255,0.07)'),
                      color: me
                        ? (activeTheme.textMe || '#111')
                        : (activeTheme.textOther || '#fff'),
                      borderBottomRightRadius: me ? 4  : 20,
                      borderBottomLeftRadius:  me ? 20 : 4,
                      boxShadow: me ? (activeTheme.boxShadowMe || '0 4px 15px rgba(0,0,0,0.1)') : (activeTheme.boxShadowOther || '0 4px 15px rgba(0,0,0,0.1)'),
                      border: isSecure
                        ? (me ? '1px solid rgba(0,0,0,0.2)' : `1px solid ${activeTheme.accent || '#b3945a'}`)
                        : (me ? (activeTheme.borderMe || 'none') : (activeTheme.borderOther || 'none')),
                      backdropFilter: activeTheme.backdropBlur || 'none',
                      WebkitBackdropFilter: activeTheme.backdropBlur || 'none',
                      cursor: isSecure ? 'pointer' : 'default',
                      minWidth: isSecure ? 160 : 0,
                      position: 'relative',
                      maxWidth: '100%',
                    }}
                  >
                    {/* VIDEO */}
                    {msg.message_type === 'video' && (isSecure ? (
                      <SecureChip isCompromised={isCompromised} isSpent={isSpent} isVideo Icons={Icons} />
                    ) : (
                      <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]}>
                        <video src={fixUrl(msg.media_url)} controls style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12 }} />
                      </MediaWrap>
                    ))}

                    {/* IMAGE */}
                    {msg.message_type === 'image' && (isSecure ? (
                      <SecureChip isCompromised={isCompromised} isSpent={isSpent} Icons={Icons} />
                    ) : (
                      <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]}>
                        <img src={fixUrl(msg.media_url)} style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12 }} />
                        {!me && (
                          <button
                            onClick={e => { e.stopPropagation(); requestSave(msg); }}
                            style={{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.55)', border:'none', borderRadius:8, padding:'5px 9px', color:'#fff', fontSize:'0.62rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4, backdropFilter:'blur(8px)' }}
                          >
                            <Icons.Download size={11} /> SAVE
                          </button>
                        )}
                      </MediaWrap>
                    ))}

                    {/* AUDIO */}
                    {msg.message_type === 'audio' && (
                      <VoiceNotePlayer src={msg.media_url} isMe={me} theme={activeTheme} />
                    )}

                    {/* TEXT */}
                    {(!msg.message_type || msg.message_type === 'text') && (
                      <span style={{ fontSize:'0.96rem', whiteSpace:'pre-wrap', lineHeight:1.55 }}>{msg.text}</span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span style={{ fontSize:'0.65rem', color: me ? (activeTheme.accent || '#E3BE86') : 'var(--muted)', marginTop:4, opacity:.6, fontWeight:500 }}>
                    {ts(msg)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} style={{ height:1 }} />
        </div>

        {/* ── INPUT BAR ─────────────────────────────────────── */}
        <div className="chat-input-bar">
          <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />

          <div
            className="chat-input-inner"
            style={{
              background: `${activeTheme.accent || '#C9A96E'}0D`,
              border: `1px solid ${activeTheme.accent || '#C9A96E'}28`,
              boxShadow: `0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 ${activeTheme.accent || '#C9A96E'}15`,
            }}
          >
            <button className="chat-icon-btn" onClick={() => setShowingStudio(true)}>
              <Icons.Camera size={20} color={activeTheme.accent || 'var(--muted)'} />
            </button>
            <button className="chat-icon-btn" onClick={() => fileRef.current?.click()}>
              <Icons.Gallery size={20} color={activeTheme.accent || 'var(--muted)'} />
            </button>

            <input
              value={text}
              onChange={handleType}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder={isRecordingAudio ? 'Recording…' : 'Message'}
              disabled={isRecordingAudio}
              style={{ color: isRecordingAudio ? '#ff5a3c' : '#fff' }}
            />

            <button
              className={`chat-send-btn${isRecordingAudio ? ' rec-btn' : ''}`}
              onPointerDown={!text.trim() ? startVoiceRecord : undefined}
              onPointerUp={!text.trim() ? stopVoiceRecord : undefined}
              onPointerLeave={!text.trim() ? stopVoiceRecord : undefined}
              onClick={text.trim() ? send : undefined}
              disabled={sending && !!text.trim()}
              style={{
                background: isRecordingAudio
                  ? '#ff5a3c'
                  : text.trim()
                    ? activeTheme.accent || 'var(--accent)'
                    : `${activeTheme.accent || '#C9A96E'}18`,
                border: text.trim() || isRecordingAudio ? 'none' : `1px solid ${activeTheme.accent || '#C9A96E'}33`,
                boxShadow: text.trim() ? `0 5px 16px ${activeTheme.accent || '#C9A96E'}55` : 'none',
                transform: isRecordingAudio ? 'scale(1.12)' : 'scale(1)',
              }}
            >
              {text.trim()
                ? <Icons.Send size={18} color={activeTheme.textMe || '#000'} />
                : <Icons.Mic size={18} color={isRecordingAudio ? '#fff' : (activeTheme.accent || 'var(--muted)')} />}
            </button>
          </div>
        </div>

        {/* ── OVERLAYS ─────────────────────────────────────── */}

        {showThemePicker && (
          <ThemePicker
            currentTheme={activeThemeId}
            isPremium={user?.is_premium}
            onSelect={id => { updateTheme(id); setShowThemePicker(false); }}
            onWallpaperUpdate={url => { updateWallpaper(url); setShowThemePicker(false); }}
            onClose={() => setShowThemePicker(false)}
            onPremiumRequired={() => {
              setShowThemePicker(false);
              setShowPremiumModal(true);
            }}
          />
        )}
        
        {showPremiumModal && (
          <PremiumUpgrade 
            onCancel={() => setShowPremiumModal(false)}
            onUpgradeSuccess={() => {
              setShowPremiumModal(false);
              window.location.reload();
            }}
          />
        )}

        {showingStudio && (
          <VlynxlyStudio
            onCapture={(f, mode) => { setShowingStudio(false); sendMedia(f, mode); }}
            onClose={() => setShowingStudio(false)}
          />
        )}

        {viewingSecureMsg && (
          <SecureViewer
            mediaUrl={viewingSecureMsg.media_url}
            messageId={viewingSecureMsg.id}
            type={viewingSecureMsg.message_type}
            onClosed={() => { onSecurityEvent('view'); setViewingSecureMsg(null); }}
            onCompromised={() => { onSecurityEvent('compromise'); setViewingSecureMsg(null); }}
          />
        )}

        {/* Gallery secure send */}
        {showGallerySecureModal && (
          <div className="chat-modal-overlay">
            <div className="chat-modal-card" style={{ border:'1px solid #b3945a' }}>
              <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}><Icons.Vault size={42} color="#b3945a" /></div>
              <h3 style={{ marginBottom:6, color:'#fff', fontSize:'1.05rem' }}>Secure Media Transfer</h3>
              <p style={{ fontSize:'0.85rem', color:'var(--muted)', marginBottom:20 }}>How would you like to send this?</p>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {[['once','Once View'],['twice','Twice View']].map(([m,l]) => (
                  <button key={m} onClick={() => sendMedia(pendingFile, m)}
                    style={{ padding:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(179,148,90,0.3)', borderRadius:13, color:'#b3945a', fontWeight:600, cursor:'pointer', fontSize:'0.9rem' }}>
                    {l}
                  </button>
                ))}
                <button onClick={() => sendMedia(pendingFile, 'permanent')}
                  style={{ padding:12, background:'#b3945a', border:'none', borderRadius:13, color:'#000', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' }}>
                  Permanent Keep
                </button>
                <button onClick={() => { setShowGallerySecureModal(false); setPendingFile(null); }}
                  style={{ padding:12, background:'transparent', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'0.85rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save request */}
        {saveRequest && (
          <div className="chat-modal-overlay">
            <div className="chat-modal-card" style={{ border:'1px solid var(--accent)' }}>
              <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}><Icons.Vault size={42} color="var(--accent)" /></div>
              <h3 style={{ marginBottom:6, color:'#fff' }}>Save Request</h3>
              <p style={{ fontSize:'0.88rem', color:'#fff', marginBottom:20 }}>
                <b>{saveRequest.from}</b> wants to save a photo. Allow?
              </p>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-g" onClick={() => respondSave(false)} style={{ flex:1, padding:12, borderRadius:12, cursor:'pointer' }}>Deny</button>
                <button className="btn btn-p" onClick={() => respondSave(true)}  style={{ flex:1, padding:12, borderRadius:12, color:'#000', fontWeight:700, cursor:'pointer' }}>Allow</button>
              </div>
            </div>
          </div>
        )}

        {/* Requesting save banner */}
        {requestingSave && (
          <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)', background:'var(--accent)', color:'#000', padding:'10px 20px', borderRadius:99, fontWeight:700, zIndex:500, boxShadow:'0 8px 22px rgba(201,169,110,0.3)', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', fontSize:'0.88rem' }}>
            <div className="spinner-small" style={{ borderTopColor:'#000' }} /> Requesting Permission…
          </div>
        )}

      </div>
    </>
  );
}

/* ── Small helper components (no extra files needed) ────────── */

function SecureChip({ isCompromised, isSpent, isVideo, Icons }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 6px' }}>
      {isCompromised
        ? <Icons.Shield size={21} color="#FF3B30" />
        : isSpent
          ? <Icons.Vault size={21} color="var(--muted)" />
          : isVideo
            ? <Icons.Video size={21} color="var(--accent)" />
            : <Icons.Vault size={21} color="var(--accent)" />}
      <div style={{ fontSize:'0.86rem' }}>
        <div style={{ fontWeight:600 }}>
          {isCompromised ? 'Compromised' : isSpent ? 'Viewed' : isVideo ? 'Ephemeral Video' : 'Ephemeral Media'}
        </div>
        {!isSpent && !isCompromised && (
          <div style={{ fontSize:'0.7rem', opacity:.6 }}>Tap to {isVideo ? 'scan & play' : 'scan & reveal'}</div>
        )}
      </div>
    </div>
  );
}

function MediaWrap({ blurred, children }) {
  return (
    <div style={{ position:'relative' }}>
      <div style={{ filter: blurred ? 'blur(22px)' : 'none', transition:'filter 0.3s ease' }}>
        {children}
      </div>
      {blurred && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'0.7rem', fontWeight:700, background:'rgba(0,0,0,0.2)', pointerEvents:'none', borderRadius:12 }}>
          TAP TO REVEAL
        </div>
      )}
    </div>
  );
}
