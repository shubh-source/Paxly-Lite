import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { wsService } from '../../services/websocket';
import { getSpace } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
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
  const pc = useRef(pc);
  const localStream = useRef(null);
  const timer = useRef(null);
  const startTime = useRef(null);

  useEffect(() => {
    getSpace().then(d => setPartner(d.partner));

    if (isHistoryView) {
      setCallState('history');
      axios.get('/api/calls/history').then(res => setHistory(res.data)).catch(() => {});
    } else if (params.get('type')) {
      // Auto-start call if coming from Chat
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
    return () => { offs.forEach(off => off()); cleanup(); };
  }, [isHistoryView]);

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
        timer.current = setInterval(() => setDuration(d => d + 1), 1000);
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
      // Send log to backend
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
    clearInterval(timer.current);
    setDuration(0);
    if (!isHistoryView) nav('/chat');
  };

  const cleanup = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    pc.current?.close();
    pc.current = null;
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
      <div className="page" style={{ padding: '24px 20px' }}>
        <button onClick={() => nav('/dashboard')} style={{ marginBottom: 20, background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>← Back to Dashboard</button>
        <h2 style={{ marginBottom: 24 }}>Call History</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {history.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', marginTop: 40 }}>No calls recorded yet.</p>}
          {history.map(log => (
            <div key={log.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: '1.4rem' }}>{log.call_type === 'video' ? '📹' : '🎙️'}</div>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                    {log.caller_id === user?.id ? 'Outgoing' : 'Incoming'}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                    {format(new Date(log.timestamp), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontWeight: 500, color: 'var(--accent)' }}>{fmt(log.duration)}</p>
                {log.recording_url && <span style={{ fontSize: '0.7rem', color: 'var(--success)' }}>● Recorded</span>}
              </div>
            </div>
          ))}
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
      {/* Dynamic Animated Gradient Background */}
      <div style={{ 
        position: 'absolute', 
        inset: 0, 
        background: 'linear-gradient(45deg, #0f0c29, #302b63, #24243e)', 
        opacity: callState === 'connected' ? 0.3 : 1,
        animation: 'pulseBg 10s infinite alternate' 
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
          background: 'transparent',
          zIndex: 1
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
            top: 20, 
            right: 20, 
            width: minimized ? 60 : 100, 
            height: minimized ? 80 : 140, 
            objectFit: 'cover', 
            borderRadius: 16, 
            border: '2px solid rgba(255,255,255,0.2)', 
            zIndex: 10,
            transition: 'all 0.3s ease'
          }} 
        />
      )}

      {/* Overlay UI */}
      <div style={{ position: 'relative', zIndex: 20, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        
        {/* CALLING / INCOMING Identity Card */}
        {(callState === 'calling' || callState === 'incoming') && (
          <div style={{ 
            background: 'rgba(255,255,255,0.05)', 
            backdropFilter: 'blur(20px)', 
            padding: 40, 
            borderRadius: 32, 
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            animation: 'float 4s infinite ease-in-out'
          }}>
            <div style={{ position: 'relative', margin: '0 auto 24px', width: 100, height: 100 }}>
              <div style={{ position: 'absolute', inset: -10, borderRadius: '50%', background: 'var(--accent)', opacity: 0.2, animation: 'ping 2s infinite' }} />
              <div className="avatar" style={{ width: 100, height: 100, fontSize: '2rem', border: '3px solid var(--accent)' }}>
                {partner?.name?.[0]?.toUpperCase()}
              </div>
            </div>
            <h2 style={{ color: '#fff', fontSize: '1.8rem', marginBottom: 8 }}>{partner?.name}</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.1em' }}>
              {callState === 'calling' ? 'CONNECTING...' : 'INCOMING CALL'}
            </p>

            <div style={{ marginTop: 40, display: 'flex', gap: 32, justifyContent: 'center' }}>
              {callState === 'calling' ? (
                <button onClick={() => endCall()} style={{ background: 'var(--danger)', border: 'none', borderRadius: '50%', width: 72, height: 72, fontSize: '1.8rem', cursor: 'pointer', boxShadow: '0 10px 20px rgba(255,59,48,0.3)' }}>📵</button>
              ) : (
                <>
                  <button onClick={() => { wsService.rejectCall(); setCallState('idle'); nav('/chat'); }} style={{ background: 'var(--danger)', border: 'none', borderRadius: '50%', width: 72, height: 72, fontSize: '1.8rem', cursor: 'pointer' }}>📵</button>
                  <button onClick={answerCall} style={{ background: 'var(--success)', border: 'none', borderRadius: '50%', width: 72, height: 72, fontSize: '1.8rem', cursor: 'pointer', animation: 'bounce 1s infinite' }}>📞</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* CONNECTED Controls */}
        {callState === 'connected' && !minimized && (
          <div style={{ position: 'absolute', bottom: 40, left: 20, right: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ alignSelf: 'center', background: 'rgba(0,0,0,0.4)', padding: '6px 14px', borderRadius: 99, color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>
              {fmt(duration)}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', background: 'rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)', padding: '20px', borderRadius: 32, border: '1px solid rgba(255,255,255,0.1)' }}>
              <button onClick={() => setMuted(!muted)} style={{ background: muted ? 'var(--danger)' : 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 56, height: 56, fontSize: '1.4rem', cursor: 'pointer', color: '#fff' }}>{muted ? '🔇' : '🎙️'}</button>
              <button onClick={enterPiP} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 56, height: 56, fontSize: '1.4rem', cursor: 'pointer', color: '#fff' }}>🖼️</button>
              <button onClick={() => setMinimized(true)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 56, height: 56, fontSize: '1.4rem', cursor: 'pointer', color: '#fff' }}>🔳</button>
              <button onClick={() => endCall()} style={{ background: 'var(--danger)', border: 'none', borderRadius: '50%', width: 64, height: 64, fontSize: '1.6rem', cursor: 'pointer', color: '#fff' }}>📵</button>
            </div>
          </div>
        )}

        {/* MINIMIZED BUBBLE (In-App PiP) */}
        {minimized && (
          <div 
            onClick={() => setMinimized(false)}
            style={{ position: 'fixed', bottom: 100, right: 20, width: 120, height: 160, borderRadius: 20, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 1000, border: '2px solid var(--accent)', cursor: 'pointer' }}
          >
            <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: '2px 6px', color: '#fff', fontSize: '0.6rem' }}>{fmt(duration)}</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulseBg { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(45deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
        @keyframes bounce { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
      `}</style>
    </div>
  );
}
