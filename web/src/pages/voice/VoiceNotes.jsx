import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ros_token');
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

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
    <div className="card" style={{ 
      marginBottom: 16, 
      borderLeft: `3px solid ${isMe ? 'var(--accent)' : 'var(--purple)'}`,
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '16px 20px'
    }}>
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={e => { setCurrent(e.target.currentTime); setProgress((e.target.currentTime / e.target.duration) * 100 || 0); }}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrent(0); }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Play button */}
        <button onClick={toggle} style={{ 
          width: 48, height: 48, borderRadius: '50%', 
          background: playing ? 'var(--accent)' : 'rgba(255,255,255,0.05)', 
          color: playing ? '#000' : 'var(--text)',
          border: 'none', cursor: 'pointer', fontSize: '1.2rem', 
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: playing ? '0 0 15px rgba(201,169,110,0.4)' : 'none',
          transition: 'var(--t)'
        }}>
          {playing ? '⏸' : '▶️'}
        </button>

        {/* Waveform progress */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.9rem', color: isMe ? 'var(--accent)' : 'var(--purple)', fontWeight: 600 }}>{customName || fromName}</span>
              {isMe && <button onClick={() => onRename(id, customName)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', padding: 0, opacity: 0.6 }}>✏️</button>}
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{new Date(createdAt).toLocaleDateString()}</span>
          </div>
          {/* Progress bar */}
          <div
            style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 6, cursor: 'pointer', position: 'relative' }}
            onClick={e => {
              if (!audioRef.current || !audioRef.current.duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              audioRef.current.currentTime = pct * audioRef.current.duration;
            }}
          >
            <div style={{ height: '100%', width: `${progress}%`, background: isMe ? 'var(--accent)' : 'var(--purple)', borderRadius: 99, transition: 'width 0.1s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{formatTime(current)}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>{duration ? formatTime(duration) : formatSize(size)}</span>
          </div>
        </div>

        {/* Delete */}
        {isMe && (
          <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1rem', padding: 4 }}>🗑️</button>
        )}
      </div>
    </div>
  );
}

export default function VoiceNotes() {
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [myId] = useState(() => {
    try { return JSON.parse(atob(localStorage.getItem('ros_token').split('.')[1])).sub; } catch { return ''; }
  });

  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => { fetchNotes(); }, [searchQuery, fromDate, toDate]);

  const fetchNotes = async () => {
    try {
      const { data } = await api.get('/voice-notes/', {
        params: { query: searchQuery, from_date: fromDate, to_date: toDate }
      });
      setNotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
      chunksRef.current = [];
      mr.ondataavailable = e => chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType });
        await uploadVoice(blob, mr.mimeType);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecordTime(0);
      timerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
    } catch {
      alert('Microphone permission required.');
    }
  };

  const stopRecording = () => {
    if (mediaRef.current) mediaRef.current.stop();
    clearInterval(timerRef.current);
    setRecording(false);
  };

  const uploadVoice = async (blob, mimeType) => {
    setUploading(true);
    const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
    const form = new FormData();
    form.append('file', blob, `voice_note.${ext}`);
    await api.post('/voice-notes/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    await fetchNotes();
    setUploading(false);
  };

  const deleteNote = async (id) => {
    if (!confirm('Delete this recording?')) return;
    await api.delete(`/voice-notes/${id}`);
    setNotes(n => n.filter(x => x.id !== id));
  };

  const renameNote = async (id, current) => {
    const newName = prompt('Enter a name for this recording:', current || '');
    if (newName === null) return;
    try {
      await api.patch(`/voice-notes/${id}/rename`, { custom_name: newName });
      fetchNotes();
    } catch (err) {
      alert('Failed to rename');
    }
  };

  return (
    <div className="page" style={{ padding: '0 0 80px' }}>
      {/* Header */}
      <header className="header" style={{ margin: '12px 20px', borderRadius: '16px' }}>
        <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '1.2rem' }}>←</button>
        <span className="header-title">Voice Whispers</span>
      </header>

      {/* Search & Filter */}
      <div style={{ padding: '8px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input 
          type="text" 
          placeholder="Find a memory..." 
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ width: '100%', padding: '12px 18px', borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'white', fontSize: '0.95rem', backdropFilter: 'blur(10px)' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          <input 
            type="date" 
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'white', fontSize: '0.85rem' }}
          />
          <input 
            type="date" 
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            style={{ flex: 1, padding: '10px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'white', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      {/* Record button */}
      <div style={{ padding: '20px 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', marginBottom: 20 }}>
          {recording && (
            <>
              <div style={{ position: 'absolute', inset: -15, borderRadius: '50%', border: '2px solid var(--accent)', animation: 'pulse 1.5s infinite', opacity: 0.4 }} />
              <div style={{ position: 'absolute', inset: -30, borderRadius: '50%', border: '1px solid var(--accent)', animation: 'pulse 1.5s infinite 0.5s', opacity: 0.2 }} />
            </>
          )}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            style={{
              width: 88, height: 88, borderRadius: '50%',
              background: recording ? 'var(--danger)' : 'var(--accent)',
              border: 'none', cursor: 'pointer', fontSize: '2rem',
              boxShadow: recording ? '0 0 30px rgba(224,112,112,0.4)' : '0 10px 30px rgba(201,169,110,0.3)',
              transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              transform: recording ? 'scale(1.1)' : 'scale(1)'
            }}
          >
            {uploading ? '⏳' : recording ? '⏹' : '🎙️'}
          </button>
        </div>
        {recording && <p style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '1.1rem', letterSpacing: '1px' }}>{formatTime(recordTime)}</p>}
      </div>

      {/* Voice notes list */}
      <div style={{ padding: '0 20px' }}>
        {notes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎵</div>
            <p>No voice notes found.</p>
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
            onDelete={() => deleteNote(note.id)}
            onRename={renameNote}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `}</style>
    </div>
  );
}
