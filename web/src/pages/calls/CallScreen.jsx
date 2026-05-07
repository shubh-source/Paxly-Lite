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
  ]
};

export default function CallScreen() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const initType = params.get('type') || 'video';
  const isHistoryView = params.get('view') === 'history';

  const [callState, setCallState] = useState('idle'); // idle | calling | incoming | connected | history
  const [callType, setCallType] = useState(initType);
  const [partner, setPartner] = useState(null);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [history, setHistory] = useState([]);
  const [minimized, setMinimized] = useState(false);

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
          await pc.current.setRemoteDescription({ type: d.sdp.type || 'answer', sdp: d.sdp });
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
      wsService.on('webrtc_reject', () => { endCall(false); }),
    ];

    return () => { 
      offs.forEach(off => off()); 
      cleanup(); 
    };
  }, [isHistoryView]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/calls/history');
      setHistory(res.data);
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
        video: type === 'video' ? { facingMode: 'user' } : false 
      });
      if (localRef.current) localRef.current.srcObject = localStream.current;
      pc.current = createPC();
      localStream.current.getTracks().forEach(t => pc.current.addTrack(t, localStream.current));
      const offer = await pc.current.createOffer();
      await pc.current.setLocalDescription(offer);
      wsService.sendOffer(offer, type);
    } catch {
      setCallState('idle');
      nav('/chat');
    }
  };

  const answerCall = async () => {
    if (!incomingOffer) return;
    setCallState('connecting');
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: incomingOffer.call_type === 'video' ? { facingMode: 'user' } : false 
      });
      if (localRef.current) localRef.current.srcObject = localStream.current;
      pc.current = createPC();
      localStream.current.getTracks().forEach(t => pc.current.addTrack(t, localStream.current));
      await pc.current.setRemoteDescription({ type: 'offer', sdp: incomingOffer.sdp });
      const answer = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answer);
      wsService.sendAnswer(answer);
    } catch {
      endCall(true);
    }
  };

  const endCall = (sendSignal = true) => {
    if (duration > 0) {
      wsService.send({
        type: 'webrtc_log',
        caller_id: callState === 'calling' || callState === 'connected' ? user.id : partner?.id,
        recipient_id: callState === 'calling' || callState === 'connected' ? partner?.id : user.id,
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

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // RENDER: HISTORY VIEW (Unchanged but stylized)
  if (callState === 'history') {
    return (
      <div className="page" style={{ paddingBottom: 80, backgroundColor: '#0a0a0b' }}>
        <header className="header" style={{ 
          background: 'rgba(22, 22, 24, 0.4)', 
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          margin: '20px 20px 12px',
          borderRadius: '24px',
          padding: '16px 20px'
        }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', fontSize: '1.2rem', textDecoration: 'none' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Vlynxly Call Vault</span>
          <div style={{ width: 24 }} />
        </header>

        <div className="content" style={{ padding: '0 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map(log => (
              <div key={log.id} style={{ 
                background: 'rgba(255,255,255,0.02)', 
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 20, 
                padding: 18,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(179, 148, 90, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {log.call_type === 'video' ? <Icons.Video size={18} color="var(--accent)" /> : <Icons.Mic size={18} color="var(--accent)" />}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: log.caller_id === user?.id ? '#fff' : 'var(--accent)' }}>
                      {log.caller_id === user?.id ? 'Outgoing Call' : 'Incoming Call'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: 'var(--accent)', fontSize: '1.1rem' }}>{fmt(log.duration)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      height: '100vh', 
      background: '#050505', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Cinematic Aura Background */}
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.15, 0.1],
          rotate: [0, 180, 360]
        }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        style={{ 
          position: 'absolute', 
          width: '150vw', 
          height: '150vw', 
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 50%, #000 80%)', 
          zIndex: 0,
          pointerEvents: 'none',
          filter: 'blur(80px)'
        }}
      />

      {/* Remote Video (Visible only when connected) */}
      <video 
        ref={remoteRef} 
        autoPlay 
        playsInline 
        style={{ 
          position: 'absolute', 
          inset: 0, 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover', 
          zIndex: 1,
          opacity: callState === 'connected' ? 1 : 0,
          transition: 'opacity 1s cubic-bezier(0.4, 0, 0.2, 1)'
        }} 
      />

      {/* Local Video Overlay (PiP) */}
      {callType === 'video' && (
        <video 
          ref={localRef} 
          autoPlay 
          playsInline 
          muted 
          style={{ 
            position: 'absolute', 
            top: 40, 
            right: 20, 
            width: minimized ? 60 : 120, 
            height: minimized ? 80 : 180, 
            objectFit: 'cover', 
            borderRadius: 24, 
            border: '1px solid rgba(255,255,255,0.2)', 
            zIndex: 30,
            transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 20px 40px rgba(0,0,0,0.8)',
            background: '#111'
          }} 
        />
      )}

      {/* Main Overlay UI */}
      <div style={{ position: 'relative', zIndex: 40, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* Connected Header */}
        <AnimatePresence>
          {callState === 'connected' && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ 
                position: 'absolute', 
                top: 40,
                background: 'rgba(0,0,0,0.4)', 
                backdropFilter: 'blur(30px)', 
                padding: '10px 24px', 
                borderRadius: 40, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 12,
                border: '1px solid rgba(255,255,255,0.1)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34C759', boxShadow: '0 0 10px #34C759', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)' }}>SECURE CALL</span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
              <span style={{ fontSize: '1rem', color: '#fff', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(duration)}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Calling/Incoming Interface */}
        {(callState === 'calling' || callState === 'incoming' || callState === 'connecting') && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: 'center', width: '100%' }}
          >
            <div style={{ position: 'relative', width: 160, height: 160, margin: '0 auto 40px' }}>
              {/* Pulsing Rings */}
              {[1, 2, 3].map(i => (
                <motion.div
                  key={i}
                  animate={{ scale: [1, 1.8], opacity: [0.3, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.6 }}
                  style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid var(--accent)' }}
                />
              ))}
              <div style={{ 
                width: 160, 
                height: 160, 
                borderRadius: '50%', 
                background: 'linear-gradient(135deg, #2a241e, #1a1a1a)',
                border: '2px solid var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
                color: 'var(--accent)',
                boxShadow: '0 0 60px rgba(179,148,90,0.2)',
                position: 'relative',
                zIndex: 2,
                overflow: 'hidden'
              }}>
                {partner?.avatar_url ? (
                  <img src={partner.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontFamily: 'serif' }}>{partner?.name?.[0]?.toUpperCase() || '?'}</span>
                )}
              </div>
            </div>

            <h2 style={{ fontSize: '2.8rem', fontWeight: 200, fontFamily: 'serif', color: '#fff', marginBottom: 8, letterSpacing: '-0.02em' }}>
              {partner?.name || 'Searching...'}
            </h2>
            <motion.p 
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ color: 'var(--accent)', letterSpacing: '4px', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}
            >
              {callState === 'calling' ? 'Summoning Partner...' : callState === 'incoming' ? 'Partner is Calling...' : 'Weaving Connection...'}
            </motion.p>

            {/* Action Buttons */}
            <div style={{ marginTop: 80, display: 'flex', gap: 40, justifyContent: 'center' }}>
              {callState === 'calling' ? (
                <motion.button 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => endCall()} 
                  style={{ background: '#FF3B30', border: 'none', borderRadius: '50%', width: 84, height: 84, cursor: 'pointer', boxShadow: '0 15px 35px rgba(255,59,48,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icons.Phone size={36} color="#fff" style={{ transform: 'rotate(135deg)' }} />
                </motion.button>
              ) : (
                <>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { wsService.rejectCall(); setCallState('idle'); nav('/chat'); }} 
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: 84, height: 84, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icons.Back size={36} color="#fff" />
                  </motion.button>
                  <motion.button 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    onClick={answerCall} 
                    style={{ background: '#34C759', border: 'none', borderRadius: '50%', width: 84, height: 84, cursor: 'pointer', boxShadow: '0 15px 35px rgba(52,199,89,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Icons.Phone size={36} color="#fff" />
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Connected Control Bar */}
        <AnimatePresence>
          {callState === 'connected' && !minimized && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              style={{ 
                position: 'absolute', 
                bottom: 60, 
                width: '90%', 
                maxWidth: 440,
                background: 'rgba(255,255,255,0.08)', 
                backdropFilter: 'blur(40px) saturate(180%)', 
                padding: '28px 32px', 
                borderRadius: 48, 
                border: '1px solid rgba(255,255,255,0.15)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: '0 30px 60px rgba(0,0,0,0.8)'
              }}
            >
              <ControlBtn active={!muted} onClick={() => setMuted(!muted)} icon={muted ? <Icons.Mic size={24} /> : <Icons.Mic size={24} />} danger={muted} />
              <ControlBtn active={!camOff} onClick={() => setCamOff(!camOff)} icon={<Icons.Video size={24} />} danger={camOff} />
              <ControlBtn active={false} onClick={() => setMinimized(true)} icon={<Icons.Vault size={24} />} />
              <motion.button 
                whileHover={{ scale: 1.1, rotate: -15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => endCall()} 
                style={{ background: '#FF3B30', border: 'none', borderRadius: '50%', width: 72, height: 72, cursor: 'pointer', boxShadow: '0 15px 30px rgba(255,59,48,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icons.Phone size={32} color="#fff" style={{ transform: 'rotate(135deg)' }} />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
      `}</style>
    </div>
  );
}

function ControlBtn({ icon, onClick, active, danger }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.15)' }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      style={{ 
        background: danger ? '#FF3B30' : 'rgba(255,255,255,0.06)', 
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '50%', 
        width: 64, height: 64, 
        cursor: 'pointer', 
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.3s'
      }}
    >
      {icon}
    </motion.button>
  );
}
