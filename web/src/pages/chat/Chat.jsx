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
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [partner, setPartner] = useState(null);
  const [typing, setTyping] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [reactTo, setReactTo] = useState(null);
  const [sending, setSending] = useState(false);
  
// Security State
  const [pendingFile, setPendingFile] = useState(null);
  const [showSecurityOptions, setShowSecurityOptions] = useState(false);
  const [unblurred, setUnblurred] = useState({}); // Tracking unblurred msgs manually

  // Presence & Theme State
  const [viewingSecureMsg, setViewingSecureMsg] = useState(null);
  const [space, setSpace] = useState(null);
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
      setSpace(d.space);
    });
    getMessages().then(setMsgs);

    const offs = [
      wsService.on('chat_message', msg => setMsgs(prev => [...prev, msg])),
      wsService.on('typing', d => { if (d.user_id !== user?.id) setTyping(d.is_typing); }),
      wsService.on('presence', d => { if (d.user_id !== user?.id) setPartnerOnline(d.online); }),
      wsService.on('presence_state', d => { 
        if (d.user_id !== user?.id) {
          setPartnerPresence(d.state);
          setPartnerMood(d.mood || 'neutral');
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
      wsService.send('presence_state', { state: st, mood: selfMood });
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
    wsService.send('presence_state', { state: st, mood: selfMood });
  }, [viewingSecureMsg, selfMood]);

  const handleType = e => {
    setText(e.target.value);
    wsService.send('presence_state', { state: e.target.value.length > 0 ? 'typing' : 'peeking', mood: selfMood });
    wsService.sendTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
       wsService.sendTyping(false);
       wsService.send('presence_state', { state: 'peeking', mood: selfMood });
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
    setShowSecurityOptions(true); // Show the "How to send?" modal
  };

  const sendMedia = async (mode = 'standard') => {
    if (!pendingFile) return;
    setSending(true);
    setShowSecurityOptions(false);
    
    try {
      const { media_url } = await uploadMedia(pendingFile);
      const isOnceView = mode !== 'standard';
      const limit = mode === 'twice' ? 2 : 1;
      
      const type = pendingFile.type.startsWith('video') ? 'video' : 'image';
      wsService.sendMessage('', type, media_url, isOnceView, limit);
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
  const ts = m => m.timestamp ? format(new Date(m.timestamp), 'h:mm a') : '';

  const activeThemeId = space?.theme_id || 'classic';
  const activeTheme = CHAT_THEMES[activeThemeId] || CHAT_THEMES.classic;

  return (
    <div style={{ 
      display:'flex', 
      flexDirection:'column', 
      height:'100vh', 
      background: space?.chat_wallpaper ? `url(${space.chat_wallpaper})` : activeTheme.bg,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      position: 'relative'
    }}>
      {/* Background Glows */}
      <div style={{ position: 'fixed', top: '10%', right: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(201,169,110,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: '10%', left: '5%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(124,111,205,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Wallpaper Darken Overlay */}
      {space?.chat_wallpaper && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', pointerEvents: 'none', backdropFilter: 'blur(2px)' }} />}
      
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
          onCapture={(file) => { setPendingFile(file); setShowingStudio(false); setShowSecurityOptions(true); }}
          onClose={() => setShowingStudio(false)}
        />
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

      {/* Header */}
      <header className="header" onClick={() => setShowThemePicker(true)} style={{ 
        cursor: 'pointer', 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
      }}>
        <Link to="/dashboard" style={{ color:'var(--muted)', display: 'flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}><Icons.Back size={24} /></Link>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div className="avatar" style={{ width: 40, height: 40, fontSize:'1rem', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)' }}>
            {partner?.avatar_url ? <img src={partner.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : partner?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text)' }}>{partner?.name || 'Partner'}</div>
            <div style={{ fontSize:'0.75rem', color: partnerOnline ? 'var(--success)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: partnerOnline ? 'var(--success)' : 'var(--muted)' }}></span>
              {partnerOnline ? 'Online' : 'Offline'}
            </div>
          </div>
          <Icons.Back size={14} color="var(--muted)" style={{ transform: 'rotate(-90deg)', marginLeft: 8 }} />
        </div>
        <div style={{ display: 'flex', gap: 16 }} onClick={e => e.stopPropagation()}>
          <Link to="/call?type=voice" style={{ display: 'flex', alignItems: 'center' }}><Icons.Phone size={24} color="var(--accent)" /></Link>
          <Link to="/call?type=video" style={{ display: 'flex', alignItems: 'center' }}><Icons.Video size={24} color="var(--accent)" /></Link>
        </div>
      </header>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'12px 16px', paddingBottom:80, position: 'relative' }}>
        <DynamicPresence partner={partner} state={partnerPresence} mood={partnerMood} />
        {msgs.map(msg => {
          const isSecure = msg.is_once_view;
          const isSpent = isSecure && msg.views_used >= msg.view_limit;
          const isCompromised = msg.is_compromised;
          
          return (
            <div key={msg.id} style={{ marginBottom:10, display:'flex', gap: 8, flexDirection: isMe(msg) ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
              {!isMe(msg) && (
                 <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.7rem', overflow: 'hidden', flexShrink: 0, marginTop: 4 }}>
                   {partner?.avatar_url ? <img src={partner.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : partner?.name?.[0]?.toUpperCase()}
                 </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMe(msg) ? 'flex-end' : 'flex-start', flex: 1 }}>
                <div
                  onClick={(e) => {
                  if (isSecure && !isMe(msg) && !isSpent && !isCompromised) {
                    handleSecureView(msg);
                  } else if (msg.message_type === 'image' && user?.blur_sensitive && !unblurred[msg.id]) {
                    setUnblurred(prev => ({ ...prev, [msg.id]: true }));
                  } else {
                    setReactTo(reactTo === msg.id ? null : msg.id);
                  }
                }}
                style={{ 
                  maxWidth:'78%', 
                  padding: (msg.message_type === 'image' && !isSecure) ? 0 : '14px 20px', 
                  borderRadius: 24, 
                  cursor:'pointer', 
                  borderBottomRightRadius: isMe(msg) ? 6 : 24, 
                  borderBottomLeftRadius: isMe(msg) ? 24 : 6, 
                  background: isMe(msg) ? 'var(--accent)' : 'rgba(255, 255, 255, 0.06)', 
                  color: isMe(msg) ? '#000' : '#fff', 
                  border: isMe(msg) ? 'none' : '1px solid rgba(255,255,255,0.1)', 
                  backdropFilter: 'blur(16px)',
                  overflow:'hidden', 
                  position: 'relative',
                  minWidth: isSecure ? 180 : 0,
                  boxShadow: isMe(msg) ? '0 10px 25px rgba(201,169,110,0.2)' : '0 10px 25px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                  transform: 'translateZ(0)'
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
                        src={msg.media_url} 
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
                        src={msg.media_url} 
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
      <div style={{ 
        position:'fixed', 
        bottom: 20, 
        left: 20, 
        right: 20, 
        background:'rgba(22, 22, 26, 0.65)', 
        backdropFilter: 'blur(25px) saturate(200%)', 
        border:'1px solid rgba(255,255,255,0.1)', 
        borderRadius: 28,
        padding:'16px', 
        display:'flex', 
        flexDirection: 'column', 
        gap: 12,
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        zIndex: 100
      }}>
        <ReactionPicker currentMood={selfMood} onSelect={setSelfMood} />
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />
          <button className="btn btn-g" style={{ padding: '10px', flexShrink:0, background:'rgba(255,255,255,0.05)', borderRadius:'50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowingStudio(true)}><Icons.Camera size={22} /></button>
          <button className="btn btn-g" style={{ padding: '10px', flexShrink:0, background:'rgba(255,255,255,0.05)', borderRadius:'50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => fileRef.current?.click()}><Icons.Gallery size={22} /></button>
          
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 20, padding: '4px 16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <textarea className="inp" value={text} onChange={handleType} onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder="Whisper something..." rows={1} style={{ width: '100%', resize:'none', background:'transparent', border:'none', borderRadius:0, padding:'10px 0', minHeight: 44, fontSize:'1.05rem', color: '#fff', outline: 'none' }} />
          </div>

          <button className="btn btn-p" style={{ padding:'0', borderRadius:'50%', flexShrink:0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, boxShadow: '0 8px 20px rgba(201,169,110,0.4)' }} onClick={send} disabled={sending||!text.trim()}>
            <Icons.Send size={24} color="#000" />
          </button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}
