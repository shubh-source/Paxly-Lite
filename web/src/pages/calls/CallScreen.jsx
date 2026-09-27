import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { wsService } from '../../services/websocket';
import api, { getSpace } from '../../services/api';
import { Icons } from '../../components/ui/Icons';
import { useAuth } from '../../context/AuthContext';
import { format } from 'date-fns';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

export default function CallScreen() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initType = params.get('type') || 'video';
  const isHistoryView = params.get('view') === 'history';

  const [callState, setCallState] = useState('idle'); // idle | calling | incoming | connecting | connected | history
  const [callType, setCallType] = useState(initType);
  const [partner, setPartner] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [facingMode, setFacingMode] = useState('user'); // 'user' | 'environment'
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState([]);
  const [audioRoute, setAudioRoute] = useState('speaker');
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const timer = useRef(null);
  const startTime = useRef(null);

  useEffect(() => {
    getSpace().then(d => setPartner(d.partner));

    if (isHistoryView) {
      setCallState('history');
      fetchHistory();
    } else if (wsService.latestOffer) {
      setIncomingOffer(wsService.latestOffer);
      setCallType(wsService.latestOffer.call_type);
      if (params.get('action') === 'answer') {
        setCallState('connecting');
      } else {
        setCallState('incoming');
      }
      wsService.latestOffer = null;
    } else if (params.get('type')) {
      startCall(params.get('type'));
    }

    const offs = [
      wsService.on('webrtc_offer', async d => {
        setIncomingOffer(d);
        setCallType(d.call_type);
        setCallState('incoming');
      }),
      wsService.on('webrtc_answer', async d => {
        if (pc.current) {
          const remoteDesc = typeof d.sdp === 'string' ? { type: 'answer', sdp: d.sdp } : d.sdp;
          await pc.current.setRemoteDescription(remoteDesc);
        }
      }),
      wsService.on('webrtc_ice', async d => {
        if (pc.current && d.candidate) {
          try {
            await pc.current.addIceCandidate({ candidate: d.candidate, sdpMLineIndex: d.sdpMLineIndex, sdpMid: d.sdpMid });
          } catch {}
        }
      }),
      wsService.on('webrtc_end', () => endCall(false)),
      wsService.on('webrtc_reject', () => endCall(false)),
    ];

    return () => { 
      offs.forEach(off => off()); 
      cleanup(); 
    };
  }, [isHistoryView]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/calls/history');
      setHistory(res.data || []);
    } catch (err) {
      console.error("Failed to fetch call history", err);
    }
  };

  const createPC = () => {
    const p = new RTCPeerConnection(ICE_SERVERS);
    p.onicecandidate = e => {
      if (e.candidate) wsService.sendIceCandidate(e.candidate.candidate, e.candidate.sdpMLineIndex, e.candidate.sdpMid);
    };
    p.ontrack = e => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    p.onconnectionstatechange = () => {
      if (p.connectionState === 'connected') {
        setCallState('connected');
        startTime.current = Date.now();
        if (!timer.current) {
          timer.current = setInterval(() => setDuration(d => d + 1), 1000);
        }
      } else if (p.connectionState === 'failed' || p.connectionState === 'closed') {
        endCall(false);
      }
    };
    return p;
  };

  const startCall = async (type) => {
    setCallType(type);
    setCallState('calling');
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false 
      });
      if (localRef.current) localRef.current.srcObject = localStream.current;
      pc.current = createPC();
      localStream.current.getTracks().forEach(t => pc.current.addTrack(t, localStream.current));
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      wsService.sendOffer(offer, type);
    } catch (err) {
      console.error("Start call failed:", err);
      setCallState('idle');
      nav('/chat');
    }
  };

  useEffect(() => {
    if (incomingOffer && params.get('action') === 'answer' && callState === 'connecting') {
      answerCall();
    }
  }, [incomingOffer]);

  const answerCall = async () => {
    if (!incomingOffer) return;
    setCallState('connecting');
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: incomingOffer.call_type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false 
      });
      if (localRef.current) localRef.current.srcObject = localStream.current;
      pc.current = createPC();
      localStream.current.getTracks().forEach(t => pc.current.addTrack(t, localStream.current));
      const remoteDesc = typeof incomingOffer.sdp === 'string' ? { type: 'offer', sdp: incomingOffer.sdp } : incomingOffer.sdp;
      await pc.current.setRemoteDescription(remoteDesc);
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      wsService.sendAnswer(answer);
    } catch (err) {
      console.error("Answer call failed:", err);
      endCall(true);
    }
  };

  const endCall = (sendSignal = true) => {
    if (duration > 0) {
      wsService.send({
        type: 'webrtc_log',
        caller_id: callState === 'calling' || callState === 'connected' ? user?.id : partner?.id,
        recipient_id: callState === 'calling' || callState === 'connected' ? partner?.id : user?.id,
        call_type: callType,
        duration: duration
      });
    }

    if (sendSignal) wsService.endCall();
    cleanup();
    setCallState(isHistoryView ? 'history' : 'idle');
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setDuration(0);
    if (!isHistoryView) nav('/chat');
  };

  const cleanup = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    if (pc.current) {
      pc.current.close();
      pc.current = null;
    }
    localStream.current = null;
  };

  const toggleMute = () => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach(t => t.enabled = muted);
    }
    setMuted(!muted);
  };

  const toggleVideo = () => {
    if (localStream.current && callType === 'video') {
      localStream.current.getVideoTracks().forEach(t => t.enabled = camOff);
    }
    setCamOff(!camOff);
  };

  const flipCamera = async () => {
    if (callType !== 'video' || !localStream.current) return;
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    try {
      localStream.current.getVideoTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: nextMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find(s => s.track?.kind === 'video');
      if (sender) sender.replaceTrack(newVideoTrack);
      
      const audioTracks = localStream.current.getAudioTracks();
      localStream.current = new MediaStream([newVideoTrack, ...audioTracks]);
      if (localRef.current) localRef.current.srcObject = localStream.current;
      setFacingMode(nextMode);
    } catch (err) {
      console.error("Flip camera failed:", err);
    }
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // ── CALL HISTORY VIEW ───────────────────────────────────────
  if (callState === 'history') {
    return (
      <div className="page" style={{ paddingBottom: 80, backgroundColor: '#09090b', color: '#fff', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        <header className="header" style={{ 
          background: 'rgba(20, 20, 24, 0.7)', 
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
          margin: '20px 20px 16px',
          borderRadius: '24px',
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <Link to="/chat" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>
            <Icons.Back size={22} />
          </Link>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '0.3px', color: '#fff' }}>
            Call Vault & Logs
          </span>
          <div style={{ width: 24 }} />
        </header>

        <div className="content" style={{ padding: '0 20px' }}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.4)' }}>
              <div style={{ fontSize: '2.8rem', marginBottom: 12 }}>📞</div>
              <h3 style={{ color: '#fff', fontWeight: 600, margin: 0 }}>No Call Logs Yet</h3>
              <p style={{ fontSize: '0.85rem', marginTop: 6 }}>Your audio and video call history with your partner will appear here.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map(log => {
                const isMe = log.caller_id === user?.id;
                return (
                  <div key={log.id} style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 20, 
                    padding: '16px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%',
                        background: isMe ? 'rgba(201,169,110,0.15)' : 'rgba(124,111,205,0.15)',
                        border: `1px solid ${isMe ? 'rgba(201,169,110,0.3)' : 'rgba(124,111,205,0.3)'}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {log.call_type === 'video' 
                          ? <Icons.Video size={18} color={isMe ? '#C9A96E' : '#7C6FCD'} /> 
                          : <Icons.Phone size={18} color={isMe ? '#C9A96E' : '#7C6FCD'} />
                        }
                      </div>
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                          {isMe ? 'Outgoing Call' : 'Incoming Call'}
                        </p>
                        <p style={{ margin: '3px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontWeight: 800, color: '#C9A96E', fontSize: '1.1rem', fontFamily: 'monospace' }}>
                        {fmt(log.duration)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CALL SCREEN RENDER ──────────────────────────────────────
  return (
    <div style={{ 
      position: 'fixed', inset: 0,
      backgroundColor: '#09090c',
      color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center',
      overflow: 'hidden', fontFamily: 'DM Sans, sans-serif', zIndex: 999999
    }}>
      {/* Luxury Background Glows */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle at 50% 25%, rgba(201,169,110,0.14) 0%, rgba(124,111,205,0.08) 40%, #09090c 80%)'
      }} />

      {/* Subtle Animated Aurora Orb */}
      <motion.div
        animate={{ scale: [1, 1.2, 0.95, 1.1, 1], opacity: [0.15, 0.28, 0.18, 0.25, 0.15] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: 'absolute', top: '15%', left: '15%', width: '70vw', height: '70vw',
          background: 'radial-gradient(circle, #C9A96E 0%, #7C6FCD 50%, transparent 70%)',
          filter: 'blur(120px)', zIndex: 0, pointerEvents: 'none'
        }}
      />

      {/* ── TOP BAR (Header & Security Badge) ───────────────── */}
      <div style={{
        width: '100%', maxWidth: 500, padding: '24px 24px 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        zIndex: 20, position: 'relative'
      }}>
        <button
          onClick={() => nav('/chat')}
          title="Minimize & Return to Chat"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, width: 42, height: 42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', cursor: 'pointer', backdropFilter: 'blur(16px)'
          }}
        >
          <Icons.Back size={20} />
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.09)',
          padding: '6px 14px', borderRadius: 20
        }}>
          <Icons.Shield size={13} color="#C9A96E" />
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.75)', letterSpacing: '0.5px' }}>
            {callType === 'video' ? 'Ultra-HD Video' : 'Private Voice'} • E2EE
          </span>
        </div>

        <button
          onClick={() => setShowAudioMenu(true)}
          title="Audio Output Device"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, width: 42, height: 42,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: audioRoute !== 'earpiece' ? '#C9A96E' : '#fff', cursor: 'pointer', backdropFilter: 'blur(16px)'
          }}
        >
          {audioRoute === 'speaker' ? <Icons.Volume2 size={19} /> : <Icons.Phone size={19} />}
        </button>
      </div>

      {/* ── REMOTE VIDEO (Full Background for Video Calls) ───── */}
      {callType === 'video' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          opacity: callState === 'connected' ? 1 : 0,
          transition: 'opacity 0.6s ease', background: '#050507'
        }}>
          <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {/* Cinematic Scrims */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 140, background: 'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, transparent 100%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)', pointerEvents: 'none' }} />
        </div>
      )}

      {/* ── LOCAL VIDEO PiP (Self view in video call) ────────── */}
      {callType === 'video' && callState === 'connected' && (
        <motion.div
          drag
          dragConstraints={{ top: 80, left: -140, right: 140, bottom: 260 }}
          dragElastic={0.1}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            position: 'absolute', top: 90, right: 20,
            width: 110, height: 160, borderRadius: 20,
            overflow: 'hidden',
            border: '2px solid rgba(201,169,110,0.4)',
            background: '#121216', zIndex: 25,
            boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
            cursor: 'grab'
          }}
        >
          <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: camOff ? 0 : 1 }} />
          {camOff && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#18181f' }}>
              <Icons.Camera size={24} color="rgba(255,255,255,0.3)" />
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Cam Off</span>
            </div>
          )}
          {/* Mini Flip Button */}
          <button
            onClick={flipCamera}
            style={{
              position: 'absolute', bottom: 6, right: 6,
              background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', cursor: 'pointer', backdropFilter: 'blur(8px)'
            }}
          >
            🔄
          </button>
        </motion.div>
      )}

      {/* ── CENTER CONTENT (Avatar, Name, Timer, Equalizer) ── */}
      {(callType !== 'video' || callState !== 'connected') && (
        <div style={{
          zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', marginTop: 'auto', marginBottom: 'auto', width: '100%', padding: '0 20px'
        }}>
          
          {/* Avatar with Animated Pulsing Radar Rings */}
          <div style={{ position: 'relative', width: 140, height: 140, marginBottom: 28 }}>
            {(callState === 'calling' || callState === 'incoming' || callState === 'connected') && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.45, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
                  style={{ position: 'absolute', inset: -14, borderRadius: '50%', border: '2px solid #C9A96E', filter: 'blur(2px)' }}
                />
                <motion.div
                  animate={{ scale: [1, 1.75, 1], opacity: [0.25, 0, 0.25] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                  style={{ position: 'absolute', inset: -24, borderRadius: '50%', border: '1px solid #7C6FCD', filter: 'blur(3px)' }}
                />
              </>
            )}

            <div style={{
              width: '100%', height: '100%', borderRadius: '50%',
              background: 'linear-gradient(135deg, #1c1815, #0e0d12)',
              border: '3px solid rgba(201,169,110,0.6)',
              boxShadow: '0 0 40px rgba(201,169,110,0.25), inset 0 0 20px rgba(0,0,0,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', zIndex: 2, overflow: 'hidden'
            }}>
              {partner?.avatar_url ? (
                <img src={partner.avatar_url} alt="Partner Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '3.4rem', fontFamily: 'Cormorant Garamond, serif', fontWeight: 600, color: '#C9A96E' }}>
                  {partner?.name?.[0]?.toUpperCase() || 'S'}
                </span>
              )}
            </div>
          </div>

          {/* Partner Name */}
          <h1 style={{
            fontSize: '2.2rem', fontWeight: 700, fontFamily: 'Cormorant Garamond, serif',
            letterSpacing: '0.5px', margin: 0, color: '#fff', textAlign: 'center'
          }}>
            {partner?.name || 'Partner'}
          </h1>

          {/* Call Status / Timer */}
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            {callState === 'connected' && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6ECFA0', boxShadow: '0 0 8px #6ECFA0' }} />
            )}
            <span style={{
              fontSize: callState === 'connected' ? '1.2rem' : '0.9rem',
              fontWeight: callState === 'connected' ? 700 : 500,
              color: callState === 'connected' ? '#C9A96E' : 'rgba(255,255,255,0.6)',
              fontFamily: callState === 'connected' ? 'monospace' : 'inherit',
              letterSpacing: callState === 'connected' ? '2px' : '0.5px'
            }}>
              {callState === 'connected' ? fmt(duration)
                : callState === 'calling' ? 'Calling partner...'
                : callState === 'connecting' ? 'Connecting encryption...'
                : callState === 'incoming' ? 'Incoming call request...'
                : 'Ready'}
            </span>
          </div>

          {/* Dynamic Audio Equalizer Waveform while connected */}
          {callState === 'connected' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 5, height: 26 }}
            >
              {[18, 30, 14, 26, 36, 22, 12, 28, 32, 16, 24, 30, 14].map((h, i) => (
                <motion.div
                  key={i}
                  animate={{ height: [6, h, 6] }}
                  transition={{ duration: 0.6 + (i % 4) * 0.15, repeat: Infinity, ease: 'easeInOut', delay: i * 0.06 }}
                  style={{
                    width: 3.5,
                    background: 'linear-gradient(to top, #C9A96E, #7C6FCD)',
                    borderRadius: 4
                  }}
                />
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* ── VIDEO CALL TIMER (Overlay in Connected Video Call) ── */}
      {callType === 'video' && callState === 'connected' && (
        <div style={{
          position: 'absolute', top: 90, left: 24,
          padding: '6px 14px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 20, zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6ECFA0', boxShadow: '0 0 8px #6ECFA0' }} />
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace', letterSpacing: '1px' }}>
            {fmt(duration)}
          </span>
        </div>
      )}

      {/* ── BOTTOM CONTROLS DOCK ─────────────────────────────── */}
      <div style={{ width: '100%', maxWidth: 500, padding: '0 24px 44px', zIndex: 30, position: 'relative' }}>
        
        {/* INCOMING CALL CONTROLS */}
        <AnimatePresence>
          {callState === 'incoming' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              style={{
                background: 'rgba(24, 20, 26, 0.85)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 32,
                padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
              }}
            >
              {/* Decline Button */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => endCall(true)}
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                    border: 'none', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(255,68,68,0.4)',
                    transition: 'transform 0.2s'
                  }}
                >
                  <Icons.Phone size={26} style={{ transform: 'rotate(135deg)' }} />
                </button>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ff7777' }}>Decline</span>
              </div>

              {/* Accept Button */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <motion.button
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  onClick={answerCall}
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #34C759, #28a745)',
                    border: 'none', color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 8px 24px rgba(52,199,89,0.45)'
                  }}
                >
                  <Icons.Phone size={26} />
                </motion.button>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6ECFA0' }}>Accept</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CALLING (OUTGOING) CONTROLS */}
        <AnimatePresence>
          {callState === 'calling' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              style={{
                background: 'rgba(24, 20, 26, 0.85)', backdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 32,
                padding: '16px 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32,
                boxShadow: '0 20px 50px rgba(0,0,0,0.8)'
              }}
            >
              <button
                onClick={toggleMute}
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: muted ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${muted ? 'rgba(255,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  color: muted ? '#ff4444' : '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Icons.Mic size={22} />
              </button>

              <button
                onClick={() => endCall(true)}
                style={{
                  width: 64, height: 64, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                  border: 'none', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(255,68,68,0.45)'
                }}
              >
                <Icons.Phone size={28} style={{ transform: 'rotate(135deg)' }} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIVE CONNECTED CALL CONTROLS */}
        <AnimatePresence>
          {callState === 'connected' && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              style={{
                background: 'rgba(18, 16, 22, 0.88)', backdropFilter: 'blur(32px)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 36,
                padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 24px 60px rgba(0,0,0,0.85)'
              }}
            >
              {/* Mute Mic */}
              <button
                onClick={toggleMute}
                title={muted ? "Unmute Mic" : "Mute Mic"}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: muted ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${muted ? 'rgba(255,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                  color: muted ? '#ff4444' : '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Icons.Mic size={20} />
              </button>

              {/* Camera Toggle (Video Call) */}
              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  title={camOff ? "Turn Camera On" : "Turn Camera Off"}
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: camOff ? 'rgba(255,68,68,0.2)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${camOff ? 'rgba(255,68,68,0.5)' : 'rgba(255,255,255,0.12)'}`,
                    color: camOff ? '#ff4444' : '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <Icons.Camera size={20} />
                </button>
              )}

              {/* Flip Camera (Video Call) */}
              {callType === 'video' && (
                <button
                  onClick={flipCamera}
                  title="Flip Camera View"
                  style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>🔄</span>
                </button>
              )}

              {/* Chat Quick Access */}
              <button
                onClick={() => nav('/chat')}
                title="Return to Chat"
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Icons.Chat size={20} color="var(--accent)" />
              </button>

              {/* End Call Button */}
              <button
                onClick={() => endCall(true)}
                title="End Call"
                style={{
                  width: 54, height: 54, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ff4444, #cc0000)',
                  border: 'none', color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 24px rgba(255,68,68,0.5)'
                }}
              >
                <Icons.Phone size={24} style={{ transform: 'rotate(135deg)' }} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* ── AUDIO ROUTING BOTTOM SHEET ──────────────────────── */}
      <AnimatePresence>
        {showAudioMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAudioMenu(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(10px)', zIndex: 9999991 }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: '#131118', borderTopLeftRadius: 32, borderTopRightRadius: 32,
                padding: '28px 24px 40px', zIndex: 9999992,
                borderTop: '1px solid rgba(255,255,255,0.1)', maxWidth: 500, margin: '0 auto'
              }}
            >
              <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, margin: '0 auto 20px' }} />
              <h3 style={{ textAlign: 'center', color: '#fff', fontSize: '1rem', fontWeight: 700, margin: '0 0 20px' }}>
                Audio Output Device
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { id: 'speaker', label: 'Speakerphone', icon: <Icons.Volume2 size={20} /> },
                  { id: 'earpiece', label: 'Phone Earpiece', icon: <Icons.Phone size={20} /> },
                  { id: 'bluetooth', label: 'Bluetooth Audio Device', icon: <Icons.Smile size={20} /> },
                ].map(dev => (
                  <button
                    key={dev.id}
                    onClick={() => { setAudioRoute(dev.id); setShowAudioMenu(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '16px 20px', borderRadius: 16,
                      background: audioRoute === dev.id ? 'rgba(201,169,110,0.15)' : 'rgba(255,255,255,0.04)',
                      border: audioRoute === dev.id ? '1px solid rgba(201,169,110,0.4)' : '1px solid rgba(255,255,255,0.06)',
                      color: audioRoute === dev.id ? '#C9A96E' : '#fff',
                      fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {dev.icon}
                      <span>{dev.label}</span>
                    </div>
                    {audioRoute === dev.id && <span style={{ color: '#C9A96E', fontWeight: 800 }}>✓</span>}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
