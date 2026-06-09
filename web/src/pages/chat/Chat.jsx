import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { wsService } from '../../services/websocket';
import api, { getMessages, getSpace, uploadMedia } from '../../services/api';
import { format } from 'date-fns';
import SecureViewer from '../../components/SecureViewer';
import ThemePicker from './ThemePicker';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import DynamicPresence from '../../components/chat/DynamicPresence';
import VlynxlyStudio from '../../components/chat/VlynxlyStudio';
import ChatBackground from '../../components/chat/ChatBackground';
import { CHAT_THEMES } from '../../data/chatThemes';
import PremiumUpgrade from '../../components/premium/PremiumUpgrade';
import axios from 'axios';
import { Icons } from '../../components/ui/Icons';

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_messages')) || []; } catch { return []; }
  });
  const [text, setText] = useState('');
  const [partner, setPartner] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_partner')) || null; } catch { return null; }
  });
  const [typing, setTyping]           = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [sending, setSending]         = useState(false);

  // Voice
  const [recordState, setRecordState]           = useState('idle');
  const [recordTime, setRecordTime]             = useState(0);
  const [audioRecorder, setAudioRecorder]       = useState(null);
  const audioChunks                             = useRef([]);
  const recordInterval                          = useRef(null);
  const recordStartY                            = useRef(0);
  const isRecordingAudio = recordState !== 'idle';

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
  
  // Gestures & Reactions
  const [replyingTo, setReplyingTo] = useState(null);
  const [floatingHeart, setFloatingHeart] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [contextMenuMsg, setContextMenuMsg] = useState(null);
  const [deleteModalMsg, setDeleteModalMsg] = useState(null);

  const touchStartX = useRef(0);
  const [swipingMsgId, setSwipingMsgId] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const handleMsgTouchStart = (e, msg) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipingMsgId(msg.id);
  };
  const handleMsgTouchMove = (e) => {
    if (!swipingMsgId) return;
    const diff = e.touches[0].clientX - touchStartX.current;
    if (diff > 0 && diff < 80) { // Max 80px swipe right
      setSwipeOffset(diff);
    }
  };
  const handleMsgTouchEnd = (e, msg) => {
    if (swipeOffset > 50) {
      setReplyingTo(msg);
    }
    setSwipingMsgId(null);
    setSwipeOffset(0);
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" });
  };

  const lastTapTime = useRef(0);
  const daysTogether = space?.created_at ? Math.max(1, Math.floor((Date.now() - new Date(space.created_at)) / (1000 * 60 * 60 * 24))) : 0;

  // Save requests
  const [saveRequest, setSaveRequest]   = useState(null);
  const [requestingSave, setRequestingSave] = useState(false);

  const bottomRef  = useRef(null);
  const typingTimer = useRef(null);
  const fileRef    = useRef(null);
  const scrollRef  = useRef(null);
  const inputRef   = useRef(null);

  // Prevent body scrolling while in immersive chat (REMOVED to fix black screen bug)

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
      wsService.on('chat_message', msg => {
        setMsgs(p => {
          if (msg.sender_id === user?.id) {
            const optIdx = p.findIndex(m => m.isOptimistic && m.message_type === msg.message_type && (m.message_type === 'text' ? m.text === msg.text : true));
            if (optIdx !== -1) {
              const newMsgs = [...p];
              newMsgs[optIdx] = msg;
              return newMsgs;
            }
          }
          return [...p, msg];
        });
      }),
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
      wsService.on('message_deleted', d => {
        setMsgs(p => p.filter(m => m.id !== d.message_id));
      }),
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
    
    // OPTIMISTIC UPDATE
    const tempMsg = {
      id: `temp_${Date.now()}`,
      sender_id: user?.id,
      text: text.trim(),
      message_type: 'text',
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      reactions: {}
    };
    setMsgs(p => [...p, tempMsg]);

    wsService.sendMessage(text.trim(), 'text', null, false, 1, replyingTo?.id);
    setText('');
    setReplyingTo(null);
    setSending(false);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  };

  const onFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;
    setPendingFile(file);
    setShowGallerySecureModal(true);
  };

  const startVoiceRecord = async (e) => {
    if (e?.touches?.[0]) recordStartY.current = e.touches[0].clientY;
    else if (e?.clientY) recordStartY.current = e.clientY;
    
    try {
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = ev => audioChunks.current.push(ev.data);
      
      recorder.onstop = async () => {
        if (audioChunks.current.length > 0) {
          const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
          const file = new File([blob], 'voice_note.webm', { type: 'audio/webm' });
          const { media_url } = await uploadMedia(file);
          wsService.sendMessage('', 'audio', media_url, false, 0);
        }
        stream.getTracks().forEach(t => t.stop());
        clearInterval(recordInterval.current);
        setRecordTime(0);
        setRecordState('idle');
        audioChunks.current = []; 
      };
      
      recorder.start();
      setAudioRecorder(recorder);
      setRecordState('holding');
      setRecordTime(0);
      recordInterval.current = setInterval(() => setRecordTime(p => p + 1), 1000);
    } catch (err) { console.error('Audio recording failed', err); }
  };

  const handleRecordMove = (e) => {
    if (recordState !== 'holding') return;
    const clientY = e?.touches?.[0]?.clientY || e.clientY;
    if (!clientY) return;
    if (recordStartY.current - clientY > 40) {
      setRecordState('locked'); 
    }
  };

  const stopVoiceRecord = () => {
    if (recordState === 'holding' && audioRecorder) {
      audioRecorder.stop(); 
    }
  };

  const cancelVoiceRecord = () => {
    if (audioRecorder) {
      audioChunks.current = []; 
      audioRecorder.stop();
    }
  };
  
  const sendLockedVoiceRecord = () => {
    if (recordState === 'locked' && audioRecorder) {
      audioRecorder.stop();
    }
  };

  const formatRecordTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  const sendMedia = async (fileToUse, mode = 'standard') => {
    const f = fileToUse || pendingFile;
    if (!f) return;
    setSending(true);
    setShowGallerySecureModal(false);
    
    // OPTIMISTIC UPDATE
    const objectUrl = URL.createObjectURL(f);
    const isVideo = f.type?.startsWith('video');
    const tempMsg = {
      id: `temp_${Date.now()}`,
      sender_id: user?.id,
      text: '',
      message_type: isVideo ? 'video' : 'image',
      media_url: objectUrl,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      isUploading: true,
      reactions: {}
    };
    setMsgs(p => [...p, tempMsg]);

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
      wsService.sendMessage('', type, finalUrl, isOnceView, limit, replyingTo?.id);
      setReplyingTo(null);
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
      setMsgs(p => p.filter(m => m.id !== tempMsg.id));
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

  const isMe      = m => m.sender_id === user?.id;
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
          0%, 60%, 100% { transform: translateY(0) scale(0.6); opacity: 0.35; }
          30%           { transform: translateY(-5px) scale(1); opacity: 1;   }
        }
        @keyframes floatHeart {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          20% { transform: scale(1.5) translateY(-20px); opacity: 1; }
          80% { transform: scale(1.2) translateY(-40px); opacity: 1; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes audioWave {
          0%, 100% { transform: scaleY(0.2); }
          50%      { transform: scaleY(1); }
        }
        @keyframes slideUpFade {
          0% { transform: translateY(5px); opacity: 0; }
          50% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-5px); opacity: 0; }
        }
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,90,60,0.5); }
          50%     { box-shadow: 0 0 0 8px rgba(255,90,60,0);  }
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
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
          top: env(safe-area-inset-top, 0px);
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
        .chat-input-inner textarea {
          flex: 1; display: flex; flex-direction: column;
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.97rem;
          color: #fff;
          padding: 8px 0;
          min-width: 0;
          font-family: inherit;
          /* prevent iOS auto-zoom on focus (font-size must be >= 16px to avoid zoom) */
          font-size: 16px;
          max-height: 120px;
        }
        .chat-input-inner textarea::placeholder { color: rgba(255,255,255,0.35); }

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
          .chat-input-bar { padding: 5px 8px 8px; }
          .chat-bubble { max-width: 80%; }
          .chat-input-inner textarea { font-size: 16px; } /* prevent iOS zoom */
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
            <div style={{ width:'100%', height:'100%', position:'absolute', inset:0, zIndex:0, overflow:'hidden',
              background: activeTheme.bg || '#0E0C11' }}>
              {/* Subtle top-center glow */}
              <div style={{ position:'absolute', top:'-15%', left:'50%', transform:'translateX(-50%)', width:'60%', height:'50%',
                background:'radial-gradient(ellipse, rgba(180,140,80,0.12) 0%, transparent 70%)', borderRadius:'50%' }} />
              {/* Bottom-right glow */}
              <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:'50%', height:'55%',
                background:'radial-gradient(ellipse, rgba(100,70,160,0.10) 0%, transparent 65%)', borderRadius:'50%' }} />
            </div>
          )}

          {/* Living animated elements — outside overflow:hidden so they aren't clipped */}
          <ChatBackground elements={activeTheme.elements} theme={activeTheme} />
        </div>

        {/* ── HEADER ───────────────────────────────────────── */}
        <div
          className="chat-header"
          style={{
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
        <div className="chat-scroll" ref={scrollRef} style={ replyingTo ? { paddingBottom: '160px', transition: 'padding-bottom 0.2s ease' } : { transition: 'padding-bottom 0.2s ease' } }>
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
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
                style={{
                  marginBottom: 9,
                  display:'flex', gap:7,
                  justifyContent: me ? 'flex-end' : 'flex-start',
                  animationDelay: `${Math.min(i * 0.025, 0.25)}s`,
                  alignItems: 'center'
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

                {/* ActionBar for ME (Left Side) */}
                {me && hoveredMsgId === msg.id && (
                  <div style={{ display:'flex', gap:8, paddingRight:4, animation:'fadeIn 0.2s' }}>
                    <button onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "emoji" })} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Smile size={16} /></button>
                    <button onClick={() => setReplyingTo(msg)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Reply size={16} /></button>
                    <button onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" })} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.MoreVertical size={16} /></button>
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', alignItems: me ? 'flex-end' : 'flex-start' }}
                  className="chat-bubble-col">

                  {/* Bubble */}
                  <div
                    className="chat-bubble"
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    onTouchStart={(e) => handleMsgTouchStart(e, msg)}
                    onTouchMove={handleMsgTouchMove}
                    onTouchEnd={e => handleMsgTouchEnd(e, msg)}
                    onClick={() => {
                      if (isSecure && !me && !isSpent && !isCompromised) handleSecureView(msg);
                      else if (msg.message_type === 'image' && user?.blur_sensitive && !unblurred[msg.id])
                        setUnblurred(p => ({ ...p, [msg.id]: true }));
                    }}
                    style={{
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
                      boxShadow: isMedia ? 'none'
                        : me
                          ? `0 4px 18px ${activeTheme.accent || '#C9A96E'}40`
                          : `0 2px 10px rgba(0,0,0,0.25)`,
                      border: isSecure
                        ? (me ? '1px solid rgba(0,0,0,0.2)' : `1px solid ${activeTheme.accent || '#b3945a'}`)
                        : activeTheme.borderMe && me ? activeTheme.borderMe : 'none',
                      cursor: isSecure ? 'pointer' : 'default',
                      minWidth: isSecure ? 160 : 0,
                      position: 'relative',
                      maxWidth: '100%',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      transform: swipingMsgId === msg.id ? `translateX(${swipeOffset}px)` : 'none',
                      transition: swipingMsgId === msg.id ? 'none' : 'transform 0.2s',
                    }}
                  >
                    {/* Floating Heart */}
                    {floatingHeart === msg.id && (
                      <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', fontSize:'3rem', animation:'floatHeart 1s forwards', zIndex:10 }}>❤️</div>
                    )}

                    {/* Quote Box */}
                    {msg.reply_to_id && (
                      (() => {
                        const quoteMsg = msgs.find(m => m.id === msg.reply_to_id);
                        if (!quoteMsg) return null;
                        return (
                          <div style={{
                            background: 'rgba(0,0,0,0.15)',
                            borderLeft: `4px solid ${activeTheme.accent || '#C9A96E'}`,
                            padding: '6px 10px',
                            borderRadius: '6px',
                            marginBottom: '6px',
                            fontSize: '0.8rem',
                            color: 'rgba(255,255,255,0.8)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            <div style={{ color: activeTheme.accent || '#C9A96E', fontWeight: 700, marginBottom: 2 }}>{quoteMsg.sender_id === user?.id ? 'You' : (partner?.name || 'Partner')}</div>
                            {quoteMsg.message_type === 'image' ? '📷 Image' : quoteMsg.message_type === 'video' ? '🎥 Video' : quoteMsg.message_type === 'audio' ? '🎵 Voice Note' : quoteMsg.text}
                          </div>
                        );
                      })()
                    )}

                    {/* VIDEO */}
                    {msg.message_type === 'video' && (isSecure ? (
                      <SecureChip isCompromised={isCompromised} isSpent={isSpent} isVideo Icons={Icons} />
                    ) : (
                      <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]}>
                        <div style={{ position: 'relative' }}>
                          <video src={fixUrl(msg.media_url)} controls={!msg.isUploading} style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12, opacity: msg.isUploading ? 0.5 : 1 }} />
                          {msg.isUploading && (
                            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'rgba(0,0,0,0.6)', padding:'10px 16px', borderRadius:'20px', color:'#fff', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'8px' }}>
                              <Icons.Loader size={16} className="spin" /> Sending...
                            </div>
                          )}
                        </div>
                      </MediaWrap>
                    ))}

                    {/* IMAGE */}
                    {msg.message_type === 'image' && (isSecure ? (
                      <SecureChip isCompromised={isCompromised} isSpent={isSpent} Icons={Icons} />
                    ) : (
                      <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]}>
                        <div style={{ position: 'relative' }}>
                          <img src={fixUrl(msg.media_url)} style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12, opacity: msg.isUploading ? 0.5 : 1 }} />
                          {msg.isUploading && (
                            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', background:'rgba(0,0,0,0.6)', padding:'10px 16px', borderRadius:'20px', color:'#fff', fontSize:'0.8rem', display:'flex', alignItems:'center', gap:'8px' }}>
                              <Icons.Loader size={16} className="spin" /> Sending...
                            </div>
                          )}
                        </div>
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

                    {/* Reactions Display */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: -12,
                        right: me ? 12 : 'auto',
                        left: me ? 'auto' : 12,
                        background: 'rgba(20, 16, 14, 0.95)',
                        border: `1px solid ${activeTheme.accent || 'rgba(255,255,255,0.1)'}40`,
                        borderRadius: 12,
                        padding: '2px 6px',
                        display: 'flex',
                        gap: 2,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        zIndex: 2
                      }}>
                        {Object.values(msg.reactions).map((emoji, idx) => (
                          <span key={idx} style={{ fontSize: '0.85rem' }}>{emoji}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <span style={{ fontSize:'0.65rem', color: me ? (activeTheme.accent || '#E3BE86') : 'var(--muted)', marginTop: (msg.reactions && Object.keys(msg.reactions).length > 0) ? 16 : 4, opacity:.6, fontWeight:500 }}>
                    {ts(msg)}
                  </span>
                </div>

                {/* ActionBar for PARTNER (Right Side) */}
                {!me && hoveredMsgId === msg.id && (
                  <div style={{ display:'flex', gap:8, paddingLeft:4, animation:'fadeIn 0.2s' }}>
                    <button onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "emoji" })} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Smile size={16} /></button>
                    <button onClick={() => setReplyingTo(msg)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Reply size={16} /></button>
                    <button onClick={(e) => setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" })} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.MoreVertical size={16} /></button>
                  </div>
                )}
              </div>
            );
          })}

          {typing && (
            <div style={{ display: 'flex', alignItems: 'flex-start', margin: '10px 0', gap: 12, justifyContent: 'flex-start' }}>
              <div style={{
                padding: '14px 20px',
                borderRadius: '4px 20px 20px 20px',
                background: activeTheme.bubbleOther || 'rgba(255,255,255,0.06)',
                border: activeTheme.borderOther || 'none',
                boxShadow: activeTheme.boxShadowOther || '0 4px 15px rgba(0,0,0,0.1)',
                backdropFilter: activeTheme.backdropBlur || 'none',
                WebkitBackdropFilter: activeTheme.backdropBlur || 'none',
                display: 'flex',
                gap: 5,
                alignItems: 'center'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          <div ref={bottomRef} style={{ height:1 }} />
        </div>

        {/* ── INPUT BAR ─────────────────────────────────────── */}
        <div className="chat-input-bar">
          <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />

          {/* Reply Banner */}
          {replyingTo && (
            <div style={{
              background: 'rgba(20,20,20,0.85)',
              backdropFilter: 'blur(12px)',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              padding: '10px 16px',
              marginBottom: '-10px',
              paddingBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: `1px solid ${activeTheme.accent || '#C9A96E'}40`,
              borderBottom: 'none',
              transform: 'scale(0.89) translateY(10px)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ color: activeTheme.accent || '#C9A96E', fontSize: '0.8rem', fontWeight: 600 }}>Replying to {replyingTo.sender_id === user?.id ? 'Yourself' : partner?.name || 'Partner'}</span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {replyingTo.message_type === 'image' ? '📷 Image' : replyingTo.message_type === 'video' ? '🎥 Video' : replyingTo.message_type === 'audio' ? '🎵 Voice Note' : replyingTo.text}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer', padding: 4 }}>
                <Icons.Close size={18} />
              </button>
            </div>
          )}

          <div
            className="chat-input-inner"
            style={{
              background: `${activeTheme.accent || '#C9A96E'}0D`,
              border: `1px solid ${activeTheme.accent || '#C9A96E'}28`,
              boxShadow: `0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 ${activeTheme.accent || '#C9A96E'}15`,
            }}
          >
            {isRecordingAudio ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 8px', justifyContent: 'space-between', color: '#ff5a3c' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5a3c', animation: 'recPulse 1s infinite' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600 }}>{formatRecordTime(recordTime)}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 10, height: 16 }}>
                    <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.9s infinite ease-in-out 0.1s` }} />
                    <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.7s infinite ease-in-out 0.5s` }} />
                    <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 1.1s infinite ease-in-out 0.2s` }} />
                    <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.8s infinite ease-in-out 0.6s` }} />
                    <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 1.0s infinite ease-in-out 0.3s` }} />
                  </div>
                </div>
                {recordState === 'holding' ? (
                  <div style={{ fontSize: '0.75rem', opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'slideUpFade 1.5s infinite', marginRight: 15 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>&uarr;</span>
                    <span>Slide to lock</span>
                  </div>
                ) : null}
                {recordState === 'locked' && (
                  <button className="chat-icon-btn" onClick={cancelVoiceRecord} style={{ color: '#ff5a3c', marginLeft: 'auto', marginRight: 10 }}>
                    <Icons.Trash size={20} />
                  </button>
                )}
              </div>
            ) : (
              <>
                <button className="chat-icon-btn" onClick={() => setShowingStudio(true)}>
                  <Icons.Camera size={20} color={activeTheme.accent || 'var(--muted)'} />
                </button>
                <button className="chat-icon-btn" onClick={() => fileRef.current?.click()}>
                  <Icons.Gallery size={20} color={activeTheme.accent || 'var(--muted)'} />
                </button>
    
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={e => {
                    handleType(e);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={1}
                  placeholder="Message"
                  style={{ resize: 'none', overflowY: 'auto', fontFamily: 'inherit', lineHeight: '1.4' }}
                />
              </>
            )}

            <button
              className={`chat-send-btn${recordState === 'holding' ? ' rec-btn' : ''}`}
              onPointerDown={!text.trim() && recordState === 'idle' ? startVoiceRecord : undefined}
              onPointerMove={!text.trim() && recordState === 'holding' ? handleRecordMove : undefined}
              onPointerUp={recordState === 'holding' ? stopVoiceRecord : undefined}
              onPointerLeave={recordState === 'holding' ? stopVoiceRecord : undefined}
              onClick={recordState === 'locked' ? sendLockedVoiceRecord : (text.trim() ? send : undefined)}
              disabled={sending && !!text.trim()}
              style={{
                background: isRecordingAudio
                  ? '#ff5a3c'
                  : text.trim()
                    ? activeTheme.accent || 'var(--accent)'
                    : `${activeTheme.accent || '#C9A96E'}18`,
                border: text.trim() || isRecordingAudio ? 'none' : `1px solid ${activeTheme.accent || '#C9A96E'}33`,
                boxShadow: text.trim() || isRecordingAudio ? `0 5px 16px ${isRecordingAudio ? '#ff5a3c' : activeTheme.accent || '#C9A96E'}55` : 'none',
                transform: recordState === 'holding' ? 'scale(1.15)' : 'scale(1)',
                touchAction: recordState === 'holding' ? 'none' : 'auto'
              }}
            >
              {text.trim() || recordState === 'locked'
                ? <Icons.Send size={18} color={isRecordingAudio ? '#fff' : (activeTheme.textMe || '#000')} />
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

        {/* Context Menu Overlay */}
        {contextMenuMsg && (
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 999999 }}
            onClick={() => setContextMenuMsg(null)}
          >
            <div style={{
              position: 'absolute',
              left: Math.min(contextMenuMsg.x, window.innerWidth - 220),
              top: Math.min(contextMenuMsg.y, window.innerHeight - 300),
              background: '#1A1A1A',
              borderRadius: 16,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              padding: '8px 0',
              minWidth: 200,
              border: '1px solid rgba(255,255,255,0.05)',
              animation: 'fadeIn 0.15s ease'
            }} onClick={e => e.stopPropagation()}>
              
              {(!contextMenuMsg.type || contextMenuMsg.type === 'emoji') && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', gap: 8 }}>
                    {['👍', '❤️', '😂', '😮', '😢', '🙏'].map(emoji => (
                      <span 
                        key={emoji} 
                        style={{ fontSize: '1.4rem', cursor: 'pointer', padding: 4, transition: 'transform 0.1s' }}
                        onClick={() => {
                          wsService.send({ type: 'reaction', message_id: contextMenuMsg.msg.id, emoji });
                          setContextMenuMsg(null);
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      >{emoji}</span>
                    ))}
                  </div>
                )}

                {contextMenuMsg.type === 'options' && (
                  <>
                    {[
                      { icon: <Icons.Reply size={18} />, label: 'Reply', action: () => { setReplyingTo(contextMenuMsg.msg); setContextMenuMsg(null); } },
                      { icon: <Icons.Copy size={18} />, label: 'Copy', action: () => { navigator.clipboard.writeText(contextMenuMsg.msg.text); setContextMenuMsg(null); } },
                      { icon: <Icons.Edit size={18} />, label: 'Edit', action: () => { alert('Editing coming soon!'); setContextMenuMsg(null); } },
                      { icon: <Icons.Pin size={18} />, label: 'Pin to Chat', action: () => { alert('Pinning coming soon!'); setContextMenuMsg(null); } },
                      { icon: <Icons.Vault size={18} />, label: 'Save to Vault', action: () => { 
                        api.post('/memories/save-message', { message_id: contextMenuMsg.msg.id })
                          .then(() => alert('✨ Saved to Memory Vault!'))
                          .catch(() => alert('Failed to save message.'));
                        setContextMenuMsg(null); 
                      } },
                      { icon: <span style={{ fontSize: '1.2rem' }}>✨</span>, label: 'Ask Aura', action: () => { alert('Aura is analyzing this message...'); setContextMenuMsg(null); } },
                    ].map((item, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: item.label === 'Ask Aura' ? 'var(--accent)' : '#fff', fontWeight: item.label === 'Ask Aura' ? 700 : 400, cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={item.action}>
                        {item.label}
                        <div style={{ opacity: item.label === 'Ask Aura' ? 1 : 0.7, filter: item.label === 'Ask Aura' ? 'drop-shadow(0 0 5px rgba(201,169,110,0.5))' : 'none' }}>{item.icon}</div>
                      </div>
                    ))}
                    
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
                    
                    {contextMenuMsg.msg.sender_id === user?.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#ff4444', cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => {
                          setDeleteModalMsg(contextMenuMsg.msg);
                          setContextMenuMsg(null);
                        }}>
                        Delete
                        <div style={{ opacity: 0.7 }}><Icons.Trash size={18} /></div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#ff4444', cursor: 'pointer', fontSize: '0.95rem' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        onClick={() => { alert('Reported!'); setContextMenuMsg(null); }}>
                        Report
                        <div style={{ opacity: 0.7 }}><Icons.Report size={18} /></div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

      {/* Delete Confirmation Modal */}
      {deleteModalMsg && (
        <div 
          style={{ position: 'fixed', inset: 0, zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setDeleteModalMsg(null)}
        >
          <div style={{
            background: '#1A1A1A',
            borderRadius: 16,
            padding: '16px 0',
            width: 280,
            border: '1px solid rgba(255,255,255,0.05)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            animation: 'fadeIn 0.15s ease'
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 16px 16px', fontSize: '1.1rem', color: '#fff', textAlign: 'center' }}>Delete Message?</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {deleteModalMsg.sender_id === user?.id && (
                <button
                  onClick={() => {
                    api.delete(`/messages/${deleteModalMsg.id}?for_everyone=true`).then(() => {
                      setMsgs(msgs.filter(m => m.id !== deleteModalMsg.id));
                      setDeleteModalMsg(null);
                    }).catch(() => alert('Failed to delete for everyone'));
                  }}
                  style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: '#ff4444', fontSize: '1rem', cursor: 'pointer', textAlign: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Delete for everyone
                </button>
              )}
              <button
                onClick={() => {
                  api.delete(`/messages/${deleteModalMsg.id}?for_everyone=false`).then(() => {
                    setMsgs(msgs.filter(m => m.id !== deleteModalMsg.id));
                    setDeleteModalMsg(null);
                  }).catch(() => alert('Failed to delete for me'));
                }}
                style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: '#fff', fontSize: '1rem', cursor: 'pointer', textAlign: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Delete for me
              </button>
              
              <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '4px 0' }} />
              
              <button
                onClick={() => setDeleteModalMsg(null)}
                style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: 'var(--muted)', fontSize: '1rem', cursor: 'pointer', textAlign: 'center' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                Cancel
              </button>
            </div>
          </div>
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
