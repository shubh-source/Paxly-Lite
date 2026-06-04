import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { wsService } from '../../services/websocket';
import { getMessages, getSpace, uploadMedia } from '../../services/api';
import { format } from 'date-fns';
import SecureViewer from '../../components/SecureViewer';
import ThemePicker from './ThemePicker';
import DynamicPresence from '../../components/chat/DynamicPresence';
import ReactionPicker from '../../components/chat/ReactionPicker';
import VlynxlyStudio from '../../components/chat/VlynxlyStudio';
import { CHAT_THEMES } from '../../data/chatThemes';
import axios from 'axios';
import { Icons } from '../../components/ui/Icons';

const EMOJIS = ['❤️','😂','😮','😢','🔥','👏'];

export default function Chat() {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_messages')) || []; } catch { return []; }
  });
  const [text, setText] = useState('');
  const [partner, setPartner] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_partner')) || null; } catch { return null; }
  });
  const [typing, setTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [reactTo, setReactTo] = useState(null);
  const [sending, setSending] = useState(false);
  
  // Voice Recording State
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioRecorder, setAudioRecorder] = useState(null);
  const audioChunks = useRef([]);
  
// Security State
  const [pendingFile, setPendingFile] = useState(null);
  const [showGallerySecureModal, setShowGallerySecureModal] = useState(false);
  const [unblurred, setUnblurred] = useState({}); // Tracking unblurred msgs manually

  // Presence & Theme State
  const [viewingSecureMsg, setViewingSecureMsg] = useState(null);
  const [space, setSpace] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cached_space'))?.space || null; } catch { return null; }
  });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [partnerPresence, setPartnerPresence] = useState('idle'); // idle | peeking | typing | watching
  const [partnerMood, setPartnerMood] = useState('neutral');
  const [selfMood, setSelfMood] = useState('neutral');
  const [showingStudio, setShowingStudio] = useState(false);

  // Media Permissions State
  const [saveRequest, setSaveRequest] = useState(null); // { from, mediaUrl, messageId }
  const [requestingSave, setRequestingSave] = useState(false);
  const [saveAllowed, setSaveAllowed] = useState(null); // { messageId, allowed }

  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);

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
      wsService.on('chat_message', msg => setMsgs(prev => [...prev, msg])),
      wsService.on('typing', d => { if (d.user_id !== user?.id) setTyping(d.is_typing); }),
      wsService.on('presence', d => { if (d.user_id !== user?.id) setPartnerOnline(d.online); }),
      wsService.on('presence_state', d => { 
        if (d.user_id !== user?.id) {
          setPartnerPresence(d.state);
          setPartnerMood(d.mood || 'neutral');
          if (d.state === 'typing') {
            setTyping(true);
          } else {
            setTyping(false);
          }
        }
      }),
      wsService.on('reaction', d => setMsgs(prev => prev.map(m => m.id === d.message_id ? { ...m, reactions: { ...m.reactions, [d.user_id]: d.emoji } } : m))),
      wsService.on('media_save_request', d => {
        if (d.sender_id !== user?.id) setSaveRequest({ from: partner?.name || 'Partner', ...d });
      }),
      wsService.on('media_save_response', d => {
        if (d.sender_id !== user?.id) {
          setRequestingSave(false);
          setSaveAllowed({ messageId: d.message_id, allowed: d.allowed });
          if (d.allowed) {
            // Trigger download if allowed
            const link = document.createElement('a');
            link.href = d.media_url;
            link.download = `vlynxly_${Date.now()}`;
            link.click();
          } else {
            alert("Save request denied by partner.");
          }
        }
      }),
    ];
    return () => offs.forEach(off => off());
  }, [user?.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [msgs]);

  // Self Presence Emission
  useEffect(() => {
    const sendPulse = (st) => {
      wsService.send({ type: 'presence_state', state: st, mood: selfMood });
    };

    const handleFocus = () => sendPulse('peeking');
    const handleBlur = () => sendPulse('idle');

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    sendPulse('peeking');

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      sendPulse('idle');
    };
  }, [selfMood]);

  useEffect(() => {
    const st = viewingSecureMsg ? 'watching' : 'peeking';
    wsService.send({ type: 'presence_state', state: st, mood: selfMood });
  }, [viewingSecureMsg, selfMood]);

  const handleType = e => {
    setText(e.target.value);
    wsService.send({ type: 'presence_state', state: e.target.value.length > 0 ? 'typing' : 'peeking', mood: selfMood });
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
    setShowGallerySecureModal(true); // Show gallery secure modal instead
  };

  const startVoiceRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = e => audioChunks.current.push(e.data);
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_note.webm', { type: 'audio/webm' });
        const { media_url } = await uploadMedia(file);
        wsService.sendMessage('', 'audio', media_url, false, 0);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      setAudioRecorder(recorder);
      setIsRecordingAudio(true);
    } catch (err) {
      console.error("Audio recording failed", err);
    }
  };

  const stopVoiceRecord = () => {
    if (audioRecorder && isRecordingAudio) {
      audioRecorder.stop();
      setIsRecordingAudio(false);
    }
  };

  const sendMedia = async (fileToSync, mode = 'standard') => {
    const targetFile = fileToSync || pendingFile;
    if (!targetFile) return;
    setSending(true);
    setShowGallerySecureModal(false);
    
    try {
      const { media_url } = await uploadMedia(targetFile);
      const isOnceView = mode !== 'standard' && mode !== 'permanent';
      const limit = mode === 'twice' ? 2 : 1;
      
      // Fix backend returning localhost URLs when testing via ngrok/vercel
      let finalUrl = media_url;
      if (media_url && (media_url.includes('localhost') || media_url.includes('127.0.0.1'))) {
        try {
          const pathOnly = new URL(media_url).pathname; // gets /media/chat/...
          const apiUrl = import.meta.env.VITE_API_URL || '';
          finalUrl = apiUrl + pathOnly;
        } catch (e) { console.error("URL parse error", e); }
      } else if (media_url && media_url.startsWith('/')) {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        finalUrl = apiUrl + media_url;
      }

      const type = (targetFile.type || '').startsWith('video') ? 'video' : 'image';
      wsService.sendMessage('', type, finalUrl, isOnceView, limit);
    } catch (err) {
      alert("Upload failed: " + (err.response?.data?.detail || err.message));
      console.error("Media upload error:", err);
    } finally { 
      setSending(false); 
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = ''; 
    }
  };

  const handleSecureView = (msg) => {
    if (msg.sender_id === user?.id) return; // Sender can't view securely (it's for the recipient)
    if (msg.views_used >= msg.view_limit) return;
    setViewingSecureMsg(msg);
  };

  const onSecurityEvent = async (action) => {
    if (!viewingSecureMsg) return;
    try {
      await axios.post(`/api/chat/messages/${viewingSecureMsg.id}/secure-event?action=${action}`);
      if (action === 'view') {
        // Refresh local state
        setMsgs(prev => prev.map(m => m.id === viewingSecureMsg.id ? { ...m, views_used: m.views_used + 1 } : m));
      } else if (action === 'compromise') {
        setMsgs(prev => prev.map(m => m.id === viewingSecureMsg.id ? { ...m, is_compromised: true, media_url: null } : m));
      }
    } catch (err) { console.error(err); }
  };

  const updateTheme = async (theme_id) => {
    try {
      await axios.patch('/api/chat/space/theme', { theme_id });
      setSpace(prev => ({ ...prev, theme_id, chat_wallpaper: null })); // Reset wallpaper when theme picks
    } catch {}
  };

  const updateWallpaper = (url) => {
    setSpace(prev => ({ ...prev, theme_id: 'custom', chat_wallpaper: url }));
  };

  const requestSave = (msg) => {
    if (msg.sender_id === user?.id) return;
    setRequestingSave(true);
    wsService.sendMediaSaveRequest(msg.media_url, msg.id);
  };

  const respondSave = (allowed) => {
    if (!saveRequest) return;
    wsService.sendMediaSaveResponse(saveRequest.sender_id, allowed, saveRequest.message_id);
    setSaveRequest(null);
  };

  const isMe = m => m.sender_id === user?.id;
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'auto'; };
  }, []);

  const ts = m => m.timestamp ? format(new Date(m.timestamp), 'h:mm a') : '';

  const activeThemeId = space?.theme_id || 'classic';
  const activeTheme = CHAT_THEMES[activeThemeId] || CHAT_THEMES.classic;

  return (
    <div style={{ height: '100dvh', width: '100%', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}>
      
      {/* Background Layer (Static + Wallpaper) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {space?.chat_wallpaper ? (
           <div style={{ width: '100%', height: '100%', background: `url(${space.chat_wallpaper})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
             <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} />
           </div>
        ) : (
           <div style={{ width: '100%', height: '100%', background: activeTheme.bg }}>
             <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '50%', height: '50%', background: 'radial-gradient(circle, rgba(201,169,110,0.1) 0%, transparent 60%)' }} />
             <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '60%', background: 'radial-gradient(circle, rgba(124,111,205,0.1) 0%, transparent 60%)' }} />
             <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(60px)' }} />
           </div>
        )}
      </div>

      {/* Floating Header (Aura AI Style) */}
      <div id="chat-top-card" style={{ 
        background: 'rgba(22,22,24,0.6)', 
        backdropFilter: 'blur(20px)', 
        border: '1px solid rgba(255,255,255,0.05)', 
        margin: '16px 16px 0', 
        borderRadius: '24px', 
        padding: '12px 20px', 
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000
      }}>
        <Link to="/dashboard" style={{ color: '#fff', display: 'flex', alignItems: 'center' }}><Icons.Back size={28} /></Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, cursor: 'pointer', marginLeft: 8 }} onClick={() => setShowThemePicker(true)}>
          <div className="avatar" style={{ width: 40, height: 40, overflow: 'hidden', borderRadius: '50%' }}>
            {partner?.avatar_url ? <img src={partner.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (partner?.name?.[0]?.toUpperCase() || 'P')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)' }}>{partner?.name || 'Partner'}</span>
            <span style={{ fontSize: '0.75rem', color: partnerOnline ? 'var(--success)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {typing ? <span style={{ color: 'var(--accent)' }}>typing...</span> : <DynamicPresence partnerOnline={partnerOnline} partnerPresence={partnerPresence} partnerMood={partnerMood} />}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, color: 'var(--accent)' }}>
          <Icons.Phone size={22} />
          <Icons.Video size={24} />
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ 
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1
      }}>

      {/* Theme Picker */}
      {showThemePicker && (
        <ThemePicker 
          currentTheme={activeThemeId}
          isPremium={user?.is_premium}
          onSelect={(id) => { updateTheme(id); setShowThemePicker(false); }}
          onWallpaperUpdate={(url) => { updateWallpaper(url); setShowThemePicker(false); }}
          onClose={() => setShowThemePicker(false)}
        />
      )}
      
      {showingStudio && (
        <VlynxlyStudio 
          onCapture={(file, mode) => { 
            setShowingStudio(false); 
            sendMedia(file, mode); 
          }}
          onClose={() => setShowingStudio(false)}
        />
      )}

      {/* Gallery Secure Send Modal */}
      {showGallerySecureModal && (
        <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ maxWidth:360, width:'100%', textAlign:'center', border: '1px solid #b3945a', background: '#1a1614', padding: 30, borderRadius: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Icons.Vault size={48} color="#b3945a" /></div>
            <h3 style={{ marginBottom:10, color: '#fff' }}>Secure Media Transfer</h3>
            <p style={{ fontSize:'0.95rem', color:'var(--muted)', marginBottom:24 }}>
              How would you like to send this file from your gallery?
            </p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <button onClick={() => sendMedia(pendingFile, 'once')} style={{ padding: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(179,148,90,0.3)', borderRadius: 14, color: '#b3945a', fontWeight: 600, cursor: 'pointer' }}>Once View</button>
              <button onClick={() => sendMedia(pendingFile, 'twice')} style={{ padding: 14, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(179,148,90,0.3)', borderRadius: 14, color: '#b3945a', fontWeight: 600, cursor: 'pointer' }}>Twice View</button>
              <button onClick={() => sendMedia(pendingFile, 'permanent')} style={{ padding: 14, background: '#b3945a', border: 'none', borderRadius: 14, color: '#000', fontWeight: 700, cursor: 'pointer' }}>Permanent Keep</button>
              <button onClick={() => { setShowGallerySecureModal(false); setPendingFile(null); }} style={{ padding: 14, background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', marginTop: 8 }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Secure Viewer Overlay */}
      {viewingSecureMsg && (
        <SecureViewer 
          mediaUrl={viewingSecureMsg.media_url}
          messageId={viewingSecureMsg.id}
          type={viewingSecureMsg.message_type}
          onClosed={() => {
            onSecurityEvent('view');
            setViewingSecureMsg(null);
          }}
          onCompromised={() => {
            onSecurityEvent('compromise');
            setViewingSecureMsg(null);
          }}
        />
      )}

      {/* Media Save Request Modal (Partner View) */}
      {saveRequest && (
        <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ maxWidth:360, width:'100%', textAlign:'center', border: '1px solid var(--accent)', padding: 30 }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Icons.Vault size={48} color="var(--accent)" /></div>
            <h3 style={{ marginBottom:10 }}>Save Request</h3>
            <p style={{ fontSize:'0.95rem', color:'#fff', marginBottom:24 }}>
              <b>{saveRequest.from}</b> wants to save a photo to their phone gallery. Do you allow this?
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-g" onClick={() => respondSave(false)} style={{ flex: 1, padding: 14 }}>Deny</button>
              <button className="btn btn-p" onClick={() => respondSave(true)} style={{ flex: 1, padding: 14, color: '#000', fontWeight: 700 }}>Allow Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Requesting Status (User View) */}
      {requestingSave && (
        <div style={{ position: 'fixed', top: 100, left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: '#000', padding: '12px 24px', borderRadius: 99, fontWeight: 700, zIndex: 100, boxShadow: '0 10px 30px rgba(201,169,110,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="spinner-small" style={{ borderTopColor: '#000' }} /> Requesting Permission...
        </div>
      )}


      {/* Messages */}
      <div style={{ height: '100%', overflowY:'auto', padding:'100px 16px 80px', position: 'relative' }}>
        <DynamicPresence partner={partner} state={partnerPresence} mood={partnerMood} />
        {msgs.map(msg => {
          const isSecure = msg.is_once_view;
          const isSpent = isSecure && msg.views_used >= msg.view_limit;
          const isCompromised = msg.is_compromised;
          
          return (
             <div key={msg.id} style={{ marginBottom: 12, display: 'flex', gap: 8, justifyContent: isMe(msg) ? 'flex-end' : 'flex-start', animation: 'fadeInUp 0.3s ease-out' }}>
              {!isMe(msg) && (
                 <div className="avatar" style={{ width: 30, height: 30, fontSize: '0.8rem', overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-end', border: '1px solid rgba(255,255,255,0.08)' }}>
                   {partner?.avatar_url ? <img src={partner.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : partner?.name?.[0]?.toUpperCase()}
                 </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe(msg) ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                <div
                  onClick={(e) => {
                  if (isSecure && !isMe(msg) && !isSpent && !isCompromised) {
                    handleSecureView(msg);
                  } else if (msg.message_type === 'image' && user?.blur_sensitive && !unblurred[msg.id]) {
                    setUnblurred(prev => ({ ...prev, [msg.id]: true }));
                  } else {
                    onReplyTarget?.(msg);
                  }
                  }}
                  style={{ 
                    padding: msg.message_type === 'image' || msg.message_type === 'video' ? '4px' : '12px 18px', 
                    background: msg.message_type === 'image' || msg.message_type === 'video' ? 'transparent' : (isMe(msg) ? 'var(--accent)' : 'rgba(255,255,255,0.06)'), 
                    color: isMe(msg) ? '#000' : '#fff', 
                    borderRadius: 22,
                    borderBottomRightRadius: isMe(msg) ? 6 : 22,
                    borderBottomLeftRadius: isMe(msg) ? 22 : 6,
                    boxShadow: (msg.message_type === 'image' || msg.message_type === 'video') ? 'none' : (isMe(msg) ? '0 6px 20px rgba(201,169,110,0.2)' : '0 4px 15px rgba(0,0,0,0.2)'),
                    position: 'relative',
                    cursor: isSecure ? 'pointer' : 'default',
                    border: isSecure ? (isMe(msg) ? '1px solid rgba(0,0,0,0.2)' : '1px solid #b3945a') : (msg.message_type === 'image' || msg.message_type === 'video' ? 'none' : (isMe(msg) ? 'none' : '1px solid rgba(255,255,255,0.08)')),
                    overflow: 'hidden',
                    backdropFilter: 'blur(16px)',
                    minWidth: isSecure ? 180 : 0
                  }}
                >
                {msg.message_type === 'video' ? (
                  isSecure ? (
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      {isCompromised ? <Icons.Shield size={24} color="#FF3B30" /> : isSpent ? <Icons.Vault size={24} color="var(--muted)" /> : <Icons.Video size={24} color="var(--accent)" />}
                      <div style={{ fontSize:'0.9rem' }}>
                        <div style={{ fontWeight:600 }}>{isCompromised ? 'Compromised' : isSpent ? 'Viewed' : 'Ephemeral Video'}</div>
                        {!isSpent && !isCompromised && <div style={{ fontSize:'0.75rem', opacity:0.6 }}>Tap to scan & play</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <video 
                        src={(() => {
                          let url = msg.media_url;
                          if (url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
                            try { url = (import.meta.env.VITE_API_URL || '') + new URL(url).pathname; } catch(e){}
                          }
                          return url;
                        })()}
                        controls
                        style={{ 
                          width:'100%', 
                          maxHeight:400, 
                          display:'block', 
                          borderRadius:14,
                          filter: (user?.blur_sensitive && !unblurred[msg.id]) ? 'blur(25px)' : 'none',
                          transition: 'filter 0.3s ease'
                        }} 
                      />
                      {user?.blur_sensitive && !unblurred[msg.id] && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(0,0,0,0.2)', pointerEvents: 'none' }}>
                          TAP TO REVEAL
                        </div>
                      )}
                    </div>
                  )
                ) : msg.message_type === 'image' ? (
                  isSecure ? (
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      {isCompromised ? <Icons.Shield size={24} color="#FF3B30" /> : isSpent ? <Icons.Vault size={24} color="var(--muted)" /> : <Icons.Vault size={24} color="var(--accent)" />}
                      <div style={{ fontSize:'0.9rem' }}>
                        <div style={{ fontWeight:600 }}>{isCompromised ? 'Compromised' : isSpent ? 'Viewed' : 'Ephemeral Media'}</div>
                        {!isSpent && !isCompromised && <div style={{ fontSize:'0.75rem', opacity:0.6 }}>Tap to scan & reveal</div>}
                      </div>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={(() => {
                          let url = msg.media_url;
                          if (url && (url.includes('localhost') || url.includes('127.0.0.1'))) {
                            try { url = (import.meta.env.VITE_API_URL || '') + new URL(url).pathname; } catch(e){}
                          }
                          return url;
                        })()}
                        style={{ 
                          width:'100%', 
                          maxHeight:400, 
                          display:'block', 
                          borderRadius:14,
                          filter: (user?.blur_sensitive && !unblurred[msg.id]) ? 'blur(25px)' : 'none',
                          transition: 'filter 0.3s ease'
                        }} 
                      />
                      {user?.blur_sensitive && !unblurred[msg.id] && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.75rem', fontWeight: 600, background: 'rgba(0,0,0,0.2)' }}>
                          TAP TO REVEAL
                        </div>
                      )}
                      {!isMe(msg) && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); requestSave(msg); }}
                          style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: 10, padding: '6px 10px', color: '#fff', fontSize: '0.65rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, backdropFilter: 'blur(10px)' }}
                        >
                          <Icons.Download size={12} /> SAVE
                        </button>
                      )}
                    </div>
                  )
                ) : msg.message_type === 'audio' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: isMe(msg) ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icons.Mic size={18} color={isMe(msg) ? '#000' : '#b3945a'} />
                    </div>
                    <audio src={msg.media_url} controls style={{ height: 36, width: 200 }} />
                  </div>
                ) : <span style={{ fontSize:'1rem', whiteSpace:'pre-wrap', lineHeight: 1.5 }}>{msg.text}</span>}
                </div>
                <span style={{ fontSize:'0.7rem', color: isMe(msg) ? 'var(--accent)' : 'var(--muted)', marginTop:4, opacity: 0.8, fontWeight: 500 }}>{ts(msg)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '8px 16px 8px', zIndex: 1000 }}>
        
        <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />
        
        <div style={{ 
          display: 'flex', 
          gap: 10, 
          alignItems: 'center', 
          background: 'rgba(22,22,26,0.65)', 
          backdropFilter: 'blur(25px) saturate(200%)', 
          border: '1px solid rgba(255,255,255,0.1)', 
          borderRadius: 28, 
          padding: '10px 10px 10px 16px', 
          boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
          width: '100%'
        }}>
          
          {/* Left Side Icons */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{ padding: '8px', background:'transparent', border:'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setShowingStudio(true)}>
              <Icons.Camera size={22} color="var(--muted)" />
            </button>
            <button style={{ padding: '8px', background:'transparent', border:'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => fileRef.current?.click()}>
              <Icons.Gallery size={22} color="var(--muted)" />
            </button>
          </div>
          
          {/* Text Area */}
          <input
            value={text} 
            onChange={handleType} 
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder={isRecordingAudio ? "Recording Voice Note..." : "Message"} 
            disabled={isRecordingAudio}
            style={{ 
              flex: 1, 
              background: 'transparent', 
              border: 'none', 
              color: isRecordingAudio ? '#ff4b2b' : '#fff', 
              fontSize: '1rem', 
              outline: 'none', 
              padding: '6px 0',
              minWidth: 0
            }} 
          />

          {/* Right Side Icons (Mic / Send) */}
          <button 
            onPointerDown={text.trim().length === 0 ? startVoiceRecord : undefined}
            onPointerUp={text.trim().length === 0 ? stopVoiceRecord : undefined}
            onPointerLeave={text.trim().length === 0 ? stopVoiceRecord : undefined}
            onClick={text.trim().length > 0 ? send : undefined}
            disabled={sending && text.trim().length > 0}
            style={{ 
              width: 44, 
              height: 44, 
              borderRadius: '50%', 
              background: isRecordingAudio ? '#ff4b2b' : (text.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.05)'), 
              border: text.trim() ? 'none' : '1px solid rgba(255,255,255,0.1)',
              cursor: text.trim() || !sending ? 'pointer' : 'default', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              flexShrink: 0, 
              transition: 'all 0.2s', 
              boxShadow: text.trim() ? '0 6px 18px rgba(201,169,110,0.35)' : 'none',
              transform: isRecordingAudio ? 'scale(1.2)' : 'scale(1)'
            }} 
          >
            {text.trim().length > 0 ? (
              <Icons.Send size={20} color="#000" />
            ) : (
              <Icons.Mic size={20} color={isRecordingAudio ? '#fff' : 'var(--muted)'} />
            )}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}
      `}</style>
      </div>
    </div>
  );
}
