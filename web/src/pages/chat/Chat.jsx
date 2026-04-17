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
import PaxlyStudio from '../../components/chat/PaxlyStudio';
import { CHAT_THEMES } from '../../data/chatThemes';
import axios from 'axios';

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
      
      wsService.sendMessage('', 'image', media_url, isOnceView, limit);
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
        <PaxlyStudio 
          onCapture={(file) => { setPendingFile(file); setShowingStudio(false); setShowSecurityOptions(true); }}
          onClose={() => setShowingStudio(false)}
        />
      )}

      {/* Secure Viewer Overlay */}
      {viewingSecureMsg && (
        <SecureViewer 
          mediaUrl={viewingSecureMsg.media_url}
          messageId={viewingSecureMsg.id}
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

      {/* Security Options Modal */}
      {showSecurityOptions && (
        <div className="modal-overlay" style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ maxWidth:320, width:'100%', textAlign:'center' }}>
            <h3 style={{ marginBottom:10 }}>Privacy Options</h3>
            <p style={{ fontSize:'0.85rem', color:'var(--muted)', marginBottom:20 }}>How should your partner see this?</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <button className="btn btn-g" onClick={() => sendMedia('standard')} style={{ width:'100%', padding:12 }}>🔓 Standard (Saveable)</button>
              <button className="btn btn-p" onClick={() => sendMedia('once')} style={{ width:'100%', padding:12 }}>👁️ View Once (AI Protected)</button>
              <button className="btn btn-p" onClick={() => sendMedia('twice')} style={{ width:'100%', padding:12, opacity:0.8 }}>👀 View Twice</button>
              <button onClick={() => { setShowSecurityOptions(false); setPendingFile(null); }} style={{ marginTop:10, background:'none', border:'none', color:'var(--muted)', cursor:'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="header" onClick={() => setShowThemePicker(true)} style={{ 
        cursor: 'pointer', 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '12px 20px',
        borderRadius: '16px'
      }}>
        <Link to="/dashboard" style={{ color:'var(--muted)' }} onClick={e => e.stopPropagation()}>←</Link>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div className="avatar" style={{ width:32, height:32, fontSize:'0.78rem', overflow: 'hidden' }}>
            {partner?.avatar_url ? <img src={partner.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : partner?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight:500 }}>{partner?.name || 'Partner'}</div>
            <div style={{ fontSize:'0.7rem', color: partnerOnline ? 'var(--success)' : 'var(--muted)' }}>{partnerOnline ? '● Online' : '○ Offline'}</div>
          </div>
          <span style={{ fontSize: '0.6rem', color: 'var(--muted)', marginLeft: 4 }}>⌵</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }} onClick={e => e.stopPropagation()}>
          <Link to="/call?type=voice" style={{ fontSize: '1.2rem', textDecoration: 'none' }}>🎙️</Link>
          <Link to="/call?type=video" style={{ fontSize: '1.2rem', textDecoration: 'none' }}>📹</Link>
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
                  maxWidth:'75%', 
                  padding: (msg.message_type === 'image' && !isSecure) ? 0 : '12px 18px', 
                  borderRadius:20, 
                  cursor:'pointer', 
                  borderBottomRightRadius: isMe(msg)?4:20, 
                  borderBottomLeftRadius: isMe(msg)?20:4, 
                  background: isMe(msg) ? 'rgba(201, 169, 110, 0.15)' : 'rgba(255, 255, 255, 0.04)', 
                  color: '#fff', 
                  border: isMe(msg) ? '1px solid rgba(201, 169, 110, 0.2)' : '1px solid rgba(255,255,255,0.08)', 
                  backdropFilter: 'blur(10px)',
                  overflow:'hidden', 
                  position: 'relative',
                  minWidth: isSecure ? 160 : 0,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                  transition: 'transform 0.2s',
                  transform: 'translateZ(0)'
                }}
              >
                {msg.message_type === 'image' ? (
                  isSecure ? (
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <span style={{ fontSize:'1.4rem' }}>{isCompromised ? '🚫' : isSpent ? '⌛' : '👁️'}</span>
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
                    </div>
                  )
                ) : <span style={{ fontSize:'0.93rem', whiteSpace:'pre-wrap' }}>{msg.text}</span>}
                </div>
                <span style={{ fontSize:'0.67rem', color:'var(--muted)', marginTop:2 }}>{ts(msg)}</span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ 
        position:'sticky', 
        bottom:20, 
        left:20, 
        right:20, 
        background:'rgba(22, 22, 26, 0.4)', 
        backdropFilter: 'blur(25px) saturate(180%)', 
        border:'1px solid rgba(255,255,255,0.1)', 
        borderRadius: 24,
        margin: '0 20px 20px',
        padding:'12px 16px', 
        display:'flex', 
        flexDirection: 'column', 
        gap:6,
        boxShadow: '0 10px 50px rgba(0,0,0,0.5)'
      }}>
        <ReactionPicker currentMood={selfMood} onSelect={setSelfMood} />
        
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <input type="file" ref={fileRef} accept="image/*" onChange={onFileSelect} style={{ display:'none' }} />
          <button className="btn btn-g" style={{ padding:10, flexShrink:0, background:'rgba(255,255,255,0.05)', borderRadius:'50%' }} onClick={() => setShowingStudio(true)}>📷</button>
          <textarea className="inp" value={text} onChange={handleType} onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); send(); }}} placeholder="Whisper something..." rows={1} style={{ flex:1, resize:'none', background:'transparent', border:'none', borderRadius:0, padding:'10px 4px', minHeight:40, fontSize:'1rem' }} />
          <button className="btn btn-p" style={{ padding:'10px 20px', borderRadius:16, flexShrink:0, boxShadow: '0 4px 15px rgba(201,169,110,0.3)' }} onClick={send} disabled={sending||!text.trim()}>Send</button>
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}
