import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { Icons } from '../ui/Icons';
import { wsService } from '../../services/websocket';

export default function AppGuard({ children }) {
  const { user, loading } = useAuth();
  const [isLocked, setIsLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(3);
  const timerRef = useRef(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Auto-lock when putting the app in the background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && user?.has_pin) {
        setIsLocked(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user?.has_pin]);

  useEffect(() => {
    if (!loading && user?.has_pin) {
      // Initially locked if PIN is set
      setIsLocked(true);
    }
  }, [loading, user?.has_pin]);

  const [incomingCall, setIncomingCall] = useState(null);
  const [vaultDownloadRequest, setVaultDownloadRequest] = useState(null);

  useEffect(() => {
    if (!user) return;
    const off = wsService.on('webrtc_offer', (offer) => {
       if (pathname !== '/call') {
          // Trigger Android Native if available
          if (window.Android && window.Android.showIncomingCall) {
            window.Android.showIncomingCall(offer.from_name || 'Partner', offer.call_type || 'video');
          }
          // Instead of immediate navigation, show the Heads-Up Banner
          setIncomingCall(offer);
       }
    });
    
    // Also clear banner if call is cancelled by caller
    const offEnd = wsService.on('webrtc_end', () => setIncomingCall(null));
    
    const offVault = wsService.on('vault_download_request', d => {
       setVaultDownloadRequest(d);
    });

    return () => { off(); offEnd(); offVault(); };
  }, [user, pathname]);

  const answerCall = () => {
    navigate('/call?action=answer');
    setIncomingCall(null);
  };

  const declineCall = () => {
    wsService.rejectCall();
    wsService.latestOffer = null;
    setIncomingCall(null);
  };

  const captureIntruder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      
      stream.getTracks().forEach(track => track.stop());

      canvas.toBlob(async (blob) => {
        const formData = new FormData();
        formData.append('file', blob, 'intruder.jpg');
        try {
          await api.post('/security/intruder/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } catch (e) {
          console.error('Failed to upload intruder selfie', e);
        }
      }, 'image/jpeg', 0.8);
    } catch (e) {
      console.error('Failed to access camera for intruder selfie', e);
    }
  };

  const [pinLoading, setPinLoading] = useState(false);
  
  const verifyPin = async (pinToVerify = pin) => {
    if (pinToVerify.length < 4) return setError('PIN too short');
    setPinLoading(true);
    setError('');
    try {
      const res = await api.post('/security/pin/verify', { pin: pinToVerify });
      if (res.data.status === 'ok') {
        setIsLocked(false);
        setPin('');
        setAttempts(3);
      } else {
        const left = res.data.attempts_left || 0;
        setError(`Incorrect PIN. ${left} attempts remaining.`);
        setPin('');
        setAttempts(left);
        if (res.data.trigger_selfie) {
           setError('Vault secured. Too many failed attempts.');
           captureIntruder();
        }
      }
    } catch {
      setError('Vault is waking up... Wait 30s and try again.');
    } finally {
      setPinLoading(false);
    }
  };

  const handleKey = (num) => {
    if (pin.length < 6) {
      const newPin = pin + num;
      setPin(newPin);
      const isCalculator = user?.stealth_mode && user?.stealth_mode_app === 'calculator';
      if (!isCalculator && newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  // Keyboard support for Laptop/Desktop
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isLocked) return;
      
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKey(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        verifyPin();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, pin]); // Re-bind when PIN changes to ensure verifyPin has latest state

  if (pathname === '/forgot-pin') {
    return children;
  }

  const showLock = !loading && user?.has_pin && isLocked;

  return (
    <>
      {!showLock && (
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', width: '100%', minHeight: '100vh' }}>
          {children}
        </div>
      )}

      {showLock && (
        user?.stealth_mode && user?.stealth_mode_app === 'calculator' ? (
          <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#000', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, padding: '40px 20px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
              <div style={{ fontSize: '4.5rem', color: '#fff', fontWeight: 300, letterSpacing: 2 }}>{pin || '0'}</div>
            </div>
            <div style={{ padding: '0 16px 32px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {['AC', '+/-', '%', '÷'].map(k => <button key={k} onClick={() => setPin('')} style={{ aspectRatio: '1', background: '#a5a5a5', color: '#000', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>{k}</button>)}
              {['7', '8', '9', '×'].map(k => <button key={k} onClick={() => ['×'].includes(k) ? null : handleKey(k)} style={{ aspectRatio: '1', background: k==='×' ? '#FF9F0A' : '#333', color: k==='×' ? '#fff' : '#fff', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>{k}</button>)}
              {['4', '5', '6', '-'].map(k => <button key={k} onClick={() => ['-'].includes(k) ? null : handleKey(k)} style={{ aspectRatio: '1', background: k==='-' ? '#FF9F0A' : '#333', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>{k}</button>)}
              {['1', '2', '3', '+'].map(k => <button key={k} onClick={() => ['+'].includes(k) ? null : handleKey(k)} style={{ aspectRatio: '1', background: k==='+' ? '#FF9F0A' : '#333', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>{k}</button>)}
              <button onClick={() => handleKey('0')} style={{ gridColumn: 'span 2', aspectRatio: '2.2', background: '#333', color: '#fff', border: 'none', borderRadius: 40, fontSize: '1.6rem', textAlign: 'left', paddingLeft: 28, cursor: 'pointer' }}>0</button>
              <button onClick={() => null} style={{ aspectRatio: '1', background: '#333', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>.</button>
              <button onClick={() => verifyPin()} disabled={pinLoading} style={{ aspectRatio: '1', background: '#FF9F0A', color: '#fff', border: 'none', borderRadius: '50%', fontSize: '1.6rem', cursor: 'pointer' }}>=</button>
            </div>
          </div>
        ) : (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0D0D0F', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <Icons.Shield size={64} color="var(--accent)" stroke={1.5} />
          </div>
          <h2 style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.5px' }}>Welcome back, {user?.name?.split(' ')[0]}</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 8 }}>Fortress is Locked. Enter PIN.</p>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: pin.length > i ? 'var(--accent)' : '#222', border: '1px solid #333', transition: 'all 0.2s', boxShadow: pin.length > i ? '0 0 10px var(--accent)' : 'none' }} />
          ))}
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 20 }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, maxWidth: 280 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button key={n} onClick={() => handleKey(n.toString())} className="pin-btn">{n}</button>
          ))}
          <button onClick={() => setPin(prev => prev.slice(0, -1))} className="pin-btn">
            <Icons.Back size={24} />
          </button>
          <button onClick={() => handleKey('0')} className="pin-btn">0</button>
          <button onClick={verifyPin} disabled={pinLoading} className="pin-btn" style={{ background: 'var(--accent)', color: '#000' }}>
            {pinLoading ? '...' : <Icons.Check size={28} color="#000" />}
          </button>
        </div>

        <div style={{ marginTop: 24 }}>
          <button onClick={() => navigate('/forgot-pin')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
            Forgot PIN?
          </button>
        </div>

        <style>{`
          .pin-btn {
            width: 68px; height: 68px; border-radius: 50%;
            background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
            color: #fff; fontSize: 1.5rem; fontWeight: 600; font-family: var(--font-b);
            cursor: pointer; transition: all 0.2s;
            display: flex; align-items: center; justify-content: center;
          }
          .pin-btn:active { transform: scale(0.9); background: rgba(255,255,255,0.1); }
        `}</style>
      </div>
      ))}

      {incomingCall && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          maxWidth: 400,
          background: 'rgba(30, 30, 34, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 24,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 999999,
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          animation: 'slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #111)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--accent)' }}>
               <Icons.Phone size={24} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#fff' }}>Incoming Call</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--accent)' }}>{incomingCall.call_type === 'video' ? 'Video Call' : 'Voice Call'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <button onClick={declineCall} style={{ width: 44, height: 44, borderRadius: '50%', background: '#FF3B30', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,59,48,0.4)' }}>
               <Icons.Phone size={20} color="#fff" style={{ transform: 'rotate(135deg)' }} />
             </button>
             <button onClick={answerCall} style={{ width: 44, height: 44, borderRadius: '50%', background: '#34C759', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 15px rgba(52,199,89,0.4)' }}>
               <Icons.Phone size={20} color="#fff" />
             </button>
          </div>
          <style>{`
            @keyframes slideDown {
              from { transform: translate(-50%, -100px); opacity: 0; }
              to { transform: translate(-50%, 0); opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {vaultDownloadRequest && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:999999, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter: 'blur(10px)' }}>
          <div className="card" style={{ maxWidth:360, width:'100%', textAlign:'center', border: '1px solid var(--accent)', padding: 30, background: '#161618' }}>
            <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'center' }}><Icons.Vault size={48} color="var(--accent)" /></div>
            <h3 style={{ marginBottom:10 }}>Vault Download Request</h3>
            <p style={{ fontSize:'0.95rem', color:'#fff', marginBottom:24 }}>
              <b>{vaultDownloadRequest.from || 'Partner'}</b> wants to save the memory <b>"{vaultDownloadRequest.title || 'Unknown'}"</b> to their phone. Allow?
            </p>
            <div style={{ display:'flex', gap:12 }}>
              <button className="btn btn-g" onClick={() => {
                wsService.sendVaultDownloadResponse(vaultDownloadRequest.sender_id, false, vaultDownloadRequest.memory_id);
                setVaultDownloadRequest(null);
              }} style={{ flex: 1, padding: 14 }}>Deny</button>
              <button className="btn btn-p" onClick={() => {
                wsService.sendVaultDownloadResponse(vaultDownloadRequest.sender_id, true, vaultDownloadRequest.memory_id);
                setVaultDownloadRequest(null);
              }} style={{ flex: 1, padding: 14, color: '#000', fontWeight: 700 }}>Allow Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
