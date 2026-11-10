import { useState, useEffect, useRef, useCallback } from 'react';
import { wsService } from '../../services/websocket';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../ui/Icons';

// Curated date-night presets for couples
const CURATED_PRESETS = [
  {
    id: 'jfKfPfyJRdk',
    title: 'Romantic Lofi Beats',
    subtitle: 'Relaxing study & cuddle vibes',
    emoji: '🎵',
    tag: 'Chill & Relax'
  },
  {
    id: 'bn9F19Hi1Lk',
    title: 'Rainy Night Coffee Shop',
    subtitle: 'Cozy fireplace & soft rain ambience',
    emoji: '🌌',
    tag: 'Ambience'
  },
  {
    id: 'YoHD9XEInc0',
    title: 'Cinematic Movie Trailers',
    subtitle: 'Latest blockbusters & teasers',
    emoji: '🎬',
    tag: 'Cinema'
  },
  {
    id: '86x-u-41SVE',
    title: 'Couple Standup Comedy',
    subtitle: 'Laugh-out-loud relationship humor',
    emoji: '😂',
    tag: 'Comedy'
  },
  {
    id: 'kJQP7kiw5Fk',
    title: 'Midnight Acoustic Love Songs',
    subtitle: 'Slow romantic guitar melodies',
    emoji: '💖',
    tag: 'Romance'
  },
  {
    id: '4xDzrJKXOOY',
    title: 'Maldives Ocean Sunset 4K',
    subtitle: 'Dream vacation waves & sunset glow',
    emoji: '🏖️',
    tag: 'Travel Dream'
  }
];

const EMOJI_REACTIONS = ['🍿', '❤️', '😂', '🔥', '🥺', '🥂'];

