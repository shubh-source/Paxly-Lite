import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/ui/Icons';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(0)}KB`;
  return `${(bytes/(1024*1024)).toFixed(1)}MB`;
}

function VoicePlayer({ id, url, customName, fromName, createdAt, size, onDelete, onRename, isMe }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  };

  return (
    <div className="card card-hover" style={{ 
      marginBottom: 16, 
      borderLeft: `4px solid ${isMe ? 'var(--accent)' : 'var(--purple)'}`,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      padding: '20px',
      borderRadius: 24,
      animation: 'fadeInUp 0.4s ease-out'
    }}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => { setCurrent(e.target.currentTime); setProgress((e.target.currentTime / e.target.duration) * 100 || 0); }}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Play button */}
        <button onClick={toggle} style={{ 
          width: 52, height: 52, borderRadius: '50%', 
          background: playing ? 'var(--accent)' : 'rgba(255,255,255,0.06)', 
          color: playing ? '#000' : '#fff',
          border: 'none', cursor: 'pointer',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: playing ? '0 8px 20px rgba(201,169,110,0.3)' : 'none',
          transition: 'all 0.3s ease'
        }}>
          {playing ? <Icons.Pause size={20} /> : <Icons.Play size={20} />}
        </button>

        {/* Waveform progress */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.95rem', color: isMe ? 'var(--accent)' : 'var(--purple)', fontWeight: 700 }}>{customName || fromName}</span>
              <button onClick={() => onRename(id, customName)} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 8, color: 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Edit size={14} /></button>
              {isMe && <button onClick={() => onDelete(id)} style={{ background: 'rgba(255,59,48,0.1)', border: 'none', cursor: 'pointer', padding: '6px', borderRadius: 8, color: '#FF3B30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.Trash size={14} /></button>}
              {url.includes('chat_media') && <span style={{ fontSize: '0.6rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, color: 'var(--muted)', letterSpacing: 0.5 }}>CHAT</span>}
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
          {/* Progress bar */}
          <div
            style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 8, cursor: 'pointer', position: 'relative' }}
            onClick={e => {
              if (!audioRef.current || !audioRef.current.duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = pct * audioRef.current.duration;
            }}
          >
            <div style={{ height: '100%', width: `${progress}%`, background: isMe ? 'var(--accent)' : 'var(--purple)', borderRadius: 99, transition: 'width 0.1s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: '0.72rem', color: playing ? 'var(--accent)' : 'var(--muted)', fontWeight: 600 }}>{formatTime(current)}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{duration ? formatTime(duration) : formatSize(size)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VoiceNotes() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [myId] = useState(() => {
    try { return JSON.parse(atob(localStorage.getItem('ros_token').split('.')[1])).sub; } catch { return ''; }
  });

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => { 
    // Load from cache first for instant UX
    const cached = localStorage.getItem('cached_voicenotes');
    if (cached) {
      try {
        setNotes(JSON.parse(cached));
        setLoading(false);
      } catch {}
    }
    fetchNotes(); 
  }, [searchQuery, fromDate, toDate]);

  const fetchNotes = async () => {
    try {
      const { data } = await api.get('/voice-notes/', {
        params: { query: searchQuery, from_date: fromDate, to_date: toDate }
      });
      localStorage.setItem('cached_voicenotes', JSON.stringify(data));
      setNotes(data);
    } catch (err) {
      console.error("Failed to fetch voice notes", err);
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); // Safer without explicit mimeType
      chunksRef.current = [];
      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        await uploadVoice(blob, mr.mimeType || 'audio/webm');
      };
      mr.start(100);
      mediaRef.current = mr;
      setRecording(true);
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch (e) {
      alert('Microphone permission required or recording failed: ' + e.message);
    }
  };

  const stopRecording = () => {
    if (mediaRef.current) mediaRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const uploadVoice = async (blob, mimeType) => {
    setUploading(true);
    try {
      const ext = (mimeType || '').includes('ogg') ? 'ogg' : (mimeType || '').includes('mp4') ? 'mp4' : 'webm';
      const form = new FormData();
      form.append('file', blob, `voice_note.${ext}`);
      await api.post('/voice-notes/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await fetchNotes();
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      setUploading(false);
    }
  };

  const deleteNote = async (id) => {
    if (!window.confirm('Are you sure you want to delete this voice note?')) return;
    try {
      await api.delete(`/voice-notes/${id}`);
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      alert('Failed to delete note');
    }
  };

  const renameNote = async (id, current) => {
    // Premium Gating: 10 renames per month for free users
    if (!user?.is_premium) {
      const monthKey = `paxly_renames_${new Date().toISOString().slice(0, 7)}`;
      let count = parseInt(localStorage.getItem(monthKey) || '0', 10);
      if (count >= 10) {
        alert("💎 You've used all 10 free Voice Note renames this month. Upgrade to Premium for unlimited organization and customization!");
        return;
      }
    }

    const newName = prompt('Enter a name for this recording:', current || '');
    if (newName === null) return;
    try {
      await api.patch(`/voice-notes/${id}/rename`, { custom_name: newName });
      
      // Increment counter for free users
      if (!user?.is_premium) {
        const monthKey = `paxly_renames_${new Date().toISOString().slice(0, 7)}`;
        let count = parseInt(localStorage.getItem(monthKey) || '0', 10);
        localStorage.setItem(monthKey, (count + 1).toString());
      }
      
      fetchNotes();
    } catch (err) {
      alert('Failed to rename');
    }
  };

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      {/* Premium Header */}
      <header className="header" style={{ 
        background: 'rgba(22, 22, 24, 0.4)', 
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        margin: '20px 20px 12px',
        borderRadius: '24px',
        padding: '16px 20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/dashboard" style={{ color: 'var(--muted)', display: 'flex', alignItems: 'center' }}><Icons.Back size={24} /></Link>
          <span className="header-title" style={{ color: 'var(--text)' }}>Voice Whispers</span>
        </div>
        <div style={{ width: 32 }} />
      </header>

      {/* Search Bar Only (Cleaner UI) */}
      <div style={{ padding: '8px 20px 24px' }}>
        <input 
          type="text" 
          placeholder="Search your whispers..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '16px 24px', borderRadius: 20, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: '1rem', outline: 'none', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
        />
      </div>

      {/* Record button Area */}
      <div style={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          {recording && (
            <div style={{ position: 'absolute', inset: -20, borderRadius: '50%', border: '2px solid var(--accent)', animation: 'pulseWave 2s infinite' }} />
          )}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            style={{
              width: 100, height: 100, borderRadius: '50%',
              background: recording ? '#FF3B30' : 'var(--accent)',
              border: 'none', cursor: 'pointer',
              boxShadow: recording ? '0 0 40px rgba(255,59,48,0.4)' : '0 15px 40px rgba(201,169,110,0.3)',
              transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 10, position: 'relative'
            }}
          >
            {uploading ? <div className="spinner-small" /> : recording ? <div style={{width: 30, height: 30, background: '#fff', borderRadius: 6}} /> : <Icons.Mic size={44} color="#000" />}
          </button>
        </div>
        <p style={{ 
          color: recording ? 'var(--accent)' : 'var(--muted)', 
          fontWeight: 700, 
          fontSize: '1.2rem', 
          letterSpacing: 1,
          fontFamily: 'monospace' 
        }}>{recording ? formatTime(recordTime) : 'TAP TO RECORD'}</p>
      </div>

      {/* Voice notes list */}
      <div style={{ padding: '0 20px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', opacity: 0.7 }}>
            <div className="loader" />
            <p style={{ marginTop: 16, color: 'var(--muted)', fontSize: '0.9rem' }}>Loading whispers...</p>
          </div>
        ) : notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.7 }}>
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'center' }}><Icons.Mic size={64} color="var(--accent)" stroke={1} /></div>
            <h3 style={{ marginBottom: 8 }}>Silent space</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Record a whisper that lasts forever.</p>
          </div>
        ) : notes.map(note => (
          <VoicePlayer
            key={note.id}
            id={note.id}
            url={note.url}
            customName={note.custom_name}
            fromName={note.sender_id === myId ? 'Me' : 'Partner'}
            createdAt={note.created_at}
            size={note.size}
            isMe={note.sender_id === myId}
            onRename={renameNote}
            onDelete={deleteNote}
          />
        ))}
      </div>

      <style>{`
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseWave { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.6); opacity: 0; } }
      `}</style>
    </div>
  );
}
