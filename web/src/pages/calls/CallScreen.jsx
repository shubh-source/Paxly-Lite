import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
    // Correctly fetch partner info using centralized API
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
      wsService.on('webrtc_reject', () => { endCall(false); alert('Call rejected.'); }),
    ];

    // Aggressive Screenshot/Recording Protection
    const handleSecurityThreat = () => {
      if (callState === 'connected') {
        alert("Security Alert: Screen capture attempt detected. Call terminated for privacy.");
        endCall(true);
        nav('/dashboard');
      }
    };

    const handleKeydown = (e) => {
      // Common screenshot keys (PrintScreen, Win+Shift+S, Cmd+Shift+4)
      if (e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && (e.key === '4' || e.key === 's'))) {
        handleSecurityThreat();
      }
    };

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') handleSecurityThreat();
    });
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('blur', handleSecurityThreat);

    return () => { 
      offs.forEach(off => off()); 
      window.removeEventListener('visibilitychange', handleSecurityThreat);
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('blur', handleSecurityThreat);
      cleanup(); 
    };
  }, [isHistoryView, callState]);

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
      alert('Camera/Mic access denied.');
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

  const enterPiP = async () => {
    try {
      if (remoteRef.current) await remoteRef.current.requestPictureInPicture();
    } catch (e) { console.error("PiP failed", e); }
  };

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // RENDER: HISTORY VIEW
  if (callState === 'history') {
    return (
      <div className="page" style={{ paddingBottom: 80 }}>
        <header className="header" style={{ 
          background: 'rgba(22, 22, 24, 0.4)', 
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          margin: '20px 20px 12px',
          borderRadius: '24px',
          padding: '16px 20px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
        }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', fontSize: '1.2rem', textDecoration: 'none' }}>←</Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Call History</span>
          <div style={{ width: 24 }} />
        </header>

        <div className="content">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 40 }}>No calls recorded yet.</p>}
            {history.map(log => (
              <div key={log.id} className="card card-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 18 }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ 
                    width: 48, 
                    height: 48, 
                    borderRadius: '50%', 
                    background: 'rgba(255,255,255,0.05)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    fontSize: '1.2rem'
                  }}>
                    {log.call_type === 'video' ? <Icons.Video size={20} /> : <Icons.Mic size={20} />}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: log.caller_id === user?.id ? 'var(--text)' : 'var(--accent)' }}>
                      {log.caller_id === user?.id ? 'Outgoing Call' : 'Incoming Call'}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                      {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--accent)', fontSize: '1rem' }}>{fmt(log.duration)}</p>
                  {log.recording_url && <span style={{ fontSize: '0.65rem', color: 'var(--success)', textTransform: 'uppercase', letterSpacing: 1 }}>● Recorded</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // RENDER: ACTIVE CALL
  return (
    <div style={{ 
      height: '100vh', 
      background: '#000', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background with Ambient Glow */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: 'radial-gradient(circle at center, #1a1a2e 0%, #000 100%)', 
        zIndex: 0
      }} />

      {/* Remote video */}
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
          opacity: callState === 'connected' ? 1 : 0.3,
          transition: 'opacity 1s ease'
        }} 
      />

      {/* Local video (PiP) */}
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
            width: minimized ? 60 : 110, 
            height: minimized ? 80 : 160, 
            objectFit: 'cover', 
            borderRadius: 24, 
            border: '2px solid rgba(255,255,255,0.15)', 
            zIndex: 10,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            background: '#111'
          }} 
        />
      )}

      {/* Overlay UI */}
      <div style={{ position: 'relative', zIndex: 20, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        
        {/* Top Info Bar during connected call */}
        {callState === 'connected' && !minimized && (
          <div style={{ 
            marginTop: 40, 
            background: 'rgba(0,0,0,0.4)', 
            backdropFilter: 'blur(20px)', 
            padding: '8px 20px', 
            borderRadius: 99, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12,
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: 0.5 }}>{partner?.name || 'Partner'}</span>
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>|</span>
            <span style={{ fontSize: '0.9rem', color: 'var(--accent)', fontWeight: 600 }}>{fmt(duration)}</span>
          </div>
        )}

        {/* CALLING / INCOMING Identity Card */}
        {(callState === 'calling' || callState === 'incoming' || callState === 'connecting') && (
          <div style={{ 
            marginTop: 'auto',
            marginBottom: 'auto',
            textAlign: 'center',
            animation: 'fadeInUp 0.6s ease-out'
          }}>
            <div style={{ position: 'relative', margin: '0 auto 32px', width: 140, height: 140 }}>
              <div style={{ position: 'absolute', inset: -15, borderRadius: '50%', background: 'var(--accent)', opacity: 0.15, animation: 'ping 2s infinite' }} />
              <div className="avatar" style={{ 
                width: 140, 
                height: 140, 
                fontSize: '3rem', 
                border: '4px solid var(--accent)',
                boxShadow: '0 0 40px rgba(201,169,110,0.2)'
              }}>
                {partner?.name?.[0]?.toUpperCase() || '?'}
              </div>
            </div>
            <h2 style={{ color: '#fff', fontSize: '2.2rem', marginBottom: 12, fontWeight: 700 }}>{partner?.name || 'Connecting...'}</h2>
            <p style={{ color: 'var(--accent)', letterSpacing: '0.2em', fontSize: '0.8rem', fontWeight: 600 }}>
              {callState === 'calling' ? 'CALLING...' : callState === 'incoming' ? 'INCOMING CALL' : 'ESTABLISHING...'}
            </p>

            <div style={{ marginTop: 60, display: 'flex', gap: 40, justifyContent: 'center' }}>
              {callState === 'calling' ? (
                <button onClick={() => endCall()} style={{ background: '#FF3B30', border: 'none', borderRadius: '50%', width: 80, height: 80, cursor: 'pointer', boxShadow: '0 10px 30px rgba(255,59,48,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Phone size={32} color="#fff" style={{ transform: 'rotate(135deg)' }} /></button>
              ) : (
                <>
                  <button onClick={() => { wsService.rejectCall(); setCallState('idle'); nav('/chat'); }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: 80, height: 80, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Back size={32} color="#fff" style={{ transform: 'rotate(45deg)' }} /></button>
                  <button onClick={answerCall} style={{ background: '#34C759', border: 'none', borderRadius: '50%', width: 80, height: 80, cursor: 'pointer', animation: 'pulseGreen 2s infinite', boxShadow: '0 10px 30px rgba(52,199,89,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Phone size={32} color="#fff" /></button>
                </>
              )}
            </div>
          </div>
        )}

        {/* CONNECTED Controls */}
        {callState === 'connected' && !minimized && (
          <div style={{ 
            marginTop: 'auto', 
            marginBottom: 60, 
            width: '90%', 
            maxWidth: 400,
            background: 'rgba(255,255,255,0.08)', 
            backdropFilter: 'blur(30px) saturate(180%)', 
            padding: '24px', 
            borderRadius: 40, 
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            animation: 'slideUp 0.5s ease-out'
          }}>
            <button onClick={() => setMuted(!muted)} style={{ background: muted ? '#FF3B30' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 60, height: 60, cursor: 'pointer', color: '#fff', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{muted ? <Icons.Mic size={24} /> : <Icons.Mic size={24} />}</button>
            <button onClick={enterPiP} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 60, height: 60, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Explore size={24} /></button>
            <button onClick={() => setMinimized(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 60, height: 60, cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Vault size={24} /></button>
            <button onClick={() => endCall()} style={{ background: '#FF3B30', border: 'none', borderRadius: '50%', width: 72, height: 72, cursor: 'pointer', color: '#fff', boxShadow: '0 10px 25px rgba(255,59,48,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Phone size={32} style={{ transform: 'rotate(135deg)' }} /></button>
          </div>
        )}

        {/* MINIMIZED BUBBLE (In-App PiP) */}
        {minimized && (
          <div 
            onClick={() => setMinimized(false)}
            style={{ position: 'fixed', bottom: 100, right: 20, width: 130, height: 180, borderRadius: 24, overflow: 'hidden', boxShadow: '0 15px 40px rgba(0,0,0,0.6)', zIndex: 1000, border: '2px solid var(--accent)', cursor: 'pointer' }}
          >
            <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: '4px 8px', color: '#fff', fontSize: '0.75rem', fontWeight: 600 }}>{fmt(duration)}</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(50px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes ping { 75%, 100% { transform: scale(1.8); opacity: 0; } }
        @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.8; } 50% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.8; } }
        @keyframes pulseGreen { 0% { box-shadow: 0 0 0 0 rgba(52,199,89, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(52,199,89, 0); } 100% { box-shadow: 0 0 0 0 rgba(52,199,89, 0); } }
      `}</style>
    </div>
  );
}
