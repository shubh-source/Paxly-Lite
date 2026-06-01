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
  const [audioRoute, setAudioRoute] = useState('earpiece');
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
      setCallState('incoming');
      wsService.latestOffer = null; // consume it
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

  return (
    <div style={{ 
      position: 'fixed', inset: 0, backgroundColor: '#1a1614', color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
      overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif', zIndex: 9999
    }}>
      {/* Background Aura */}
      <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.2, 0.1] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        style={{ position: 'absolute', top: '15%', left: '10%', width: '80vw', height: '80vw', background: 'radial-gradient(circle, #b3945a 0%, transparent 60%)', filter: 'blur(100px)', zIndex: 0 }} />

      <div style={{ zIndex: 10, textAlign: 'center', position: 'absolute', top: 40, width: '100%' }}>
        <h2 style={{ fontSize: '0.8rem', fontWeight: 600, letterSpacing: '2px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          {callState === 'incoming' ? 'Incoming Call' : callState === 'idle' ? 'Call Ended' : callState === 'connecting' ? 'Connecting...' : ''}
        </h2>
      </div>

      {/* REMOTE VIDEO RENDER - Used as background for video calls */}
      {callType === 'video' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: callState === 'connected' ? 1 : 0, transition: 'opacity 0.5s' }}>
          <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      {/* LOCAL VIDEO PIP - Shown only when connected in video call */}
      {callType === 'video' && callState === 'connected' && (
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ position: 'absolute', top: 60, right: 24, width: 100, height: 140, borderRadius: 16, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', background: '#000', zIndex: 5, boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }}>
          <video ref={localRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: camOff ? 0 : 1 }} />
          {camOff && <div style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center'}}><Icons.Camera size={32} color="rgba(255,255,255,0.2)"/></div>}
        </motion.div>
      )}

      {/* VOICE CALL / CONNECTING UI */}
      {(callType !== 'video' || callState !== 'connected') && (
        <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 130, height: 130, marginBottom: 24 }}>
            {callState === 'connected' && <motion.div animate={{ scale: [1, 1.15, 0.95, 1.05, 1] }} transition={{ duration: 1.2, repeat: Infinity }} style={{ position: 'absolute', inset: -15, borderRadius: '50%', background: 'rgba(179,148,90,0.15)', filter: 'blur(12px)' }} />}
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'linear-gradient(135deg, #2a241e, #111)', border: '2px solid rgba(179,148,90,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 2, overflow: 'hidden' }}>
              {partner?.avatar_url ? (
                <img src={partner.avatar_url} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: '3rem', fontFamily: 'serif', color: 'var(--accent)' }}>{partner?.name?.[0]?.toUpperCase() || '?'}</span>
              )}
            </div>
          </div>

          <h1 style={{ fontSize: '2rem', fontWeight: 300, fontFamily: 'serif', letterSpacing: '1px', margin: 0, marginBottom: 4 }}>{partner?.name || 'Partner'}</h1>
          <p style={{ fontSize: '1rem', color: callState === 'connected' ? '#b3945a' : 'rgba(255,255,255,0.4)', fontFamily: 'monospace', margin: 0 }}>
            {callState === 'connected' ? fmt(duration) : (callState === 'calling' ? 'Calling...' : callState === 'connecting' ? 'Connecting...' : '')}
          </p>

          {callState === 'connected' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 4, height: 20 }}>
              {[1, 2, 3, 2, 1, 3, 4, 2, 1, 2].map((val, i) => <motion.div key={i} animate={{ height: [4, val * 6, 4] }} transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1 }} style={{ width: 2, background: '#b3945a', borderRadius: 2 }} />)}
            </motion.div>
          )}
        </div>
      )}

      {/* DURATION OVERLAY FOR VIDEO */}
      {callType === 'video' && callState === 'connected' && (
        <div style={{ position: 'absolute', top: 60, left: 24, padding: '4px 12px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)', borderRadius: 20, zIndex: 10 }}>
           <span style={{ fontSize: '0.9rem', color: '#fff', fontFamily: 'monospace' }}>{fmt(duration)}</span>
        </div>
      )}

      {/* --- INCOMING CALL SLIDER --- */}
      <AnimatePresence>
        {callState === 'incoming' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ position: 'absolute', bottom: 60, width: '80%', maxWidth: 320, height: 72, background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(30px)', borderRadius: 100, border: '1px solid rgba(255,255,255,0.05)', padding: 8, display: 'flex', alignItems: 'center', zIndex: 20 }}>
            <motion.div drag="x" dragConstraints={{ left: 0, right: 240 }} dragElastic={0.1} onDragEnd={(e, info) => { if (info.offset.x > 150) answerCall(); }}
              style={{ width: 56, height: 56, borderRadius: '50%', background: '#34C759', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', zIndex: 10, boxShadow: '0 4px 15px rgba(52,199,89,0.3)' }}>
               <Icons.Phone size={24} color="#fff" />
            </motion.div>
            <span style={{ position: 'absolute', width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '0.9rem', letterSpacing: '1px', zIndex: 1, pointerEvents: 'none' }}>Slide to answer</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- OUTGOING CALL (Calling state) --- */}
      <AnimatePresence>
        {callState === 'calling' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 32, padding: '16px 36px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(30px)', borderRadius: 100, border: '1px solid rgba(255,255,255,0.05)', zIndex: 20 }}>
            <button onClick={() => setShowAudioMenu(true)} style={{ background: 'none', border: 'none', color: audioRoute !== 'earpiece' ? '#b3945a' : '#fff', cursor: 'pointer', transition: 'color 0.3s' }}>
               {audioRoute === 'speaker' ? <Icons.Volume2 size={24} /> : audioRoute === 'bluetooth' ? <Icons.Smile size={24} /> : <Icons.Phone size={24} />}
            </button>
            <button onClick={() => endCall(true)} style={{ background: '#FF3B30', border: 'none', color: '#fff', width: 56, height: 56, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -8, boxShadow: '0 4px 15px rgba(255,59,48,0.3)' }}>
               <Icons.Phone size={24} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- ACTIVE CALL CONTROLS --- */}
      <AnimatePresence>
        {callState === 'connected' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ position: 'absolute', bottom: 60, display: 'flex', gap: 24, padding: '16px 32px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(30px)', borderRadius: 100, border: '1px solid rgba(255,255,255,0.05)', zIndex: 20 }}>
            
            <button onClick={() => setShowAudioMenu(true)} style={{ background: 'none', border: 'none', color: audioRoute !== 'earpiece' ? '#b3945a' : '#fff', cursor: 'pointer', transition: 'color 0.3s' }}>
               {audioRoute === 'speaker' ? <Icons.Volume2 size={24} /> : audioRoute === 'bluetooth' ? <Icons.Smile size={24} /> : <Icons.Phone size={24} />}
            </button>

            <button onClick={toggleMute} style={{ background: 'none', border: 'none', color: muted ? '#FF3B30' : '#fff', cursor: 'pointer', transition: 'color 0.3s' }}>
               <Icons.Mic size={24} />
            </button>
            
            {callType === 'video' && (
              <button onClick={toggleVideo} style={{ background: 'none', border: 'none', color: camOff ? '#FF3B30' : '#fff', cursor: 'pointer', transition: 'color 0.3s' }}>
                 <Icons.Camera size={24} />
              </button>
            )}

            <button onClick={() => endCall(true)} style={{ background: '#FF3B30', border: 'none', color: '#fff', width: 56, height: 56, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -8, boxShadow: '0 4px 15px rgba(255,59,48,0.3)' }}>
               <Icons.Phone size={24} style={{ transform: 'rotate(135deg)' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Audio Routing Bottom Sheet Menu */}
      <AnimatePresence>
        {showAudioMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowAudioMenu(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 30 }} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#1a1614', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: '32px 24px', zIndex: 40, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <h3 style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: 24, marginTop: 0 }}>Audio Output</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <button onClick={() => { setAudioRoute('bluetooth'); setShowAudioMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', background: audioRoute === 'bluetooth' ? 'rgba(179,148,90,0.1)' : 'rgba(255,255,255,0.02)', border: audioRoute === 'bluetooth' ? '1px solid rgba(179,148,90,0.2)' : '1px solid transparent', borderRadius: 16, color: audioRoute === 'bluetooth' ? '#b3945a' : '#fff', fontSize: '1rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                   <Icons.Smile size={20} /> Bluetooth Buds
                </button>
                <button onClick={() => { setAudioRoute('speaker'); setShowAudioMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', background: audioRoute === 'speaker' ? 'rgba(179,148,90,0.1)' : 'rgba(255,255,255,0.02)', border: audioRoute === 'speaker' ? '1px solid rgba(179,148,90,0.2)' : '1px solid transparent', borderRadius: 16, color: audioRoute === 'speaker' ? '#b3945a' : '#fff', fontSize: '1rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                   <Icons.Volume2 size={20} /> Speakerphone
                </button>
                <button onClick={() => { setAudioRoute('earpiece'); setShowAudioMenu(false); }} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', background: audioRoute === 'earpiece' ? 'rgba(179,148,90,0.1)' : 'rgba(255,255,255,0.02)', border: audioRoute === 'earpiece' ? '1px solid rgba(179,148,90,0.2)' : '1px solid transparent', borderRadius: 16, color: audioRoute === 'earpiece' ? '#b3945a' : '#fff', fontSize: '1rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }}>
                   <Icons.Phone size={20} /> Phone Earpiece
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