export function extractYouTubeId(url) {
  if (!url) return null;
  const clean = url.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

  const patterns = [
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/)([^#&?]*)/,
    /[?&]v=([^#&?]*)/,
    /[?&]vi=([^#&?]*)/
  ];

  for (const regex of patterns) {
    const match = clean.match(regex);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }
  return null;
}

export default function WatchTogether({ onClose = null, isEmbedded = false }) {
  const { user, partner } = useAuth();
  const [videoId, setVideoId] = useState('jfKfPfyJRdk'); // Default to romantic lofi
  const [inputUrl, setInputUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('🟢 Synced with Partner');
  const [videoTitle, setVideoTitle] = useState('Romantic Lofi Beats');
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [syncNotice, setSyncNotice] = useState(null);

  const playerRef = useRef(null);
  const isRemoteActionRef = useRef(false);
  const lastStateChangeTimeRef = useRef(0);
  const syncTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const currentVideoIdRef = useRef(videoId);
  currentVideoIdRef.current = videoId;

  const showNotice = (text) => {
    setSyncNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setSyncNotice(null), 3500);
  };

  // 1. Load YouTube IFrame API
  useEffect(() => {
    let checkInterval = null;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;
      if (playerRef.current) return;

      const container = document.getElementById('watch-together-player-frame');
      if (!container) return;

      playerRef.current = new window.YT.Player('watch-together-player-frame', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            setPlayerReady(true);
            try {
              const data = event.target.getVideoData();
              if (data?.title) setVideoTitle(data.title);
            } catch {}
            // Ask partner for existing playback state in case they are already watching
            wsService.requestWatchPartyState();
          },
          onStateChange: handlePlayerStateChange
        }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }

      const prevHandler = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevHandler) prevHandler();
        initPlayer();
      };

      checkInterval = setInterval(() => {
        if (window.YT && window.YT.Player) {
          initPlayer();
          clearInterval(checkInterval);
        }
      }, 300);
    }

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  // 2. Handle YouTube Player State Change (Local -> Remote)
  const handlePlayerStateChange = useCallback((event) => {
    if (!playerRef.current) return;

    // Prevent echoing back actions triggered by partner's WebSocket event
    if (isRemoteActionRef.current) return;

    const now = Date.now();
    // Debounce rapid state changes
    if (now - lastStateChangeTimeRef.current < 400) return;
    lastStateChangeTimeRef.current = now;

    const state = event.data;
    const currentTime = typeof playerRef.current.getCurrentTime === 'function' 
      ? playerRef.current.getCurrentTime() 
      : 0;

    if (state === window.YT?.PlayerState?.PLAYING) {
      setIsPlaying(true);
      setSyncStatus('🟢 In Sync');
      wsService.sendWatchPartySync({
        action: 'play',
        video_id: currentVideoIdRef.current,
        video_title: videoTitle,
        time: currentTime
      });
    } else if (state === window.YT?.PlayerState?.PAUSED) {
      setIsPlaying(false);
      setSyncStatus('⏸️ Paused');
      wsService.sendWatchPartySync({
        action: 'pause',
        video_id: currentVideoIdRef.current,
        video_title: videoTitle,
        time: currentTime
      });
    }
  }, [videoTitle]);

  // 3. WebSocket Listener for Remote Partner Sync
  useEffect(() => {
    const handleRemoteSync = (payload) => {
      if (!payload || !playerRef.current) return;
      const { action, time, video_id, video_title, reaction, from_name } = payload;
      const senderName = from_name || partner?.name || 'Partner';

      if (action === 'reaction' && reaction) {
        spawnFloatingEmoji(reaction, senderName);
        return;
      }

      if (action === 'load' && video_id) {
        isRemoteActionRef.current = true;
        setVideoId(video_id);
        if (video_title) setVideoTitle(video_title);
        showNotice(`🍿 ${senderName} loaded: ${video_title || 'New Video'}`);
        try {
          playerRef.current.loadVideoById(video_id, time || 0);
          setIsPlaying(true);
        } catch {}
        setTimeout(() => { isRemoteActionRef.current = false; }, 800);
        return;
      }

      if (action === 'play') {
        isRemoteActionRef.current = true;
        setIsPlaying(true);
        showNotice(`▶️ ${senderName} resumed playback`);
        setSyncStatus(`🟢 Synced with ${senderName}`);
        try {
          const current = playerRef.current.getCurrentTime();
          if (time !== undefined && Math.abs(current - time) > 1.5) {
            playerRef.current.seekTo(time, true);
          }
          playerRef.current.playVideo();
        } catch {}
        setTimeout(() => { isRemoteActionRef.current = false; }, 800);
      } else if (action === 'pause') {
        isRemoteActionRef.current = true;
        setIsPlaying(false);
        showNotice(`⏸️ ${senderName} paused the video`);
        setSyncStatus(`⏸️ ${senderName} paused`);
        try {
          if (time !== undefined) {
            playerRef.current.seekTo(time, true);
          }
          playerRef.current.pauseVideo();
        } catch {}
        setTimeout(() => { isRemoteActionRef.current = false; }, 800);
      } else if (action === 'seek') {
        isRemoteActionRef.current = true;
        showNotice(`⏩ ${senderName} jumped to ${formatTime(time)}`);
        try {
          playerRef.current.seekTo(time, true);
        } catch {}
        setTimeout(() => { isRemoteActionRef.current = false; }, 800);
      }
    };

    const handleRemoteState = (payload) => {
      if (!payload || !playerRef.current) return;
      const { video_id, video_title, is_playing, time, last_user_name } = payload;
      if (video_id && video_id !== currentVideoIdRef.current) {
        setVideoId(video_id);
        if (video_title) setVideoTitle(video_title);
        try {
          playerRef.current.loadVideoById(video_id, time || 0);
          if (!is_playing) playerRef.current.pauseVideo();
        } catch {}
      } else if (time !== undefined) {
        try {
          playerRef.current.seekTo(time, true);
          if (is_playing) playerRef.current.playVideo();
          else playerRef.current.pauseVideo();
        } catch {}
      }
      showNotice(`⚡ Synced with ${last_user_name || partner?.name || 'Partner'}`);
    };

    wsService.on('watch_party_sync', handleRemoteSync);
    wsService.on('watch_party_state', handleRemoteState);

    return () => {
      wsService.off('watch_party_sync', handleRemoteSync);
      wsService.off('watch_party_state', handleRemoteState);
    };
  }, [partner]);

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Spawn floating reactions
  const spawnFloatingEmoji = (emoji, sender = null) => {
    const id = Date.now() + Math.random();
    const leftOffset = 20 + Math.random() * 60; // Random horizontal placement
    const newEmoji = { id, emoji, sender, left: `${leftOffset}%` };
    setFloatingEmojis(prev => [...prev, newEmoji]);
    setTimeout(() => {
      setFloatingEmojis(prev => prev.filter(e => e.id !== id));
    }, 2800);
  };

  const handleSendReaction = (emoji) => {
    spawnFloatingEmoji(emoji, 'You');
    wsService.sendWatchPartySync({
      action: 'reaction',
      reaction: emoji
    });
  };

  // Load new video URL
  const handleLoadUrl = (e) => {
    if (e) e.preventDefault();
    const id = extractYouTubeId(inputUrl);
    if (!id) {
      alert('Please enter a valid YouTube link (e.g. https://youtu.be/... or https://youtube.com/watch?v=...)');
      return;
    }
    loadVideo(id, 'Custom Video');
    setInputUrl('');
  };

  const loadVideo = (id, title = '') => {
    setVideoId(id);
    setVideoTitle(title || 'Watch Party Video');
    if (playerRef.current) {
      isRemoteActionRef.current = true;
      try {
        playerRef.current.loadVideoById(id, 0);
        setIsPlaying(true);
      } catch {}
      setTimeout(() => { isRemoteActionRef.current = false; }, 800);
    }
    // Broadcast load event to partner
    wsService.sendWatchPartySync({
      action: 'load',
      video_id: id,
      video_title: title,
      time: 0
    });
    showNotice(`🍿 Started: ${title || 'Video'}`);
  };

  // Sync controls: -10s, Play/Pause, +10s, Force Sync
  const togglePlayPause = () => {
    if (!playerRef.current) return;
    try {
      const current = playerRef.current.getCurrentTime();
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
        wsService.sendWatchPartySync({
          action: 'pause',
          video_id: videoId,
          video_title: videoTitle,
          time: current
        });
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
        wsService.sendWatchPartySync({
          action: 'play',
          video_id: videoId,
          video_title: videoTitle,
          time: current
        });
      }
    } catch {}
  };

  const seekRelative = (delta) => {
    if (!playerRef.current) return;
    try {
      const current = playerRef.current.getCurrentTime();
      const target = Math.max(0, current + delta);
      playerRef.current.seekTo(target, true);
      wsService.sendWatchPartySync({
        action: 'seek',
        video_id: videoId,
        video_title: videoTitle,
        time: target
      });
      showNotice(`${delta > 0 ? '+10s' : '-10s'} jumped together`);
    } catch {}
  };

  const forceSyncWithPartner = () => {
    wsService.requestWatchPartyState();
    showNotice('🔄 Syncing with partner...');
  };

  return (
    <div className={`watch-together-container ${isEmbedded ? 'embedded' : 'standalone'}`}>
      {/* Top Header */}
      <div className="watch-header">
        <div className="header-left">
          <div className="cinema-icon-badge">🍿</div>
          <div>
            <h2 className="watch-title">Couple Cinema</h2>
            <div className="watch-status-row">
              <span className="live-dot" />
              <span className="sync-pill">{syncStatus}</span>
              {partner?.name && (
                <span className="partner-name-pill">with {partner.name} ❤️</span>
              )}
            </div>
          </div>
        </div>

        <div className="header-actions">
          <button 
            className="action-btn sync-btn" 
            onClick={forceSyncWithPartner}
            title="Force Resync"
          >
            ⚡ Sync
          </button>
          {onClose && (
            <button className="action-btn close-btn" onClick={onClose} title="Close Cinema">
              <Icons.Close size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Sync Notification Banner */}
      {syncNotice && (
        <div className="sync-toast-banner">
          <span>{syncNotice}</span>
        </div>
      )}

      {/* Video Player Container */}
      <div className="video-player-wrapper">
        <div id="watch-together-player-frame" />

        {/* Floating Animated Emojis Overlay */}
        <div className="floating-reactions-overlay">
          {floatingEmojis.map(item => (
            <div key={item.id} className="floating-emoji-item" style={{ left: item.left }}>
              <span className="emoji-char">{item.emoji}</span>
              {item.sender && item.sender !== 'You' && (
                <span className="sender-tag">{item.sender}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Synchronized Action Bar */}
      <div className="player-controls-bar">
        <button className="ctrl-btn" onClick={() => seekRelative(-10)} title="Rewind 10 seconds together">
          ⏪ -10s
        </button>
        <button className="ctrl-btn play-toggle-btn" onClick={togglePlayPause}>
          {isPlaying ? '⏸️ Pause' : '▶️ Play'}
        </button>
        <button className="ctrl-btn" onClick={() => seekRelative(10)} title="Forward 10 seconds together">
          +10s ⏩
        </button>
      </div>

      {/* Couple Live Emoji Reactions */}
      <div className="reactions-container">
        <span className="reactions-label">Live Reaction:</span>
        <div className="reactions-row">
          {EMOJI_REACTIONS.map(emoji => (
            <button
              key={emoji}
              className="reaction-emoji-btn"
              onClick={() => handleSendReaction(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Paste YouTube URL Bar */}
      <form onSubmit={handleLoadUrl} className="url-input-card">
        <input
          type="text"
          className="url-input"
          placeholder="Paste any YouTube video or Shorts link..."
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
        />
        <button type="submit" className="load-btn">
          Watch Together 🚀
        </button>
      </form>

      {/* Curated Date-Night Presets */}
      <div className="presets-section">
        <h3 className="section-title">Romantic Date-Night Picks ✨</h3>
        <div className="presets-grid">
          {CURATED_PRESETS.map(preset => (
            <div
              key={preset.id}
              className={`preset-card ${videoId === preset.id ? 'active' : ''}`}
              onClick={() => loadVideo(preset.id, preset.title)}
            >
              <div className="preset-emoji">{preset.emoji}</div>
              <div className="preset-info">
                <span className="preset-tag">{preset.tag}</span>
                <h4 className="preset-name">{preset.title}</h4>
                <p className="preset-sub">{preset.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .watch-together-container {
          background: #0a0a0c;
          color: #f0f0f0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 16px 48px rgba(0,0,0,0.6);
        }

        .watch-together-container.standalone {
          padding: 16px;
          max-width: 900px;
          margin: 0 auto 30px;
        }

        .watch-together-container.embedded {
          padding: 14px;
          height: 100%;
          overflow-y: auto;
        }

        .watch-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          margin-bottom: 14px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .cinema-icon-badge {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(201, 169, 110, 0.25), rgba(201, 169, 110, 0.05));
          border: 1px solid rgba(201, 169, 110, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.5rem;
        }

        .watch-title {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0;
          color: #fff;
          letter-spacing: 0.3px;
        }

        .watch-status-row {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 2px;
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #10B981;
          box-shadow: 0 0 8px #10B981;
          display: inline-block;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }

        .sync-pill {
          font-size: 0.72rem;
          color: #10B981;
          font-weight: 600;
        }

        .partner-name-pill {
          font-size: 0.72rem;
          color: #C9A96E;
          background: rgba(201, 169, 110, 0.12);
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .action-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: #e0e0e0;
          padding: 6px 12px;
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.8rem;
          font-weight: 600;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .action-btn:hover {
          background: rgba(255,255,255,0.12);
          color: #fff;
        }

        .sync-btn {
          color: #C9A96E;
          border-color: rgba(201, 169, 110, 0.3);
        }

        .sync-toast-banner {
          background: linear-gradient(90deg, rgba(201, 169, 110, 0.2), rgba(16, 185, 129, 0.2));
          border: 1px solid rgba(201, 169, 110, 0.4);
          padding: 8px 14px;
          border-radius: 10px;
          font-size: 0.82rem;
          color: #fff;
          text-align: center;
          margin-bottom: 12px;
          animation: fadeInDown 0.3s ease-out;
        }

        .video-player-wrapper {
          position: relative;
          width: 100%;
          padding-top: 56.25%; /* 16:9 Aspect Ratio */
          background: #000;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 8px 30px rgba(0,0,0,0.5);
        }

        #watch-together-player-frame {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }

        .floating-reactions-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 10;
        }

        .floating-emoji-item {
          position: absolute;
          bottom: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          animation: floatUp 2.8s ease-out forwards;
        }

        .emoji-char {
          font-size: 2.2rem;
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.6));
        }

        .sender-tag {
          font-size: 0.65rem;
          background: rgba(0,0,0,0.7);
          color: #C9A96E;
          padding: 1px 6px;
          border-radius: 6px;
          white-space: nowrap;
          margin-top: 2px;
          border: 1px solid rgba(201, 169, 110, 0.3);
        }

        @keyframes floatUp {
          0% {
            opacity: 1;
            transform: translateY(0) scale(0.6) rotate(0deg);
          }
          50% {
            transform: translateY(-120px) scale(1.2) rotate(10deg);
          }
          100% {
            opacity: 0;
            transform: translateY(-240px) scale(1) rotate(-10deg);
          }
        }

        .player-controls-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 12px 0;
        }

        .ctrl-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          color: #fff;
          padding: 8px 18px;
          border-radius: 12px;
          font-size: 0.88rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .ctrl-btn:hover {
          background: rgba(255,255,255,0.15);
        }

        .play-toggle-btn {
          background: linear-gradient(135deg, #C9A96E, #99783D);
          color: #000;
          border: none;
          padding: 9px 24px;
          font-weight: 700;
        }

        .play-toggle-btn:hover {
          filter: brightness(1.1);
        }

        .reactions-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          padding: 8px 14px;
          border-radius: 14px;
          margin-bottom: 14px;
        }

        .reactions-label {
          font-size: 0.78rem;
          color: #999;
          font-weight: 500;
        }

        .reactions-row {
          display: flex;
          gap: 8px;
        }

        .reaction-emoji-btn {
          background: transparent;
          border: none;
          font-size: 1.4rem;
          cursor: pointer;
          padding: 4px;
          transition: transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          user-select: none;
        }

        .reaction-emoji-btn:active {
          transform: scale(1.4);
        }

        .url-input-card {
          display: flex;
          gap: 8px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          padding: 6px;
          border-radius: 14px;
          margin-bottom: 18px;
        }

        .url-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #fff;
          font-size: 0.85rem;
          padding: 8px 12px;
        }

        .url-input::placeholder {
          color: rgba(255,255,255,0.4);
        }

        .load-btn {
          background: #C9A96E;
          color: #000;
          border: none;
          font-weight: 700;
          font-size: 0.82rem;
          padding: 8px 16px;
          border-radius: 10px;
          cursor: pointer;
          white-space: nowrap;
          transition: filter 0.2s;
        }

        .load-btn:hover {
          filter: brightness(1.1);
        }

        .presets-section {
          margin-top: 8px;
        }

        .section-title {
          font-size: 0.88rem;
          font-weight: 600;
          color: #C9A96E;
          margin-bottom: 10px;
        }

        .presets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 10px;
        }

        .preset-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          padding: 10px 14px;
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .preset-card:hover {
          background: rgba(255,255,255,0.06);
          border-color: rgba(201, 169, 110, 0.4);
          transform: translateY(-2px);
        }

        .preset-card.active {
          background: rgba(201, 169, 110, 0.1);
          border-color: #C9A96E;
        }

        .preset-emoji {
          font-size: 1.6rem;
        }

        .preset-tag {
          font-size: 0.65rem;
          text-transform: uppercase;
          color: #C9A96E;
          font-weight: 700;
          letter-spacing: 0.5px;
        }

        .preset-name {
          font-size: 0.84rem;
          font-weight: 600;
          color: #fff;
          margin: 2px 0;
        }

        .preset-sub {
          font-size: 0.72rem;
          color: rgba(255,255,255,0.5);
          margin: 0;
        }
      `}</style>
    </div>
  );
}
