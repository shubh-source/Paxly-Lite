import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../ui/Icons';
import { decryptMediaBlob } from '../../services/crypto';

export default function VoiceNotePlayer({ src, isMe, theme, encryptionKey }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [localSrc, setLocalSrc] = useState(src);
  const audioRef = useRef(null);

  useEffect(() => {
    if (encryptionKey && src) {
      fetch(src)
        .then(res => res.blob())
        .then(blob => decryptMediaBlob(blob, encryptionKey))
        .then(decryptedBlob => {
          const url = URL.createObjectURL(decryptedBlob);
          setLocalSrc(url);
        })
        .catch(err => console.error("Audio decryption failed:", err));
    }
  }, [src, encryptionKey]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setAudioData = () => {
      // Some browsers return Infinity for duration of webm/ogg files
      if (audio.duration && audio.duration !== Infinity) {
        setDuration(audio.duration);
      }
    };
    const setAudioTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', setAudioData);
    audio.addEventListener('timeupdate', setAudioTime);
    audio.addEventListener('ended', onEnd);

    return () => {
      audio.removeEventListener('loadedmetadata', setAudioData);
      audio.removeEventListener('timeupdate', setAudioTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = (e) => {
    e.stopPropagation(); // Prevent opening secure modal
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (s) => {
    if (isNaN(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${m}:${secs.toString().padStart(2, '0')}`;
  };

  // Determine colors based on sender
  const fgColor = isMe ? (theme.textMe || '#111') : (theme.textOther || '#fff');
  const accentColor = isMe ? 'rgba(0,0,0,0.6)' : (theme.accent || '#b3945a');
  
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220 }} onClick={e => e.stopPropagation()}>
      <audio ref={audioRef} src={localSrc} preload="metadata" />
      
      {/* Play/Pause Button */}
      <button 
        onClick={togglePlay}
        style={{ 
          width: 38, height: 38, borderRadius: '50%', 
          background: isMe ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)', 
          border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, padding: 0
        }}
      >
        {isPlaying 
          ? <Icons.Pause size={18} color={fgColor} /> 
          : <Icons.Play size={18} color={fgColor} style={{ marginLeft: 3 }} />
        }
      </button>

      {/* Visualizer & Timer */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 26, padding: '0 4px' }}>
          {/* Animated beats */}
          {[0.9, 0.7, 1.1, 0.8, 1.0, 1.2, 0.85, 1.05, 0.75, 1.15].map((dur, i) => (
            <div 
              key={i} 
              style={{ 
                flex: 1, maxWidth: 3, background: accentColor, borderRadius: 2, 
                height: '100%', transformOrigin: 'center',
                animation: isPlaying ? `audioWave ${dur}s infinite ease-in-out ${dur * 0.5}s` : 'none',
                transform: 'scaleY(0.15)',
                opacity: isPlaying ? 1 : 0.4,
                transition: 'opacity 0.2s'
              }} 
            />
          ))}
        </div>
        
        {/* Progress Text */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: fgColor, opacity: 0.6, padding: '0 2px', fontWeight: 500 }}>
          <span>{formatTime(currentTime)}</span>
          <span>{duration ? formatTime(duration) : '...'}</span>
        </div>
      </div>
      
      {/* Mic Icon Avatar */}
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: isMe ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icons.Mic size={14} color={accentColor} />
      </div>
    </div>
  );
}
