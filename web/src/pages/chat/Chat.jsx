import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { wsService } from '../../services/websocket';
import api, { getMessages, getSpace, uploadMedia } from '../../services/api';
import { format } from 'date-fns';
import { encryptMessage, decryptMessage, encryptMediaBlob, decryptMediaBlob } from '../../services/crypto';
import {
  getScopedCachedMessages,
  setScopedCachedMessages,
  getScopedCachedPartner,
  setScopedCachedPartner,
  getScopedCachedSpace,
  setScopedCachedSpace,
  getScopedChatDraft,
  setScopedChatDraft,
  cleanupLegacyGlobalChatKeys,
  safeGetItem,
  safeSetItem,
  safeRemoveItem
} from '../../services/chatCache';
import EncryptedMedia from '../../components/chat/EncryptedMedia';
import SecureViewer from '../../components/SecureViewer';
import ThemePicker from './ThemePicker';
import VoiceNotePlayer from '../../components/chat/VoiceNotePlayer';
import DynamicPresence from '../../components/chat/DynamicPresence';
import VlynxlyStudio from '../../components/chat/VlynxlyStudio';
import AttachmentSheet from '../../components/chat/AttachmentSheet';
import ChatBackground from '../../components/chat/ChatBackground';
import { CHAT_THEMES } from '../../data/chatThemes';
import PremiumUpgrade from '../../components/premium/PremiumUpgrade';
import axios from 'axios';
import { Icons } from '../../components/ui/Icons';
import SecureMediaOverlay from '../../components/chat/SecureMediaOverlay';
import AskAuraModal from '../../components/chat/AskAuraModal';

export const parseSafeDate = (val) => {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof val === 'string') {
    let clean = val.trim();
    if (clean.endsWith('+00:00Z')) clean = clean.slice(0, -1);
    else if (clean.endsWith('+00:00') && !clean.includes('Z')) clean = clean.slice(0, -6) + 'Z';
    const d = new Date(clean);
    if (!isNaN(d.getTime())) return d;
    const d2 = new Date(clean.replace(' ', 'T'));
    if (!isNaN(d2.getTime())) return d2;
  }
  return new Date();
};

export const fixUrl = url => {
  if (!url) return url;
  if (url.includes('localhost') || url.includes('127.0.0.1'))
    try { return (import.meta.env.VITE_API_URL || '') + new URL(url).pathname; } catch {}
  if (url.startsWith('/')) return (import.meta.env.VITE_API_URL || '') + url;
  return url;
};

export const parseSafeReactions = (val) => {
  if (!val) return {};
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return {};
};

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const currentUserId = user?.id || null;
  const currentSpaceId = user?.couple_space_id || null;
  const activeAccountKeyRef = useRef(null);
  const pendingSaveMsgRef = useRef(null);

  const [msgs, setMsgs] = useState(() => {
    return getScopedCachedMessages(user?.id, user?.couple_space_id);
  });
  const [loadingHistory, setLoadingHistory] = useState(() => {
    const cached = getScopedCachedMessages(user?.id, user?.couple_space_id);
    return !cached || cached.length === 0;
  });
  const [text, setText] = useState(() => getScopedChatDraft(user?.id, user?.couple_space_id));
  const [partner, setPartner] = useState(() => {
    return getScopedCachedPartner(user?.id, user?.couple_space_id);
  });
  const [typing, setTyping]           = useState(false);
  const [pinnedMsg, setPinnedMsg]     = useState(null);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [sending, setSending]         = useState(false);
  const [secureMediaOpen, setSecureMediaOpen] = useState(null);

  // Voice
  const [recordState, setRecordState]           = useState('idle');
  const [recordTime, setRecordTime]             = useState(0);
  const [audioRecorder, setAudioRecorder]       = useState(null);
  const audioChunks                             = useRef([]);
  const recordInterval                          = useRef(null);
  const recordStartY                            = useRef(0);
  const recordStartX                            = useRef(0);
  const voiceRecordAction                       = useRef('send');
  const [audioPreviewUrl, setAudioPreviewUrl]   = useState(null);
  const [audioPreviewBlob, setAudioPreviewBlob] = useState(null);
  const isRecordingAudio = recordState !== 'idle';

  // Security / media
  const [pendingFile, setPendingFile]                   = useState(null);
  const [showGallerySecureModal, setShowGallerySecureModal] = useState(false);
  const [unblurred, setUnblurred]                       = useState({});
  const [viewingSecureMsg, setViewingSecureMsg]         = useState(null);

  // Presence / theme
  const [space, setSpace] = useState(() => {
    return getScopedCachedSpace(user?.id)?.space || null;
  });

  // Account / space isolation & cache synchronization (CHAT-007)
  useEffect(() => {
    cleanupLegacyGlobalChatKeys();
    if (!currentUserId || !currentSpaceId) {
      if (activeAccountKeyRef.current !== null) {
        activeAccountKeyRef.current = null;
        setMsgs([]);
        setPartner(null);
        setSpace(null);
        setText('');
        setLoadingHistory(true);
      }
      return;
    }

    // Clear any active gesture timers on space/account transition (CHAT-011)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (tapTimeout.current) {
      clearTimeout(tapTimeout.current);
      tapTimeout.current = null;
    }
    setContextMenuMsg(null);

    const newKey = `${currentUserId}_${currentSpaceId}`;
    if (activeAccountKeyRef.current !== newKey) {
      activeAccountKeyRef.current = newKey;
      setHasMore(true);
      setLoadOlderError(null);
      setLoadingOlder(false);
      loadingOlderRef.current = false;
      const scopedMsgs = getScopedCachedMessages(currentUserId, currentSpaceId);
      setMsgs(scopedMsgs);
      setLoadingHistory(scopedMsgs.length === 0);
      setPartner(getScopedCachedPartner(currentUserId, currentSpaceId));
      setSpace(getScopedCachedSpace(currentUserId)?.space || null);
      setText(getScopedChatDraft(currentUserId, currentSpaceId));
    }
  }, [currentUserId, currentSpaceId]);

  const getPartnerPublicKey = () => {
    if (partner?.public_key) return partner.public_key;
    const cachedP = getScopedCachedPartner(currentUserId, currentSpaceId);
    return cachedP?.public_key || null;
  };
  const [showThemePicker, setShowThemePicker]   = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [partnerPresence, setPartnerPresence]   = useState('idle');
  const [partnerMood, setPartnerMood]           = useState('neutral');
  const [selfMood]                              = useState('neutral');
  const [showingStudio, setShowingStudio]       = useState(false);
  const [showAttachmentSheet, setShowAttachmentSheet] = useState(false);
  
  // History Pagination (CHAT-012)
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadOlderError, setLoadOlderError] = useState(null);
  const loadingOlderRef = useRef(false);

  // Gestures & Reactions
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [floatingHeart, setFloatingHeart] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [contextMenuMsg, setContextMenuMsg] = useState(null);
  const [deleteModalMsg, setDeleteModalMsg] = useState(null);
  const [auraModalMsg, setAuraModalMsg] = useState(null);

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchStartPos = useRef({ x: 0, y: 0 });
  const longPressTimer = useRef(null);
  const isLongPressTriggered = useRef(false);
  const [swipingMsgId, setSwipingMsgId] = useState(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const pendingSendsRef = useRef(new Map());

  const handleEmojiSelect = (targetMsg, emoji, forceSet = false) => {
    if (!targetMsg || !emoji) return;
    const currentReactions = parseSafeReactions(targetMsg.reactions);
    const currentEmoji = currentReactions?.[user?.id];
    const newEmoji = forceSet ? emoji : (currentEmoji === emoji ? null : emoji);

    const isOptimistic = Boolean(targetMsg.isOptimistic) || (targetMsg.id && String(targetMsg.id).startsWith('temp_'));

    // 1. Optimistic Update (Instant feedback on screen + local cache)
    setMsgs(prev => {
      const updated = prev.map(m => {
        if (m.id === targetMsg.id || (targetMsg.temp_id && m.temp_id === targetMsg.temp_id)) {
          const nextReactions = { ...parseSafeReactions(m.reactions) };
          if (newEmoji) {
            nextReactions[user?.id] = newEmoji;
          } else {
            delete nextReactions[user?.id];
          }
          return {
            ...m,
            reactions: nextReactions,
            _pendingReaction: isOptimistic ? newEmoji : m._pendingReaction
          };
        }
        return m;
      });
      if (currentUserId && currentSpaceId) {
        setScopedCachedMessages(currentUserId, currentSpaceId, updated);
      }
      return updated;
    });

    // 2. Authoritative Single-Path Delivery:
    // When WebSocket is connected, use the WebSocket reaction command ONLY.
    // Use REST only as a deliberate disconnected fallback to eliminate competing writes.
    if (!isOptimistic) {
      if (wsService.isConnected()) {
        wsService.send({
          type: 'reaction',
          message_id: targetMsg.id,
          temp_id: targetMsg.temp_id || null,
          emoji: newEmoji
        });
      } else {
        if (newEmoji) {
          api.post(`/chat/messages/${targetMsg.id}/react`, { emoji: newEmoji })
            .then(res => {
              if (res?.data?.reactions) {
                const conf = parseSafeReactions(res.data.reactions);
                setMsgs(p => p.map(m => (String(m.id) === String(targetMsg.id) || (m.temp_id && targetMsg.temp_id && String(m.temp_id) === String(targetMsg.temp_id))) ? { ...m, reactions: conf } : m));
              }
            })
            .catch(err => console.warn("REST reaction notice:", err?.message));
        } else {
          api.delete(`/chat/messages/${targetMsg.id}/react`)
            .then(res => {
              if (res?.data?.reactions) {
                const conf = parseSafeReactions(res.data.reactions);
                setMsgs(p => p.map(m => (String(m.id) === String(targetMsg.id) || (m.temp_id && targetMsg.temp_id && String(m.temp_id) === String(targetMsg.temp_id))) ? { ...m, reactions: conf } : m));
              }
            })
            .catch(err => console.warn("REST reaction delete notice:", err?.message));
        }
      }
    }

    setContextMenuMsg(null);
  };

  const handleMsgTouchStart = (e, msg) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    isLongPressTriggered.current = false;
    setSwipingMsgId(msg.id);

    // Deliberate long press (500ms threshold) opens options menu on mobile (CHAT-011)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressTimer.current = setTimeout(() => {
      isLongPressTriggered.current = true;
      setContextMenuMsg({ msg, x: touch.clientX, y: touch.clientY, type: "options" });
    }, 500);
  };

  const handleMsgTouchMove = (e) => {
    if (!swipingMsgId) return;
    const touch = e.touches[0];
    if (!touch) return;
    const diffX = touch.clientX - touchStartX.current;
    const diffY = touch.clientY - touchStartY.current;

    // Movement > 8px in any direction cancels deliberate long press immediately
    if ((Math.abs(diffX) > 8 || Math.abs(diffY) > 8) && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    // Only swipe right if horizontal movement dominates vertical movement (prevent accidental swipe while scrolling)
    if (diffX > 0 && diffX < 80 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      setSwipeOffset(diffX);
    } else if (Math.abs(diffY) > 10) {
      // User is scrolling vertically
      setSwipeOffset(0);
    }
  };

  const handleMsgTouchEnd = (e, msg) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (swipeOffset > 50) {
      setReplyingTo(msg);
    }
    setSwipingMsgId(null);
    setSwipeOffset(0);

    if (isLongPressTriggered.current) {
      // Prevent synthetic click event from firing after touch release
      if (e && typeof e.preventDefault === 'function' && e.cancelable) {
        e.preventDefault();
      }
      setTimeout(() => {
        isLongPressTriggered.current = false;
      }, 350);
    }
  };

  const handleMsgTouchCancel = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setSwipingMsgId(null);
    setSwipeOffset(0);
    isLongPressTriggered.current = false;
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenuMsg({ msg, x: e.clientX, y: e.clientY, type: "options" });
  };

  const lastTapTime = useRef(0);
  const tapTimeout = useRef(null);
  const daysTogether = space?.created_at ? Math.max(1, Math.floor((Date.now() - parseSafeDate(space.created_at).getTime()) / (1000 * 60 * 60 * 24))) : 0;

  // Save requests
  const [saveRequest, setSaveRequest]   = useState(null);
  const [requestingSave, setRequestingSave] = useState(false);

  const bottomRef  = useRef(null);
  const typingTimer = useRef(null);
  const partnerTypingTimer = useRef(null);
  const fileRef    = useRef(null);
  const scrollRef  = useRef(null);
  const inputRef   = useRef(null);

  const handlePartnerTyping = (isTyping) => {
    clearTimeout(partnerTypingTimer.current);
    setTyping(isTyping);
    if (isTyping) {
      partnerTypingTimer.current = setTimeout(() => {
        setTyping(false);
      }, 3000);
    }
  };

  // Prevent body scrolling while in immersive chat (REMOVED to fix black screen bug)

  /* ── data + websocket + auto-sync engine ─────────────────── */
  const syncMessages = async (forcePk = null) => {
    try {
      const sk = safeGetItem('paxly_sk');
      const pk = forcePk || getPartnerPublicKey();
      
      const data = await getMessages(0, 50);
      if (!Array.isArray(data)) {
        setLoadingHistory(false);
        return;
      }
      if (data.length < 50) {
        setHasMore(false);
      }

      const sorted = [...data].sort((a, b) => parseSafeDate(a.timestamp).getTime() - parseSafeDate(b.timestamp).getTime());
      
      setMsgs(prev => {
        const decryptedMsgs = [];
        for (const m of sorted) {
          m.reactions = parseSafeReactions(m.reactions);
          if (m.text && sk && pk) {
            try {
              m.text = decryptMessage(m.text, sk, pk);
            } catch (e) {
              console.warn("Decrypt error in syncMessages:", e);
            }
          }
          decryptedMsgs.push(m);
        }

        const msgMap = new Map();
        decryptedMsgs.forEach(m => msgMap.set(m.id, m));
        
        const now = Date.now();
        prev.forEach(m => {
          const msgTime = parseSafeDate(m.timestamp).getTime();

          if (m.failed) {
            // Retain failed messages so user can see failure and retry
            if (!msgMap.has(m.id)) {
              msgMap.set(m.id, m);
            }
          } else if (m.isOptimistic) {
            // Expire truly stale optimistic messages only after 90 seconds
            if (now - msgTime > 90000) return;

            // Strict check: has this specific message landed in decryptedMsgs?
            const alreadySynced = decryptedMsgs.some(s => {
              if (s.id === m.id) return true;
              if (s.temp_id && (s.temp_id === m.id || s.temp_id === m.temp_id)) return true;
              if (String(s.sender_id) === String(user?.id) && s.message_type === m.message_type) {
                if (s.message_type === 'text' && (s.text === m.text || s.text === m.rawText)) {
                  const diff = Math.abs(parseSafeDate(m.timestamp).getTime() - parseSafeDate(s.timestamp).getTime());
                  return diff < 60000;
                }
              }
              return false;
            });

            // Keep optimistic message on screen until confirmed by exact temp_id/id
            if (!alreadySynced && !msgMap.has(m.id)) {
              msgMap.set(m.id, m);
            }
          } else {
            // Retain older historical messages outside the sync window (loaded via pagination, CHAT-012),
            // or recent confirmed messages (< 2 minutes old) in case server query lag hasn't caught up
            if (!msgMap.has(m.id)) {
              const oldestSyncedTime = decryptedMsgs.length > 0 ? parseSafeDate(decryptedMsgs[0].timestamp).getTime() : 0;
              const isOlderThanSyncWindow = oldestSyncedTime > 0 && msgTime < oldestSyncedTime;
              if (isOlderThanSyncWindow || now - msgTime < 120000) {
                msgMap.set(m.id, m);
              }
            } else {
              // Preserve any pending local reactions or plaintext if server hasn't updated yet
              const serverMsg = msgMap.get(m.id);
              if (m.text && !serverMsg.text) serverMsg.text = m.text;
              if (m.media_url?.startsWith('blob:') || m.media_url?.startsWith('data:')) {
                serverMsg._remoteMediaUrl = serverMsg.media_url;
                serverMsg.media_url = m.media_url;
              }
              
              // Merge reactions: keep server reactions, but also preserve any local reaction from m.reactions
              const mReactions = parseSafeReactions(m.reactions);
              const sReactions = parseSafeReactions(serverMsg.reactions);
              serverMsg.reactions = { ...mReactions, ...sReactions };
              if (m._pendingReaction && !serverMsg.reactions?.[user?.id]) {
                serverMsg.reactions = { ...serverMsg.reactions, [user?.id]: m._pendingReaction };
              }
            }
          }
        });

        const merged = Array.from(msgMap.values()).sort((a, b) => 
          parseSafeDate(a.timestamp).getTime() - parseSafeDate(b.timestamp).getTime()
        );
        
        // Deep compare to prevent unnecessary re-render triggers
        if (
          prev.length === merged.length &&
          prev.every((pMsg, idx) => 
            pMsg.id === merged[idx].id &&
            pMsg.text === merged[idx].text &&
            JSON.stringify(pMsg.reactions || {}) === JSON.stringify(merged[idx].reactions || {})
          )
        ) {
          return prev;
        }

        if (currentUserId && currentSpaceId) {
          setScopedCachedMessages(currentUserId, currentSpaceId, merged);
        }
        return merged;
      });
      setLoadingHistory(false);
    } catch (err) {
      console.warn("syncMessages error:", err);
      setLoadingHistory(false);
    }
  };

  const loadOlderMessages = async () => {
    if (loadingOlderRef.current || !hasMore) return;
    
    // Find the oldest confirmed message currently in state to paginate backward (CHAT-012)
    const confirmed = msgs.filter(m => !m.isOptimistic && !m.failed);
    const oldestMsg = confirmed[0];
    if (!oldestMsg) {
      setHasMore(false);
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setLoadOlderError(null);

    try {
      const sk = safeGetItem('paxly_sk');
      const pk = getPartnerPublicKey();
      
      const scrollEl = scrollRef.current;
      const prevScrollHeight = scrollEl ? scrollEl.scrollHeight : 0;

      // Request next batch of older messages using cursor-based before parameter
      const olderData = await getMessages(0, 50, oldestMsg.id);
      if (!Array.isArray(olderData) || olderData.length === 0) {
        setHasMore(false);
        return;
      }

      if (olderData.length < 50) {
        setHasMore(false);
      }

      const decryptedOlder = [];
      for (const m of olderData) {
        m.reactions = parseSafeReactions(m.reactions);
        if (m.text && sk && pk) {
          try {
            m.text = decryptMessage(m.text, sk, pk);
          } catch (e) {
            console.warn("Decrypt error in loadOlderMessages:", e);
          }
        }
        decryptedOlder.push(m);
      }

      setMsgs(prev => {
        const existingIds = new Set(prev.map(m => m.id));
        const freshOlder = decryptedOlder.filter(m => !existingIds.has(m.id));
        if (freshOlder.length === 0) {
          setHasMore(false);
          return prev;
        }
        const merged = [...freshOlder, ...prev].sort((a, b) => 
          parseSafeDate(a.timestamp).getTime() - parseSafeDate(b.timestamp).getTime()
        );
        return merged;
      });

      // Preserve scroll position: flex-direction: column-reverse preserves anchor automatically.
      requestAnimationFrame(() => {
        if (scrollEl && scrollEl.scrollHeight !== prevScrollHeight) {
          // Additional safety check if needed
        }
      });
    } catch (err) {
      console.error("Failed to load older messages:", err);
      setLoadOlderError("Failed to load older messages. Click to retry.");
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  useEffect(() => {
    const token = safeGetItem('ros_token');
    const cachedSpace = getScopedCachedSpace(currentUserId);
    const immediateSpaceId = space?.id || cachedSpace?.space?.id || user?.couple_space_id;
    if (token && immediateSpaceId && !wsService.isConnected()) {
      wsService.connect(token, immediateSpaceId);
    }

    getSpace()
      .then(d => {
        setPartner(d.partner);
        if (currentUserId && (d.id || currentSpaceId)) {
          setScopedCachedPartner(currentUserId, d.id || currentSpaceId, d.partner);
        }
        setSpace(d.space);
        if (currentUserId) {
          setScopedCachedSpace(currentUserId, d);
        }
        if (token && d?.space?.id) {
          wsService.connect(token, d.space.id);
        }
        syncMessages(d.partner?.public_key);
      })
      .catch(err => {
        console.warn("getSpace failed on mount, attempting direct syncMessages:", err);
        syncMessages();
      });

    // Auto-sync polling every 5 seconds (safety net)
    const syncInterval = setInterval(() => {
      syncMessages();
    }, 5000);

    const onFocusSync = () => syncMessages();
    window.addEventListener('focus', onFocusSync);
    document.addEventListener('visibilitychange', onFocusSync);

    const onScrollCancel = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (tapTimeout.current) {
        clearTimeout(tapTimeout.current);
        tapTimeout.current = null;
      }
    };
    window.addEventListener('scroll', onScrollCancel, { passive: true });

    const offs = [
      wsService.on('connected', () => syncMessages()),
      wsService.on('chat_message', msg => {
        if (String(msg.sender_id) !== String(user?.id)) {
          handlePartnerTyping(false);
        }
        const sk = safeGetItem('paxly_sk');
        const pk = getPartnerPublicKey();
        
        // Ensure msg object has 'id' property (backend sends 'message_id')
        if (msg.message_id && !msg.id) {
          msg.id = msg.message_id;
        }
        msg.reactions = parseSafeReactions(msg.reactions);

        // Cancel any pending REST fallback timers for this message
        if (msg.temp_id && pendingSendsRef.current.has(msg.temp_id)) {
          const pending = pendingSendsRef.current.get(msg.temp_id);
          if (pending?.timer) clearTimeout(pending.timer);
          pendingSendsRef.current.delete(msg.temp_id);
        }
        if (msg.temp_id) {
          wsService.dequeue(msg.temp_id);
        }

        setMsgs(p => {
          const isOwn = String(msg.sender_id) === String(user?.id);
          
          let decryptedText = msg.text;
          if (msg.text && sk && pk) {
            try {
              decryptedText = decryptMessage(msg.text, sk, pk);
            } catch (e) {
              console.warn("Failed to decrypt incoming text:", e);
            }
          }

          // Check if this incoming message matches any optimistic or failed message
          const optIdx = p.findIndex(m => {
            if (!m.isOptimistic && !m.failed) return false;
            // Primary authoritative match: stable temporary ID
            if (msg.temp_id && (m.id === msg.temp_id || m.temp_id === msg.temp_id)) return true;
            if (isOwn) {
              if (m.message_type !== msg.message_type) return false;
              // For audio and video, never do fuzzy diff matching; always require exact temp_id
              if (m.message_type === 'text') {
                if (m.text === decryptedText || m.text === msg.text) {
                  const diff = Math.abs(parseSafeDate(m.timestamp).getTime() - parseSafeDate(msg.timestamp || Date.now()).getTime());
                  return diff < 30000;
                }
              }
            }
            return false;
          });

          if (optIdx !== -1) {
            const newMsgs = [...p];
            const optMsg = newMsgs[optIdx];
            if (optMsg._blobUrl) {
              setTimeout(() => {
                try { URL.revokeObjectURL(optMsg._blobUrl); } catch {}
              }, 5000);
            }
            newMsgs[optIdx] = {
              ...msg,
              temp_id: optMsg.temp_id || msg.temp_id,
              text: optMsg.text || decryptedText, // preserve already decrypted/plaintext
              media_url: (optMsg.media_url?.startsWith('blob:') || optMsg.media_url?.startsWith('data:')) ? optMsg.media_url : (msg.media_url || optMsg.media_url),
              _remoteMediaUrl: msg.media_url,
              reactions: Object.keys(parseSafeReactions(msg.reactions)).length > 0 ? parseSafeReactions(msg.reactions) : parseSafeReactions(optMsg.reactions),
              isOptimistic: false,
              isUploading: false,
              failed: false
            };

            // Deduplicate: remove any other duplicate of msg.id if present
            const deduplicated = newMsgs.filter((m, idx) => idx === optIdx || m.id !== msg.id);

            // If user reacted while message was optimistic, send that reaction to backend with confirmed msg.id
            if (optMsg._pendingReaction) {
              if (wsService.isConnected()) {
                wsService.send({
                  type: 'reaction',
                  message_id: msg.id,
                  emoji: optMsg._pendingReaction
                });
              } else {
                api.post(`/chat/messages/${msg.id}/react`, { emoji: optMsg._pendingReaction }).catch(() => {});
              }
            }

            return deduplicated;
          }

          // If no optimistic match, check if msg.id or non-optimistic temp_id is already present
          if (p.some(m => m.id === msg.id || (msg.temp_id && m.temp_id === msg.temp_id && !m.isOptimistic))) {
            return p;
          }

          const finalMsg = {
            ...msg,
            text: isOwn ? (msg.text || decryptedText) : decryptedText,
            isOptimistic: false,
            failed: false
          };
          return [...p, finalMsg];
        });
      }),
      wsService.on('chat_message_error', d => {
        if (!d?.temp_id) return;
        if (pendingSendsRef.current.has(d.temp_id)) {
          const pending = pendingSendsRef.current.get(d.temp_id);
          if (pending?.timer) clearTimeout(pending.timer);
          pendingSendsRef.current.delete(d.temp_id);
          if (typeof pending?.sendRestFallback === 'function') {
            console.warn("WebSocket send error received, attempting seamless REST fallback for", d.temp_id);
            pending.sendRestFallback();
            return;
          }
        }
        setMsgs(prev => prev.map(m => (m.id === d.temp_id || m.temp_id === d.temp_id) ? { ...m, isOptimistic: false, failed: true } : m));
      }),
      wsService.on('typing', d => { if (d.user_id !== user?.id) handlePartnerTyping(d.is_typing); }),
      wsService.on('presence', d => { if (d.user_id !== user?.id) setPartnerOnline(d.online); }),
      wsService.on('presence_state', d => {
        if (d.user_id !== user?.id) {
          setPartnerPresence(d.state);
          setPartnerMood(d.mood || 'neutral');
          handlePartnerTyping(d.state === 'typing');
        }
      }),
      wsService.on('reaction', d => {
        if (!d || (!d.message_id && !d.temp_id)) return;
        const incomingReactions = parseSafeReactions(d.reactions);
        setMsgs(p => {
          const target = p.find(m => 
            (d.message_id && String(m.id) === String(d.message_id)) || 
            (d.temp_id && (String(m.id) === String(d.temp_id) || String(m.temp_id) === String(d.temp_id))) ||
            (m.temp_id && d.message_id && String(m.temp_id) === String(d.message_id))
          );
          if (!target) return p;

          let nextReactions = { ...parseSafeReactions(target.reactions) };
          if (d.reactions !== undefined && d.reactions !== null) {
            nextReactions = { ...incomingReactions };
          } else if (d.emoji) {
            nextReactions[d.user_id] = d.emoji;
          } else {
            delete nextReactions[d.user_id];
          }

          // Avoid re-renders if reaction state is already identical (e.g. from local optimistic reaction)
          const curr = parseSafeReactions(target.reactions);
          const nextKeys = Object.keys(nextReactions);
          const currKeys = Object.keys(curr);
          if (
            nextKeys.length === currKeys.length &&
            nextKeys.every(k => nextReactions[k] === curr[k])
          ) {
            return p;
          }

          const updated = p.map(m => (
            m === target || 
            (d.message_id && String(m.id) === String(d.message_id)) || 
            (d.temp_id && (String(m.id) === String(d.temp_id) || String(m.temp_id) === String(d.temp_id))) ||
            (m.temp_id && d.message_id && String(m.temp_id) === String(d.message_id))
          ) ? { ...m, reactions: nextReactions } : m);
          if (currentUserId && currentSpaceId) {
            setScopedCachedMessages(currentUserId, currentSpaceId, updated);
          }
          return updated;
        });
      }),
      wsService.on('message_deleted', d => {
        if (!d || !d.message_id) return;
        setMsgs(p => p.filter(m => String(m.id) !== String(d.message_id) && (!m.temp_id || String(m.temp_id) !== String(d.message_id))));
      }),
      wsService.on('message_edited', d => {
        if (!d || !d.message_id) return;
        const sk = safeGetItem('paxly_sk');
        const pk = getPartnerPublicKey();
        let newText = d.text;
        if (newText && sk && pk) {
          try {
            newText = decryptMessage(newText, sk, pk);
          } catch (e) {
            console.error('Failed to decrypt edited message:', e);
          }
        }
        setMsgs(p => p.map(m => {
          if (String(m.id) !== String(d.message_id) && (!m.temp_id || String(m.temp_id) !== String(d.message_id))) return m;
          return {
            ...m,
            text: newText,
            is_edited: true,
            edited_at: d.edited_at || new Date().toISOString()
          };
        }));
      }),
      wsService.on('media_save_request', d => {
        if (d.sender_id !== user?.id)
          setSaveRequest({ from: partner?.name || 'Partner', ...d });
      }),
      wsService.on('media_save_response', async d => {
        setRequestingSave(false);
        if (!d || !d.allowed) {
          alert('Save request denied by partner.');
          return;
        }

        try {
          const targetMsg = (pendingSaveMsgRef.current && (String(pendingSaveMsgRef.current.id) === String(d.message_id) || !d.message_id))
            ? pendingSaveMsgRef.current
            : msgs.find(m => String(m.id) === String(d.message_id));

          const rawUrl = d.media_url || targetMsg?.media_url;
          if (!rawUrl) {
            alert('Failed to save media: Media URL not found.');
            return;
          }

          const token = safeGetItem('ros_token');
          const headers = token ? { Authorization: `Bearer ${token}` } : {};
          const res = await fetch(fixUrl(rawUrl), { headers });
          if (!res.ok) {
            throw new Error(`Download failed with status ${res.status}`);
          }
          let blob = await res.blob();

          let encryptionKey = null;
          if (targetMsg?.text && targetMsg.text.startsWith('E2EE_KEY:')) {
            encryptionKey = targetMsg.text.substring(9);
          }
          if (encryptionKey) {
            blob = await decryptMediaBlob(blob, encryptionKey);
          }

          let ext = 'bin';
          const mime = blob.type || '';
          if (mime.includes('image/png')) ext = 'png';
          else if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = 'jpg';
          else if (mime.includes('image/webp')) ext = 'webp';
          else if (mime.includes('image/gif')) ext = 'gif';
          else if (mime.includes('video/mp4')) ext = 'mp4';
          else if (mime.includes('video/webm')) ext = 'webm';
          else if (mime.includes('audio/webm') || mime.includes('audio/ogg')) ext = 'webm';
          else if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) ext = 'm4a';
          else if (targetMsg?.message_type === 'image') ext = 'jpg';
          else if (targetMsg?.message_type === 'video') ext = 'mp4';
          else if (targetMsg?.message_type === 'audio') ext = 'webm';

          const objectUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = objectUrl;
          a.download = `vlynxly_${Date.now()}.${ext}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
        } catch (err) {
          console.error('Approved media download failed:', err);
          alert(`Failed to save media: ${err.message || 'Decryption error'}`);
        }
      }),
      wsService.on('capture_detected', d => {
        if (d.from_id !== user?.id) {
          const typeStr = d.capture_type === 'screenshot' ? 'took a screenshot' 
            : d.capture_type === 'tab_switched' ? 'switched apps/tabs' 
            : d.capture_type === 'window_blurred' ? 'opened another app over the screen'
            : 'pointed a camera at the screen';
          alert(`🚨 SECURITY ALERT: ${d.from || 'Partner'} ${typeStr} while viewing your secure media! The media has been destroyed.`);
        }
      }),
    ];
    return () => {
      clearInterval(syncInterval);
      if (tapTimeout.current) clearTimeout(tapTimeout.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      window.removeEventListener('focus', onFocusSync);
      document.removeEventListener('visibilitychange', onFocusSync);
      window.removeEventListener('scroll', onScrollCancel);
      offs.forEach(f => f());
    };
  }, [user?.id]);

  /* ── sync local cache ─────────────────────────────────────── */
  useEffect(() => {
    if (currentUserId && currentSpaceId) {
      setScopedCachedMessages(currentUserId, currentSpaceId, msgs);
    }
  }, [msgs, currentUserId, currentSpaceId]);

  useEffect(() => {
    if (currentUserId && currentSpaceId) {
      setScopedChatDraft(currentUserId, currentSpaceId, text);
    }
  }, [text, currentUserId, currentSpaceId]);

  /* ── auto scroll ──────────────────────────────────────────── */
  const prevMsgsLength = useRef(0);
  const isInitialLoad = useRef(true);

  useEffect(() => {
    // Only scroll if message count increased (new message arrived or sent)
    if (msgs.length > prevMsgsLength.current) {
      bottomRef.current?.scrollIntoView({ behavior: isInitialLoad.current ? 'auto' : 'smooth' });
      isInitialLoad.current = false;
    }
    prevMsgsLength.current = msgs.length;
  }, [msgs.length]);

  /* ── self presence ────────────────────────────────────────── */
  useEffect(() => {
    const pulse = st => wsService.send({ type: 'presence_state', state: st, mood: selfMood });
    const onFocus = () => pulse('peeking');
    const onBlur  = () => pulse('idle');
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    pulse('peeking');
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); pulse('idle'); };
  }, [selfMood]);

  useEffect(() => {
    wsService.send({ type: 'presence_state', state: viewingSecureMsg ? 'watching' : 'peeking', mood: selfMood });
  }, [viewingSecureMsg]);

  /* ── iOS viewport fix: resize when keyboard appears ─────── */
  useEffect(() => {
    const onResize = () => {
      // Force repaint on iOS when keyboard opens/closes
      if (scrollRef.current) {
        scrollRef.current.style.maxHeight = '';
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      }
    };
    // window.visualViewport?.addEventListener('resize', onResize);
    // window.visualViewport?.addEventListener('scroll', onResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, []);

  /* ── handlers ─────────────────────────────────────────────── */
  const handleType = e => {
    setText(e.target.value);
    wsService.send({ type: 'presence_state', state: e.target.value ? 'typing' : 'peeking', mood: selfMood });
    wsService.sendTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      wsService.sendTyping(false);
      wsService.send({ type: 'presence_state', state: 'peeking', mood: selfMood });
    }, 1500);
  };

  const send = async () => {
    if (!text.trim() || sending) return;

    if (editingMsg) {
      const rawText = text.trim();
      const targetId = editingMsg.id;
      setSending(true);

      const sk = safeGetItem('paxly_sk');
      const pk = getPartnerPublicKey();
      let payloadText = rawText;
      if (sk && pk) {
        payloadText = encryptMessage(rawText, sk, pk);
      }

      // Optimistic update in UI
      setMsgs(p => p.map(m => m.id === targetId ? { ...m, text: rawText, is_edited: true, edited_at: new Date().toISOString() } : m));
      setEditingMsg(null);
      setText('');
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }

      if (wsService.isConnected()) {
        wsService.send({
          type: 'message_edit',
          message_id: targetId,
          text: payloadText
        });
      }

      try {
        await api.patch(`/chat/messages/${targetId}`, { text: payloadText });
      } catch (err) {
        console.error("Failed to edit message:", err);
        alert("Failed to edit message: " + (err.response?.data?.detail || err.message));
        syncMessages();
      } finally {
        setSending(false);
      }
      return;
    }

    // Reset typing state on sender side
    clearTimeout(typingTimer.current);
    wsService.sendTyping(false);
    wsService.send({ type: 'presence_state', state: 'peeking', mood: selfMood });
    
    const rawText = text.trim();
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tempMsg = {
      id: tempId,
      temp_id: tempId,
      sender_id: user?.id,
      text: rawText,
      message_type: 'text',
      reply_to_id: replyingTo?.id || null,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      failed: false,
      reactions: {}
    };

    // Instant UI Update
    setText('');
    setReplyingTo(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
    setMsgs(p => [...p, tempMsg]);

    const sk = safeGetItem('paxly_sk');
    const pk = getPartnerPublicKey();
    let payloadText = rawText;
    if (sk && pk) {
       payloadText = encryptMessage(rawText, sk, pk);
    }

    let delivered = false;
    const sendViaRest = () => {
      if (delivered) return;
      delivered = true;
      pendingSendsRef.current.delete(tempId);
      api.post('/chat/messages', {
        text: payloadText,
        message_type: 'text',
        reply_to_id: replyingTo?.id || null,
        temp_id: tempId
      }).then(res => {
        wsService.dequeue(tempId);
        setMsgs(prev => {
          const exists = prev.some(m => m.id === res.data.id || (m.temp_id === tempId && !m.isOptimistic && !m.failed));
          if (exists) {
            return prev.filter(m => m.id !== tempId);
          }
          return prev.map(m => (m.id === tempId || m.temp_id === tempId ? { ...res.data, temp_id: tempId, text: rawText, isOptimistic: false, failed: false } : m));
        });
      }).catch(err => {
        console.error("REST message delivery fallback error:", err);
        setMsgs(prev => prev.map(m => (m.id === tempId || m.temp_id === tempId) ? { ...m, isOptimistic: false, failed: true } : m));
      });
    };

    if (wsService.isConnected()) {
      wsService.sendMessage(payloadText, 'text', null, false, 1, replyingTo?.id, tempId);
      // Safety net: if WebSocket confirmation does not arrive within 3.5s, fallback to REST
      const fallbackTimer = setTimeout(() => {
        setMsgs(current => {
          const opt = current.find(m => (m.id === tempId || m.temp_id === tempId) && m.isOptimistic);
          if (opt && !delivered && pendingSendsRef.current.has(tempId)) {
            console.warn("⚠️ WebSocket send unconfirmed after 3.5s, sending REST fallback for", tempId);
            sendViaRest();
          }
          return current;
        });
      }, 3500);
      pendingSendsRef.current.set(tempId, { timer: fallbackTimer, sendRestFallback: sendViaRest });
    } else {
      sendViaRest();
      // Try to re-establish WebSocket connection immediately
      const token = safeGetItem('ros_token');
      const cachedSpace = getScopedCachedSpace(currentUserId);
      const spaceId = space?.id || cachedSpace?.space?.id || user?.couple_space_id;
      if (token && spaceId) {
        wsService.connect(token, spaceId);
      }
    }
  };

  const retryMessage = (msg) => {
    if (!msg) return;
    const targetTempId = msg.temp_id || msg.id;

    if (msg.message_type === 'audio' && (msg._audioBlob || (msg.media_url && msg.media_url.startsWith('blob:')))) {
      const blob = msg._audioBlob;
      if (blob) {
        setMsgs(prev => prev.filter(m => m.id !== targetTempId && m.temp_id !== targetTempId));
        sendVoiceNote(blob);
        return;
      }
    }

    setMsgs(prev => prev.map(m => (m.id === targetTempId || m.temp_id === targetTempId) ? { ...m, isOptimistic: true, failed: false } : m));

    const sk = safeGetItem('paxly_sk');
    const pk = getPartnerPublicKey();
    let payloadText = msg.text || '';
    if (sk && pk && !payloadText.startsWith('E2EE_KEY:')) {
      try {
        payloadText = encryptMessage(payloadText, sk, pk);
      } catch {}
    }

    if (wsService.isConnected()) {
      wsService.sendMessage(payloadText, msg.message_type || 'text', msg.media_url || null, msg.is_once_view || false, msg.view_limit || 1, msg.reply_to_id || null, targetTempId);
      const fallbackTimer = setTimeout(() => {
        setMsgs(current => {
          const opt = current.find(m => (m.id === targetTempId || m.temp_id === targetTempId) && m.isOptimistic);
          if (opt && pendingSendsRef.current.has(targetTempId)) {
            pendingSendsRef.current.delete(targetTempId);
            api.post('/chat/messages', {
              text: payloadText,
              message_type: msg.message_type || 'text',
              media_url: msg.media_url || null,
              is_once_view: msg.is_once_view || false,
              view_limit: msg.view_limit || 1,
              reply_to_id: msg.reply_to_id || null,
              temp_id: targetTempId
            }).then(res => {
              wsService.dequeue(targetTempId);
              setMsgs(prev => prev.map(m => (m.id === targetTempId || m.temp_id === targetTempId) ? { ...res.data, temp_id: targetTempId, isOptimistic: false, failed: false } : m));
            }).catch(() => {
              setMsgs(prev => prev.map(m => (m.id === targetTempId || m.temp_id === targetTempId) ? { ...m, isOptimistic: false, failed: true } : m));
            });
          }
          return current;
        });
      }, 3500);
      pendingSendsRef.current.set(targetTempId, { timer: fallbackTimer });
    } else {
      api.post('/chat/messages', {
        text: payloadText,
        message_type: msg.message_type || 'text',
        media_url: msg.media_url || null,
        is_once_view: msg.is_once_view || false,
        view_limit: msg.view_limit || 1,
        reply_to_id: msg.reply_to_id || null,
        temp_id: targetTempId
      }).then(res => {
        wsService.dequeue(targetTempId);
        setMsgs(prev => prev.map(m => (m.id === targetTempId || m.temp_id === targetTempId) ? { ...res.data, temp_id: targetTempId, isOptimistic: false, failed: false } : m));
      }).catch(err => {
        setMsgs(prev => prev.map(m => (m.id === targetTempId || m.temp_id === targetTempId) ? { ...m, isOptimistic: false, failed: true } : m));
      });
    }
  };

  const onFileSelect = e => {
    const file = e.target.files[0];
    if (!file) return;

    // Premium Check: File Size limits
    const limitMB = user?.is_premium ? 50 : 5;
    if (file.size > limitMB * 1024 * 1024) {
      if (!user?.is_premium && file.size <= 50 * 1024 * 1024) {
        alert(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB).\n\nFree users are limited to 5MB.\n💎 Upgrade to Premium for 50MB High-Fidelity uploads!`);
      } else {
        alert(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). The limit is ${limitMB}MB.`);
      }
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setPendingFile(file);
    setShowingStudio(true); // Open Studio for preview instead of popup
  };

  const sendVoiceNote = async (blob) => {
    if (!blob) return;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const localAudioUrl = URL.createObjectURL(blob);
    const replyTargetId = replyingTo?.id || null;

    // Instant optimistic update with playable local audio URL
    const tempMsg = {
      id: tempId,
      temp_id: tempId,
      sender_id: user?.id,
      text: '',
      message_type: 'audio',
      media_url: localAudioUrl,
      _blobUrl: localAudioUrl,
      _audioBlob: blob,
      reply_to_id: replyTargetId,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      isUploading: true,
      failed: false,
      reactions: {}
    };
    setMsgs(p => [...p, tempMsg]);
    setReplyingTo(null);

    try {
      const { encryptedBlob, symmetricKey } = await encryptMediaBlob(blob);
      const file = new File([encryptedBlob], 'voice_note.webm', { type: 'audio/webm' });
      const { media_url } = await uploadMedia(file);

      const sk = safeGetItem('paxly_sk');
      const pk = getPartnerPublicKey();
      let rawKeyText = `E2EE_KEY:${symmetricKey}`;
      let payloadText = rawKeyText;
      if (sk && pk) {
        payloadText = encryptMessage(rawKeyText, sk, pk);
      }

      setMsgs(prev => prev.map(m => (m.id === tempId || m.temp_id === tempId) ? { ...m, text: rawKeyText, isUploading: false } : m));

      let voiceDelivered = false;
      const sendVoiceViaRest = () => {
        if (voiceDelivered) return;
        voiceDelivered = true;
        pendingSendsRef.current.delete(tempId);
        api.post('/chat/messages', {
          text: payloadText,
          message_type: 'audio',
          media_url: media_url,
          is_once_view: false,
          view_limit: 0,
          reply_to_id: replyTargetId,
          temp_id: tempId
        }).then(res => {
          wsService.dequeue(tempId);
          setTimeout(() => { try { URL.revokeObjectURL(localAudioUrl); } catch {} }, 5000);
          setMsgs(prev => {
            const exists = prev.some(m => m.id === res.data.id || (m.temp_id === tempId && !m.isOptimistic && !m.failed));
            if (exists) {
              return prev.filter(m => m.id !== tempId);
            }
            return prev.map(m => (m.id === tempId || m.temp_id === tempId ? {
              ...res.data,
              temp_id: tempId,
              text: rawKeyText,
              media_url: res.data.media_url || media_url,
              isOptimistic: false,
              failed: false
            } : m));
          });
        }).catch(err => {
          console.error("REST voice delivery fallback error:", err);
          setMsgs(prev => prev.map(m => (m.id === tempId || m.temp_id === tempId) ? { ...m, isOptimistic: false, failed: true, isUploading: false } : m));
        });
      };

      if (wsService.isConnected()) {
        wsService.sendMessage(payloadText, 'audio', media_url, false, 0, replyTargetId, tempId);
        const fallbackTimer = setTimeout(() => {
          setMsgs(current => {
            const opt = current.find(m => (m.id === tempId || m.temp_id === tempId) && m.isOptimistic);
            if (opt && !voiceDelivered && pendingSendsRef.current.has(tempId)) {
              console.warn("⚠️ WebSocket voice send unconfirmed after 4s, sending REST fallback for", tempId);
              sendVoiceViaRest();
            }
            return current;
          });
        }, 4000);
        pendingSendsRef.current.set(tempId, { timer: fallbackTimer, sendRestFallback: sendVoiceViaRest });
      } else {
        sendVoiceViaRest();
      }
    } catch (err) {
      console.error("Failed to encrypt or upload voice note:", err);
      setMsgs(prev => prev.map(m => (m.id === tempId || m.temp_id === tempId) ? { ...m, isOptimistic: false, failed: true, isUploading: false } : m));
    }
  };

  const startVoiceRecord = async (e) => {
    if (e?.touches?.[0]) {
      recordStartY.current = e.touches[0].clientY;
      recordStartX.current = e.touches[0].clientX;
    } else if (e?.clientY) {
      recordStartY.current = e.clientY;
      recordStartX.current = e.clientX;
    }
    
    try {
      voiceRecordAction.current = 'send';
      const stream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = ev => audioChunks.current.push(ev.data);
      
      recorder.onstop = async () => {
        clearInterval(recordInterval.current);
        const action = voiceRecordAction.current;
        if (action === 'cancel') {
          audioChunks.current = [];
          setRecordTime(0);
          setRecordState('idle');
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        if (audioChunks.current.length > 0) {
          const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
          if (action === 'preview') {
            setAudioPreviewBlob(blob);
            setAudioPreviewUrl(URL.createObjectURL(blob));
            setRecordState('preview');
          } else if (action === 'send') {
            setRecordState('idle');
            sendVoiceNote(blob);
          }
        } else {
          setRecordState('idle');
        }
        stream.getTracks().forEach(t => t.stop());
        setRecordTime(0);
        audioChunks.current = []; 
      };
      
      recorder.start();
      setAudioRecorder(recorder);
      setRecordState('holding');
      setRecordTime(0);
      recordInterval.current = setInterval(() => setRecordTime(p => p + 1), 1000);
    } catch (err) { console.error('Audio recording failed', err); }
  };

  const handleRecordMove = (e) => {
    if (recordState !== 'holding') return;
    const clientY = e?.touches?.[0]?.clientY || e.clientY;
    const clientX = e?.touches?.[0]?.clientX || e.clientX;
    if (!clientY || !clientX) return;
    
    if (recordStartY.current - clientY > 40) {
      setRecordState('locked'); 
    } else if (recordStartX.current - clientX > 50) {
      cancelVoiceRecord();
    }
  };

  const stopVoiceRecord = () => {
    if (recordState === 'holding' && audioRecorder && audioRecorder.state !== 'inactive') {
      voiceRecordAction.current = 'send';
      audioRecorder.stop(); 
    }
  };

  const cancelVoiceRecord = () => {
    voiceRecordAction.current = 'cancel';
    if (audioRecorder && audioRecorder.state !== 'inactive') {
      audioRecorder.stop();
    } else if (recordState === 'preview') {
      setRecordState('idle');
      setAudioPreviewBlob(null);
      setAudioPreviewUrl(null);
    }
  };
  
  const previewLockedVoiceRecord = () => {
    if (recordState === 'locked' && audioRecorder && audioRecorder.state !== 'inactive') {
      voiceRecordAction.current = 'preview';
      audioRecorder.stop();
    }
  };

  const sendPreviewVoiceRecord = () => {
    if (!audioPreviewBlob) return;
    const blob = audioPreviewBlob;
    setAudioPreviewBlob(null);
    setAudioPreviewUrl(null);
    setRecordState('idle');
    sendVoiceNote(blob);
  };

  const sendLockedVoiceRecord = () => {
    if (recordState === 'locked' && audioRecorder && audioRecorder.state !== 'inactive') {
      voiceRecordAction.current = 'send';
      audioRecorder.stop(); 
    } else if (recordState === 'preview') {
      sendPreviewVoiceRecord();
    }
  };

const formatRecordTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

const compressImageForChat = async (file, maxWidth = 1920, maxHeight = 1920, quality = 0.85) => {
  if (!file || !file.type?.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') {
    return file;
  }
  return new Promise((resolve) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          if (width / maxWidth > height / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
            } else {
              const compressedFile = new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' });
              resolve(compressedFile);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    } catch {
      resolve(file);
    }
  });
};

  const sendMedia = async (fileToUse, mode = 'standard') => {
    let f = fileToUse || pendingFile;
    setShowingStudio(false);
    setPendingFile(null);
    if (!f) return;
    
    if (!wsService.ws || wsService.ws.readyState !== WebSocket.OPEN) {
      alert("Chat is reconnecting... Cannot send media right now.");
      return;
    }

    setSending(true);
    setShowGallerySecureModal(false);

    // Fast client-side image optimization so photos send snappy (<0.5s upload)
    if (f.type?.startsWith('image/')) {
      try {
        f = await compressImageForChat(f);
      } catch (e) {
        console.warn("Image compression skipped:", e);
      }
    }
    
    // OPTIMISTIC UPDATE
    const objectUrl = URL.createObjectURL(f);
    const isVideo = f.type?.startsWith('video');
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tempMsg = {
      id: tempId,
      temp_id: tempId,
      sender_id: user?.id,
      text: '',
      message_type: isVideo ? 'video' : 'image',
      media_url: objectUrl,
      _blobUrl: objectUrl,
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      isUploading: true,
      reactions: {}
    };
    setMsgs(p => [...p, tempMsg]);

    try {
      const isVid = f.type?.startsWith('video');
      const ext = isVid ? 'mp4' : 'jpg';
      const { encryptedBlob, symmetricKey } = await encryptMediaBlob(f);
      const { media_url } = await uploadMedia(encryptedBlob, `media.${ext}`);
      const isOnceView = mode !== 'standard' && mode !== 'permanent';
      const limit      = mode === 'twice' ? 2 : 1;
      let finalUrl     = media_url;
      if (media_url?.includes('localhost') || media_url?.includes('127.0.0.1')) {
        try { finalUrl = (import.meta.env.VITE_API_URL || '') + new URL(media_url).pathname; } catch {}
      } else if (media_url?.startsWith('/')) {
        finalUrl = (import.meta.env.VITE_API_URL || '') + media_url;
      }
      const type = isVid ? 'video' : 'image';
      
      const sk = safeGetItem('paxly_sk');
      const pk = getPartnerPublicKey();
      let payloadText = `E2EE_KEY:${symmetricKey}`;
      if (sk && pk) {
         payloadText = encryptMessage(payloadText, sk, pk);
      }

      let mediaDelivered = false;
      const sendMediaViaRest = () => {
        if (mediaDelivered) return;
        mediaDelivered = true;
        pendingSendsRef.current.delete(tempMsg.id);
        api.post('/chat/messages', {
          text: payloadText,
          message_type: type,
          media_url: finalUrl,
          is_once_view: isOnceView,
          view_limit: limit,
          reply_to_id: replyingTo?.id || null,
          temp_id: tempMsg.id
        }).then(res => {
          wsService.dequeue(tempMsg.id);
          setMsgs(prev => {
            const exists = prev.some(m => m.id === res.data.id || (m.temp_id === tempMsg.id && !m.isOptimistic && !m.failed));
            if (exists) {
              return prev.filter(m => m.id !== tempMsg.id);
            }
            return prev.map(m => (m.id === tempMsg.id || m.temp_id === tempMsg.id ? { 
              ...res.data, 
              temp_id: tempMsg.id, 
              isOptimistic: false, 
              isUploading: false,
              failed: false, 
              media_url: (tempMsg.media_url?.startsWith('blob:') || tempMsg.media_url?.startsWith('data:')) ? tempMsg.media_url : res.data.media_url,
              _remoteMediaUrl: res.data.media_url 
            } : m));
          });
        }).catch(e => {
          console.error("REST media save error:", e);
          setMsgs(prev => prev.map(m => (m.id === tempMsg.id || m.temp_id === tempMsg.id) ? { ...m, isOptimistic: false, failed: true } : m));
        });
      };

      if (wsService.isConnected()) {
        wsService.sendMessage(payloadText, type, finalUrl, isOnceView, limit, replyingTo?.id, tempMsg.id);
        const fallbackTimer = setTimeout(() => {
          setMsgs(current => {
            const opt = current.find(m => (m.id === tempMsg.id || m.temp_id === tempMsg.id) && m.isOptimistic);
            if (opt && !mediaDelivered && pendingSendsRef.current.has(tempMsg.id)) {
              console.warn("⚠️ WebSocket media send unconfirmed after 4s, sending REST fallback for", tempMsg.id);
              sendMediaViaRest();
            }
            return current;
          });
        }, 4000);
        pendingSendsRef.current.set(tempMsg.id, { timer: fallbackTimer, sendRestFallback: sendMediaViaRest });
      } else {
        sendMediaViaRest();
      }
      setReplyingTo(null);
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.detail || err.message));
      setMsgs(p => p.filter(m => m.id !== tempMsg.id));
    } finally {
      setSending(false);
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSecureView = msg => {
    if (msg.sender_id === user?.id || msg.views_used >= msg.view_limit) return;
    setSecureMediaOpen(msg);
  };

  const onSecurityEvent = async action => {
    if (!viewingSecureMsg) return;
    try {
      await api.post(`/chat/messages/${viewingSecureMsg.id}/secure-event?action=${action}`);
      if (action === 'view')
        setMsgs(p => p.map(m => m.id === viewingSecureMsg.id ? { ...m, views_used: m.views_used + 1 } : m));
      else if (action === 'compromise')
        setMsgs(p => p.map(m => m.id === viewingSecureMsg.id ? { ...m, is_compromised: true, media_url: null } : m));
    } catch (err) { console.error(err); }
  };

  const updateTheme = async id => {
    // Optimistic update — change instantly in UI
    setSpace(p => ({ ...p, theme_id: id, chat_wallpaper: null }));
    // Also persist to scoped cache so it survives refresh
    try {
      if (currentUserId) {
        const cached = getScopedCachedSpace(currentUserId) || {};
        cached.space = { ...(cached.space || {}), theme_id: id, chat_wallpaper: null };
        setScopedCachedSpace(currentUserId, cached);
      }
    } catch {}
    // Save to server (best-effort)
    try {
      await api.patch('/chat/space/theme', { theme_id: id });
    } catch (err) {
      console.warn('Theme save to server failed (UI already updated):', err?.response?.data || err.message);
    }
  };
  const updateWallpaper = url => setSpace(p => ({ ...p, theme_id: 'custom', chat_wallpaper: url }));

  const downloadMediaDirect = async (msg) => {
    try {
      const rawUrl = msg.media_url;
      if (!rawUrl) return;
      const token = safeGetItem('ros_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(fixUrl(rawUrl), { headers });
      if (!res.ok) throw new Error(`Download failed with status ${res.status}`);
      let blob = await res.blob();
      let encryptionKey = null;
      if (msg.text && msg.text.startsWith('E2EE_KEY:')) {
        encryptionKey = msg.text.substring(9);
      }
      if (encryptionKey) {
        blob = await decryptMediaBlob(blob, encryptionKey);
      }
      let ext = 'bin';
      const mime = blob.type || '';
      if (mime.includes('image/png')) ext = 'png';
      else if (mime.includes('image/jpeg') || mime.includes('image/jpg')) ext = 'jpg';
      else if (mime.includes('image/webp')) ext = 'webp';
      else if (mime.includes('image/gif')) ext = 'gif';
      else if (mime.includes('video/mp4')) ext = 'mp4';
      else if (mime.includes('video/webm')) ext = 'webm';
      else if (mime.includes('audio/webm') || mime.includes('audio/ogg')) ext = 'webm';
      else if (mime.includes('audio/mp4') || mime.includes('audio/m4a')) ext = 'm4a';
      else if (msg.message_type === 'image') ext = 'jpg';
      else if (msg.message_type === 'video') ext = 'mp4';
      else if (msg.message_type === 'audio') ext = 'webm';

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `vlynxly_${Date.now()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
    } catch (err) {
      console.error('Direct media download failed:', err);
      alert(`Failed to download media: ${err.message || 'Decryption error'}`);
    }
  };

  const requestSave = msg => {
    if (msg.sender_id === user?.id) return;
    pendingSaveMsgRef.current = msg;
    setRequestingSave(true);
    wsService.sendMediaSaveRequest(msg.media_url, msg.id);
  };
  const respondSave = allowed => {
    if (!saveRequest) return;
    wsService.sendMediaSaveResponse(saveRequest.sender_id, allowed, saveRequest.message_id, saveRequest.media_url);
    setSaveRequest(null);
  };

  const isMe      = m => m.sender_id === user?.id;
  const ts        = m => {
    if (!m?.timestamp) return '';
    try {
      return format(parseSafeDate(m.timestamp), 'h:mm a');
    } catch {
      return '';
    }
  };


  const activeThemeId = space?.theme_id || 'classic';
  const activeTheme   = CHAT_THEMES[activeThemeId] || CHAT_THEMES.classic;

  /* ── render ───────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        /* ── Reset ── */
        *, *::before, *::after { box-sizing: border-box; }

        /* ── Scrollbar hide ── */
        .chat-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        .chat-scroll::-webkit-scrollbar { display: none; }

        /* ── Animations ── */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0) scale(0.6); opacity: 0.35; }
          30%           { transform: translateY(-5px) scale(1); opacity: 1;   }
        }
        @keyframes floatHeart {
          0% { transform: scale(0.5) translateY(0); opacity: 0; }
          20% { transform: scale(1.5) translateY(-20px); opacity: 1; }
          80% { transform: scale(1.2) translateY(-40px); opacity: 1; }
          100% { transform: scale(1) translateY(-60px); opacity: 0; }
        }
        @keyframes audioWave {
          0%, 100% { transform: scaleY(0.2); }
          50%      { transform: scaleY(1); }
        }
        @keyframes slideUpFade {
          0% { transform: translateY(5px); opacity: 0; }
          50% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-5px); opacity: 0; }
        }
        @keyframes recPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,90,60,0.5); }
          50%     { box-shadow: 0 0 0 8px rgba(255,90,60,0);  }
        }
        @keyframes popIn {
          0% { transform: scale(0.6); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .chat-msg { animation: fadeInUp 0.22s ease-out both; }
        .rec-btn  { animation: recPulse 1s ease-in-out infinite; }

        /* ── Chat outer wrapper ── */
        .chat-root {
          width: 100%;
          height: 100%;
          position: fixed; inset: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #111;
          z-index: 100;
        }

        /* ── Header ── */
        .chat-header {
          position: fixed;
          top: env(safe-area-inset-top, 0px);
          left: 0;
          right: 0;
          z-index: 100;
          margin: 25px 16px 0;
          background: rgba(255,255,255,0.04);
          backdrop-filter: blur(32px) saturate(180%);
          -webkit-backdrop-filter: blur(32px) saturate(180%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          padding: 10px 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07);
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 58px;
          width: calc(100% - 32px);
          transition: box-shadow 0.3s ease, background 0.3s ease;
        }
        .chat-header:hover {
          background: rgba(255,255,255,0.07);
          box-shadow: 0 12px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,169,110,0.15), inset 0 1px 0 rgba(255,255,255,0.1);
        }

        /* ── Messages scroll area ── */
        .chat-scroll {
          position: fixed; inset: 0; display: flex; flex-direction: column-reverse; justify-content: flex-start;
          min-height: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          padding: 95px 12px 90px;
          z-index: 1;
        }

        /* ── Input bar ── */
        .chat-input-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          padding: 8px 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .chat-input-inner {
          display: flex;
          gap: 6px;
          align-items: center;
          background: rgba(26, 20, 18, 0.55);
          backdrop-filter: blur(28px) saturate(200%);
          -webkit-backdrop-filter: blur(28px) saturate(200%);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 26px;
          padding: 7px 7px 7px 12px;
          box-shadow: 0 6px 24px rgba(0,0,0,0.4);
          width: 100%;
        }
        .chat-input-inner textarea {
          flex: 1; display: flex; flex-direction: column;
          background: transparent;
          border: none;
          outline: none;
          font-size: 0.97rem;
          color: #fff;
          padding: 8px 0;
          min-width: 0;
          font-family: inherit;
          /* prevent iOS auto-zoom on focus (font-size must be >= 16px to avoid zoom) */
          font-size: 16px;
          max-height: 120px;
        }
        .chat-input-inner textarea::placeholder { color: rgba(255,255,255,0.35); }

        /* icon buttons in input */
        .chat-icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          /* minimum 44px tap target */
          min-width: 40px;
          min-height: 40px;
          border-radius: 50%;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
        }

        /* send/mic round button */
        .chat-send-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: transform 0.18s, background 0.18s, box-shadow 0.18s;
          -webkit-tap-highlight-color: transparent;
        }

        /* ── Call icon hover ── */
        .chat-icon-btn:hover {
          background: 
gba(255,255,255,0.06), var(--theme-accent) 15%, transparent);
          transform: scale(1.12);
        }
        .chat-icon-btn {
          transition: background 0.2s ease, transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
        }
        .chat-header:hover .chat-icon-btn {
          color: var(--theme-accent);
        }
        .chat-bubble {
          border-radius: 20px;
          overflow: hidden;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          word-break: break-word;
        }

        /* ── PC-specific tweaks ── */
        @media (min-width: 768px) {
          .chat-input-bar { padding: 12px 24px 24px; }
          .chat-scroll { padding: 105px 24px 100px; }
          .chat-bubble { max-width: 65%; }
        }

        /* ── Mobile tweaks ── */
        @media (max-width: 767px) {
          .chat-input-bar { padding: 5px 8px 8px; }
          .chat-bubble { max-width: 80%; }
          .chat-input-inner textarea { font-size: 16px; } /* prevent iOS zoom */
        }

        /* ── Modal ── */
        .chat-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.88);
          z-index: 400;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }
        .chat-modal-card {
          max-width: 340px;
          width: 100%;
          text-align: center;
          background: #1a1614;
          padding: 28px 24px;
          border-radius: 22px;
          box-shadow: 0 20px 48px rgba(0,0,0,0.6);
        }
      `}</style>

      {/* ── ROOT ────────────────────────────────────────────── */}
      <div
        className="chat-root"
        style={{
          '--theme-accent': activeTheme.accent || '#C9A96E',
          '--theme-bubble-me': activeTheme.bubbleMe || '#C9A96E',
          '--theme-text-me': activeTheme.textMe || '#111',
          '--theme-bubble-other': activeTheme.bubbleOther || 'rgba(255,255,255,0.07)',
          '--theme-text-other': activeTheme.textOther || '#fff',
        }}
      >

        {/* ── BACKGROUND ────────────────────────────────────── */}
        <div style={{ position:'absolute', inset:0, zIndex:0, pointerEvents:'none' }}>
          {space?.chat_wallpaper ? (
            <>
              <div style={{ width:'100%', height:'100%', background:`url(${space.chat_wallpaper}) center/cover` }} />
              <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(4px)' }} />
            </>
          ) : (
            <div style={{ width:'100%', height:'100%', position:'absolute', inset:0, zIndex:0, overflow:'hidden',
              background: activeTheme.bg || '#0E0C11' }}>
              {/* Subtle top-center glow */}
              <div style={{ position:'absolute', top:'-15%', left:'50%', transform:'translateX(-50%)', width:'60%', height:'50%',
                background:'radial-gradient(ellipse, rgba(180,140,80,0.12) 0%, transparent 70%)', borderRadius:'50%' }} />
              {/* Bottom-right glow */}
              <div style={{ position:'absolute', bottom:'-20%', right:'-10%', width:'50%', height:'55%',
                background:'radial-gradient(ellipse, rgba(100,70,160,0.10) 0%, transparent 65%)', borderRadius:'50%' }} />
            </div>
          )}

          {/* Living animated elements — outside overflow:hidden so they aren't clipped */}
          <ChatBackground elements={activeTheme.elements} theme={activeTheme} />
        </div>

        {/* ── HEADER ───────────────────────────────────────── */}
        <div
          className="chat-header"
          style={{
            boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
          }}
        >
          {/* Back */}
          <Link to="/dashboard" style={{ color:'#fff', display:'flex', alignItems:'center', flexShrink:0 }}>
            <Icons.Back size={20} />
          </Link>

          {/* Avatar + name */}
          <div style={{ display:'flex', alignItems:'center', gap:12, flex:1, cursor:'pointer', minWidth:0, justifyContent: 'center' }} onClick={() => setShowThemePicker(true)}>
            <div style={{
              width:36, height:36, borderRadius:'50%', overflow:'hidden', flexShrink:0,
              background: `linear-gradient(135deg, ${activeTheme.accent || '#a484c2'}88, ${activeTheme.accent || '#7a5f96'}55)`,
              border: `2px solid ${activeTheme.accent || '#C9A96E'}55`,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:'1rem', fontWeight:700, color:'#fff',
              boxShadow: `0 0 12px ${activeTheme.accent || '#C9A96E'}33`,
            }}>
              {partner?.avatar_url
                ? <img src={partner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                : (partner?.name?.[0]?.toUpperCase() || 'P')}
            </div>

            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 1 }}>
              <span style={{ fontWeight:700, fontSize:'1rem', color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {partner?.name || 'Partner'}
              </span>
              <span style={{ fontSize:'0.68rem', color: activeTheme.accent || '#C9A96E', opacity: 0.8, letterSpacing: '0.3px' }}>
                {typing ? 'typing...' : partnerOnline ? 'online' : 'tap to change theme'}
              </span>
            </div>
          </div>

          {/* Call icons */}
          <div style={{ display:'flex', gap:14, flexShrink:0, alignItems: 'center' }}>
            <button
              className="chat-icon-btn"
              style={{ color: activeTheme.accent || 'var(--accent)' }}
              onClick={() => navigate('/call?type=audio')}
              title="Voice Call"
            >
              <Icons.Phone size={18} />
            </button>
            <button
              className="chat-icon-btn"
              style={{ color: activeTheme.accent || 'var(--accent)' }}
              onClick={() => navigate('/call?type=video')}
              title="Video Call"
            >
              <Icons.Video size={20} />
            </button>
          </div>
        </div>

        {/* Pinned Message Banner */}
        {pinnedMsg && (
          <div style={{
            position: 'fixed',
            top: '90px',
            left: '16px',
            right: '16px',
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: `1px solid ${activeTheme.accent || '#C9A96E'}55`,
            borderLeft: `4px solid ${activeTheme.accent || '#C9A96E'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            cursor: 'pointer',
            zIndex: 99,
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            animation: 'fadeInDown 0.3s ease-out'
          }} onClick={() => {
            const target = document.getElementById(`msg-${pinnedMsg.id}`);
            if (target) {
              target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              target.animate([
                { backgroundColor: `rgba(255,255,255,0.15)`, transform: 'scale(1.02)' },
                { backgroundColor: 'transparent', transform: 'scale(1)' }
              ], { duration: 1000, easing: 'ease-out' });
            }
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: activeTheme.accent || '#C9A96E', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icons.Pin size={12} /> Pinned Message
              </div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {pinnedMsg.message_type === 'image' ? '🖼️ Image' : pinnedMsg.message_type === 'video' ? '🎥 Video' : pinnedMsg.message_type === 'audio' ? '🎤 Voice Note' : pinnedMsg.text}
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setPinnedMsg(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* E2EE Key Missing Notice Banner */}
        {!safeGetItem('paxly_sk') && (
          <div style={{
            margin: '8px 16px',
            padding: '10px 14px',
            borderRadius: '14px',
            background: 'rgba(255, 159, 10, 0.15)',
            border: '1px solid rgba(255, 159, 10, 0.35)',
            color: '#FFD60A',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
          }}>
            <span>🔒 Key not initialized on this phone. Log in once to decrypt messages.</span>
            <button 
              onClick={() => {
                safeRemoveItem('ros_token');
                safeRemoveItem('ros_user');
                safeRemoveItem('paxly_sk');
                window.location.href = '/login';
              }}
              style={{
                background: '#FF9F0A',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                padding: '5px 10px',
                fontWeight: 600,
                fontSize: '0.72rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Re-Login
            </button>
          </div>
        )}

        {/* ── MESSAGES ─────────────────────────────────────── */}
        <div
          className="chat-scroll"
          ref={scrollRef}
          onScroll={() => {
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
            if (tapTimeout.current) {
              clearTimeout(tapTimeout.current);
              tapTimeout.current = null;
            }
            setSwipingMsgId(null);
            setSwipeOffset(0);

            // Auto-load older messages when user scrolls near the top (CHAT-012)
            const el = scrollRef.current;
            if (el && hasMore && !loadingOlderRef.current && !loadOlderError) {
              const distanceFromTop = Math.abs(Math.abs(el.scrollTop) - (el.scrollHeight - el.clientHeight));
              if (distanceFromTop < 200 || Math.abs(el.scrollTop) > (el.scrollHeight - el.clientHeight - 200)) {
                loadOlderMessages();
              }
            }
          }}
          style={ replyingTo ? { paddingBottom: '160px', transition: 'padding-bottom 0.2s ease' } : { transition: 'padding-bottom 0.2s ease' } }
        >
          <div ref={bottomRef} style={{ height:1, flexShrink:0 }} />
          
          {typing && (
            <div style={{ display: 'flex', alignItems: 'flex-start', margin: '10px 0', gap: 12, justifyContent: 'flex-start' }}>
              <div style={{
                padding: '14px 20px',
                borderRadius: '4px 20px 20px 20px',
                background: activeTheme.bubbleOther || 'rgba(255,255,255,0.06)',
                border: activeTheme.borderOther || 'none',
                boxShadow: activeTheme.boxShadowOther || '0 4px 15px rgba(0,0,0,0.1)',
                backdropFilter: activeTheme.backdropBlur || 'none',
                WebkitBackdropFilter: activeTheme.backdropBlur || 'none',
                display: 'flex',
                gap: 5,
                alignItems: 'center'
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both', animationDelay: '0.2s' }} />
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: activeTheme.textOther || '#e8e8e8', animation: 'typingDot 1.4s infinite ease-in-out both', animationDelay: '0.4s' }} />
              </div>
            </div>
          )}

          {loadingHistory ? (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: activeTheme.accent || 'var(--accent)' }}>
              <Icons.Loader size={32} className="spin" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: 2, opacity: 0.8 }}>SYNCING SECURE VAULT...</span>
            </div>
          ) : msgs.length === 0 ? (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: 'var(--muted)', opacity: 0.5 }}>
               <Icons.Diamond size={48} />
               <span style={{ fontSize: '0.9rem', fontWeight: 500, letterSpacing: 1 }}>Your secure space is ready</span>
            </div>
          ) : (
            [...msgs].reverse().map((msg, i) => {
            const me            = isMe(msg);
            const isSecure      = msg.is_once_view;
            const isSpent       = isSecure && msg.views_used >= msg.view_limit;
            const isCompromised = msg.is_compromised;
            const isMedia       = msg.message_type === 'image' || msg.message_type === 'video' || msg.message_type === 'audio';
            
            let encryptionKey = null;
            if (isMedia && msg.text && msg.text.startsWith('E2EE_KEY:')) {
               encryptionKey = msg.text.substring(9);
            }
            
            // For texts, if it starts with E2EE_KEY:, we don't display it.
            const displayMsgText = (msg.message_type === 'text' || !msg.message_type) && (!msg.text?.startsWith('E2EE_KEY:'));

            const safeReactions = parseSafeReactions(msg.reactions);
            const hasReactions  = Object.values(safeReactions).filter(Boolean).length > 0;

            return (
              <div
                key={msg.temp_id || msg.id}
                id={`msg-${msg.id}`}
                className="chat-msg"
                onMouseEnter={() => setHoveredMsgId(msg.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
                style={{
                  marginBottom: hasReactions ? 20 : 8,
                  transition: 'margin-bottom 0.18s ease-out',
                  display:'flex', gap:7,
                  justifyContent: me ? 'flex-end' : 'flex-start',
                  animationDelay: `${Math.min(i * 0.025, 0.25)}s`,
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: hoveredMsgId === msg.id || (contextMenuMsg?.msg?.id === msg.id) ? 999 : (msgs.length - i)
                }}
              >
                {/* Partner avatar */}
                {!me && (
                  <div style={{
                    width:28, height:28, borderRadius:'50%', overflow:'hidden',
                    flexShrink:0, alignSelf:'flex-end',
                    border:'1px solid rgba(255,255,255,0.08)',
                    background:'rgba(255,255,255,0.07)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'0.7rem', fontWeight:700, color:'var(--accent)',
                  }}>
                    {partner?.avatar_url
                      ? <img src={partner.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : (partner?.name?.[0]?.toUpperCase() || 'P')}
                  </div>
                )}

                {/* ActionBar for ME (Left Side) */}
                {me && hoveredMsgId === msg.id && (
                  <div style={{ display:'flex', gap:8, paddingRight:4, animation:'fadeIn 0.2s' }}>
                    <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setContextMenuMsg({ msg, x: r.left - 50, y: r.top - 10, type: "emoji" }); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Smile size={16} /></button>
                    <button onClick={() => setReplyingTo(msg)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Reply size={16} /></button>
                    <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setContextMenuMsg({ msg, x: r.left - 50, y: r.top - 10, type: "options" }); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.MoreVertical size={16} /></button>
                  </div>
                )}

                <div style={{ display:'flex', flexDirection:'column', alignItems: me ? 'flex-end' : 'flex-start', position: 'relative', maxWidth: '82%' }}
                  className="chat-bubble-col">

                  <div style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                    {/* Bubble */}
                    <div
                      className="chat-bubble"
                      onContextMenu={(e) => handleContextMenu(e, msg)}
                      onTouchStart={(e) => handleMsgTouchStart(e, msg)}
                      onTouchMove={handleMsgTouchMove}
                      onTouchEnd={e => handleMsgTouchEnd(e, msg)}
                      onTouchCancel={handleMsgTouchCancel}
                      onClick={(e) => {
                        if (isLongPressTriggered.current) {
                          if (e && typeof e.preventDefault === 'function') e.preventDefault();
                          if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
                          return;
                        }
                        if (isSecure && !me && !isSpent && !isCompromised) {
                          handleSecureView(msg);
                          return;
                        }
                        if (msg.message_type === 'image' && user?.blur_sensitive && !unblurred[msg.id]) {
                          setUnblurred(p => ({ ...p, [msg.id]: true }));
                          return;
                        }

                        // Tap / Double-Tap detection
                        const now = Date.now();
                        if (now - lastTapTime.current < 300) {
                          // Double tap: cancel single tap and react with heart ❤️
                          if (tapTimeout.current) {
                            clearTimeout(tapTimeout.current);
                            tapTimeout.current = null;
                          }
                          handleEmojiSelect(msg, '❤️', true);
                          setFloatingHeart(msg.id);
                          setTimeout(() => setFloatingHeart(null), 1000);
                          lastTapTime.current = 0;
                        } else {
                          lastTapTime.current = now;
                          // Ordinary reading, tapping, and clicking leave context menu closed (CHAT-011).
                        }
                      }}
                      style={{
                        padding: isMedia ? 4 : '10px 16px',
                        background: isMedia ? 'transparent'
                          : me
                            ? (activeTheme.bubbleMe || '#E3BE86')
                            : (activeTheme.bubbleOther || 'rgba(255,255,255,0.07)'),
                        color: me
                          ? (activeTheme.textMe || '#111')
                          : (activeTheme.textOther || '#fff'),
                        borderBottomRightRadius: me ? 4  : 20,
                        borderBottomLeftRadius:  me ? 20 : 4,
                        boxShadow: isMedia ? 'none' : me ? (activeTheme.boxShadowMe || `0 4px 18px ${activeTheme.accent || '#C9A96E'}40`) : (activeTheme.boxShadowOther || `0 2px 10px rgba(0,0,0,0.25)`),
                        border: isSecure ? (me ? '1px solid rgba(0,0,0,0.2)' : `1px solid ${activeTheme.accent || '#b3945a'}`) : (me ? (activeTheme.borderMe || 'none') : (activeTheme.borderOther || 'none')),
                        cursor: isSecure ? 'pointer' : 'default',
                        minWidth: isSecure ? 160 : 0,
                        position: 'relative',
                        maxWidth: '100%',
                        backdropFilter: activeTheme.backdropBlur || 'blur(12px)',
                        WebkitbackdropFilter: activeTheme.backdropBlur || 'blur(12px)',
                        transform: swipingMsgId === msg.id ? `translateX(${swipeOffset}px)` : 'none',
                        transition: swipingMsgId === msg.id ? 'none' : 'transform 0.2s',
                      }}
                    >
                      {/* Floating Heart */}
                      {floatingHeart === msg.id && (
                        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%, -50%)', fontSize:'3rem', animation:'floatHeart 1s forwards', zIndex:10 }}>❤️</div>
                      )}

                      {/* Quote Box */}
                      {msg.reply_to_id && (
                        (() => {
                          const quoteMsg = msgs.find(m => m.id === msg.reply_to_id);
                          if (!quoteMsg) return null;
                          return (
                            <div 
                              onClick={(e) => {
                                e.stopPropagation();
                                const target = document.getElementById(`msg-${msg.reply_to_id}`);
                                if (target) {
                                  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                  target.animate([
                                    { backgroundColor: 'rgba(201,169,110,0.3)', transform: 'scale(1.02)' },
                                    { backgroundColor: 'transparent', transform: 'scale(1)' }
                                  ], { duration: 1000, easing: 'ease-out' });
                                }
                              }}
                              style={{
                                cursor: 'pointer',
                                background: 'rgba(0,0,0,0.15)',
                                borderLeft: `4px solid ${activeTheme.accent || '#C9A96E'}`,
                                padding: '6px 10px',
                                borderRadius: '6px',
                                marginBottom: '6px',
                                fontSize: '0.8rem',
                                color: 'rgba(255,255,255,0.8)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}>
                              <div style={{ color: activeTheme.accent || '#C9A96E', fontWeight: 700, marginBottom: 2 }}>{quoteMsg.sender_id === user?.id ? 'You' : (partner?.name || 'Partner')}</div>
                              {quoteMsg.message_type === 'image' ? '📷 Image' : quoteMsg.message_type === 'video' ? '🎥 Video' : quoteMsg.message_type === 'audio' ? '🎵 Voice Note' : quoteMsg.text}
                            </div>
                          );
                        })()
                      )}

                      {/* VIDEO */}
                      {msg.message_type === 'video' && (isSecure ? (
                        <MediaWrap isSending={Boolean(msg.isOptimistic || msg.isUploading)}>
                          <div onClick={() => !isSpent && !isCompromised && setSecureMediaOpen(msg)} style={{ cursor: (!isSpent && !isCompromised) ? 'pointer' : 'default' }}>
                            <SecureChip isCompromised={isCompromised} isSpent={isSpent} isVideo Icons={Icons} />
                          </div>
                        </MediaWrap>
                      ) : (
                        <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]} isSending={Boolean(msg.isOptimistic || msg.isUploading)}>
                          <EncryptedMedia isVideo src={fixUrl(msg.media_url)} encryptionKey={encryptionKey} controls style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12 }} />
                          {!me && (
                            <button
                              onClick={e => { e.stopPropagation(); requestSave(msg); }}
                              style={{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.55)', border:'none', borderRadius:8, padding:'5px 9px', color:'#fff', fontSize:'0.62rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4, backdropFilter:'blur(8px)' }}
                            >
                              <Icons.Download size={11} /> SAVE
                            </button>
                          )}
                        </MediaWrap>
                      ))}

                      {/* IMAGE */}
                      {msg.message_type === 'image' && (isSecure ? (
                        <MediaWrap isSending={Boolean(msg.isOptimistic || msg.isUploading)}>
                          <div onClick={() => !isSpent && !isCompromised && setSecureMediaOpen(msg)} style={{ cursor: (!isSpent && !isCompromised) ? 'pointer' : 'default' }}>
                            <SecureChip isCompromised={isCompromised} isSpent={isSpent} Icons={Icons} />
                          </div>
                        </MediaWrap>
                      ) : (
                        <MediaWrap blurred={user?.blur_sensitive && !unblurred[msg.id]} isSending={Boolean(msg.isOptimistic || msg.isUploading)}>
                          <EncryptedMedia src={fixUrl(msg.media_url)} encryptionKey={encryptionKey} style={{ width:'100%', maxHeight:360, display:'block', borderRadius:12 }} />
                          {!me && (
                            <button
                              onClick={e => { e.stopPropagation(); requestSave(msg); }}
                              style={{ position:'absolute', bottom:8, right:8, background:'rgba(0,0,0,0.55)', border:'none', borderRadius:8, padding:'5px 9px', color:'#fff', fontSize:'0.62rem', cursor:'pointer', display:'flex', alignItems:'center', gap:4, backdropFilter:'blur(8px)' }}
                            >
                              <Icons.Download size={11} /> SAVE
                            </button>
                          )}
                        </MediaWrap>
                      ))}

                      {/* AUDIO */}
                      {msg.message_type === 'audio' && (
                        <VoiceNotePlayer src={msg.media_url} isMe={me} theme={activeTheme} encryptionKey={encryptionKey} />
                      )}

                      {/* TEXT */}
                      {displayMsgText && (
                        msg.text?.startsWith('gAAAAA') && msg.text.length > 50 ? (
                          <span style={{ 
                            fontSize: '0.86rem', 
                            color: 'rgba(255, 255, 255, 0.55)', 
                            fontStyle: 'italic', 
                            display: 'inline-flex', 
                            alignItems: 'center', 
                            gap: '6px' 
                          }}>
                            <span>🔒</span>
                            <span>Encrypted message (session key mismatch)</span>
                          </span>
                        ) : (
                          <span style={{ fontSize:'0.96rem', whiteSpace:'pre-wrap', lineHeight:1.55 }}>{msg.text}</span>
                        )
                      )}
                    </div>

                    {/* Reactions Display (Rendered OUTSIDE chat-bubble to prevent backdrop-filter clipping) */}
                    {hasReactions && (
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          setContextMenuMsg({ msg, x: r.left + r.width / 2, y: r.top - 10, type: "emoji" });
                        }}
                        style={{
                          position: 'absolute',
                          bottom: -10,
                          right: me ? 6 : 'auto',
                          left: me ? 'auto' : 6,
                          background: '#1c1c22',
                          borderRadius: 20,
                          padding: '2px 8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 3,
                          boxShadow: '0 4px 14px rgba(0,0,0,0.65)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          zIndex: 40,
                          cursor: 'pointer',
                          lineHeight: '1.2',
                          height: '24px',
                          boxSizing: 'border-box',
                          userSelect: 'none',
                          animation: 'popIn 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                        }}>
                        {Object.entries(safeReactions).filter(([_, emo]) => Boolean(emo)).map(([uid, emo], idx) => (
                          <span key={uid || idx} style={{ fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transform: 'translateY(-0.5px)' }}>{emo}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timestamp & Edited Indicator */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: hasReactions ? 10 : 3,
                    transition: 'margin-top 0.18s ease-out',
                    fontSize: '0.68rem',
                    color: me ? (activeTheme.accent || '#E3BE86') : 'var(--muted)',
                    fontWeight: 500
                  }}>
                    <span style={{ opacity: 0.65 }}>{ts(msg)}</span>
                    {Boolean(msg.failed) ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); retryMessage(msg); }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          color: '#ff4d4f',
                          cursor: 'pointer',
                          background: 'rgba(255, 77, 79, 0.15)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          border: '1px solid rgba(255, 77, 79, 0.3)'
                        }}
                        title="Delivery failed. Tap to retry."
                      >
                        <Icons.AlertCircle size={10} color="#ff4d4f" />
                        Failed (tap to retry)
                      </span>
                    ) : Boolean(msg.isOptimistic) ? (
                      (msg.message_type === 'image' || msg.message_type === 'video') ? null : (
                        <span style={{ opacity: 0.6, fontStyle: 'italic', fontSize: '0.64rem' }}>
                          sending...
                        </span>
                      )
                    ) : null}
                    {Boolean(msg.is_edited) && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          fontSize: '0.64rem',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: me ? 'rgba(201, 169, 110, 0.22)' : 'rgba(255, 255, 255, 0.12)',
                          color: me ? (activeTheme.textMe ? activeTheme.textMe : '#E3BE86') : '#E3BE86',
                          border: `1px solid ${activeTheme.accent || '#C9A96E'}40`,
                          letterSpacing: '0.2px',
                          lineHeight: 1.3
                        }}
                        title={msg.edited_at ? `Edited at ${parseSafeDate(msg.edited_at).toLocaleTimeString()}` : 'Edited message'}
                      >
                        <Icons.Edit size={10} />
                        Edited
                      </span>
                    )}
                  </div>
                </div>

                {/* ActionBar for PARTNER (Right Side) */}
                {!me && hoveredMsgId === msg.id && (
                  <div style={{ display:'flex', gap:8, paddingLeft:4, animation:'fadeIn 0.2s' }}>
                    <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setContextMenuMsg({ msg, x: r.left + 20, y: r.top - 10, type: "emoji" }); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Smile size={16} /></button>
                    <button onClick={() => setReplyingTo(msg)} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.Reply size={16} /></button>
                    <button onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setContextMenuMsg({ msg, x: r.left + 20, y: r.top - 10, type: "options" }); }} style={{ background:'transparent', border:'none', color:'var(--muted)', cursor:'pointer' }}><Icons.MoreVertical size={16} /></button>
                  </div>
                )}
              </div>
            );
          }))}

          {/* History Pagination Control (CHAT-012) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '14px 0', width: '100%', flexShrink: 0 }}>
            {loadingOlder ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: activeTheme.accent || '#C9A96E', fontSize: '0.8rem', padding: '6px 14px', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', backdropFilter: 'blur(10px)' }}>
                <Icons.Loader size={15} className="spin" />
                <span>Loading older messages...</span>
              </div>
            ) : loadOlderError ? (
              <button
                onClick={loadOlderMessages}
                style={{
                  background: 'rgba(255, 90, 60, 0.15)',
                  border: '1px solid rgba(255, 90, 60, 0.4)',
                  color: '#ff6b4a',
                  borderRadius: '20px',
                  padding: '6px 16px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <span>{loadOlderError}</span>
              </button>
            ) : hasMore ? (
              <button
                onClick={loadOlderMessages}
                style={{
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: `1px solid ${activeTheme.accent || '#C9A96E'}44`,
                  color: activeTheme.accent || '#C9A96E',
                  borderRadius: '20px',
                  padding: '6px 18px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backdropFilter: 'blur(10px)',
                  transition: 'all 0.2s'
                }}
              >
                <Icons.Clock size={14} />
                <span>Load older messages</span>
              </button>
            ) : msgs.length > 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.72rem', opacity: 0.6, letterSpacing: 0.5, padding: '4px 0' }}>
                ✨ Beginning of your conversation ✨
              </div>
            ) : null}
          </div>

          {/* Removed typing and bottomRef from here */}
        </div>

        {/* ── INPUT BAR ─────────────────────────────────────── */}
        <div className="chat-input-bar">
          <input type="file" ref={fileRef} accept="image/*,video/*" onChange={onFileSelect} style={{ display:'none' }} />

          {/* Edit Banner */}
          {editingMsg && (
            <div style={{
              background: 'rgba(30, 30, 33, 0.95)',
              borderLeft: `4px solid ${activeTheme.accent || '#C9A96E'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
                <Icons.Edit size={18} color={activeTheme.accent || '#C9A96E'} />
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <span style={{ color: activeTheme.accent || '#C9A96E', fontSize: '0.85rem', fontWeight: 700 }}>
                    Editing Message
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {editingMsg.text}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  setEditingMsg(null);
                  setText('');
                  if (inputRef.current) inputRef.current.style.height = 'auto';
                }}
                style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer', padding: 8 }}
                title="Cancel edit"
              >
                <Icons.Close size={18} />
              </button>
            </div>
          )}

          {/* Reply Banner */}
          {replyingTo && (
            <div style={{
              background: 'rgba(30, 30, 33, 0.9)',
              borderLeft: `4px solid ${activeTheme.accent || '#C9A96E'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span style={{ color: activeTheme.accent || '#C9A96E', fontSize: '0.85rem', fontWeight: 700 }}>
                  {replyingTo.sender_id === user?.id ? 'You' : partner?.name || 'Partner'}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                  {replyingTo.message_type === 'image' ? '📷 Image' : replyingTo.message_type === 'video' ? '🎥 Video' : replyingTo.message_type === 'audio' ? '🎵 Voice Note' : replyingTo.text}
                </span>
              </div>
              <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer', padding: 8 }}>
                <Icons.Close size={18} />
              </button>
            </div>
          )}

          <div
            className="chat-input-inner"
            style={{
              background: `${activeTheme.accent || '#C9A96E'}0D`,
              border: `1px solid ${activeTheme.accent || '#C9A96E'}28`,
              boxShadow: `0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 ${activeTheme.accent || '#C9A96E'}15`,
            }}
          >
            {isRecordingAudio ? (
              <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 8px', color: '#ff5a3c' }}>
                
                {recordState === 'locked' && (
                  <button className="chat-icon-btn" onClick={cancelVoiceRecord} style={{ color: 'var(--muted)', marginRight: 12 }}>
                    <Icons.Trash size={20} />
                  </button>
                )}

                {recordState === 'preview' ? (
                  <div style={{ flex: 1, paddingRight: 10, display: 'flex', alignItems: 'center' }}>
                    <audio src={audioPreviewUrl} controls style={{ width: '100%', height: 35, outline: 'none' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <div className="rec-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5a3c', animation: 'recPulse 1s infinite' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600 }}>{formatRecordTime(recordTime)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 10, height: 16 }}>
                      <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.9s infinite ease-in-out 0.1s` }} />
                      <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.7s infinite ease-in-out 0.5s` }} />
                      <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 1.1s infinite ease-in-out 0.2s` }} />
                      <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 0.8s infinite ease-in-out 0.6s` }} />
                      <div style={{ width: 2.5, height: '100%', background: '#ff5a3c', borderRadius: 2, transformOrigin: 'center', animation: `audioWave 1.0s infinite ease-in-out 0.3s` }} />
                    </div>
                  </div>
                )}

                {recordState === 'holding' ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', color: 'var(--muted)', fontSize: '0.8rem', animation: 'fadeIn 0.2s' }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8, color: '#ff5a3c' }}>
                        <span style={{ fontSize: 16 }}>&larr;</span>
                        <span>Cancel</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: 10, marginRight: 5, animation: 'slideUpFade 1.5s infinite', opacity: 0.8 }}>
                        <span style={{ fontSize: 16, lineHeight: 1 }}>&uarr;</span>
                        <span>Lock</span>
                     </div>
                  </div>
                ) : null}

                {recordState === 'locked' && (
                  <button className="chat-icon-btn" onClick={previewLockedVoiceRecord} style={{ color: '#ff5a3c', marginLeft: 'auto', marginRight: 10 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"></circle>
                      <rect x="9" y="9" width="6" height="6" fill="currentColor"></rect>
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Attachment Sheet */}
                <AttachmentSheet 
                  isOpen={showAttachmentSheet}
                  onClose={() => setShowAttachmentSheet(false)}
                  onFileSelect={(file) => {
                    setShowAttachmentSheet(false);
                    setPendingFile(file);
                    setShowingStudio(true);
                  }}
                  onAction={(action) => {
                    setShowAttachmentSheet(false);
                    if (action === 'camera') setShowingStudio(true);
                    else if (action === 'gallery' || action === 'document' || action === 'ai') {
                      window.triggerFilePick(fileRef);
                    }
                  }}
                />

                <button className="chat-icon-btn" onClick={() => setShowingStudio(true)}>
                  <Icons.Camera size={20} color={activeTheme.accent || 'var(--muted)'} />
                </button>
                <button className="chat-icon-btn" onClick={() => {
                  if (window.Capacitor?.isNativePlatform()) {
                    setShowAttachmentSheet(true);
                  } else {
                    window.triggerFilePick(fileRef);
                  }
                }}>
                  <Icons.Gallery size={20} color={activeTheme.accent || 'var(--muted)'} />
                </button>
    
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={e => {
                    handleType(e);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    } else if (e.key === 'Escape' && editingMsg) {
                      setEditingMsg(null);
                      setText('');
                      e.target.style.height = 'auto';
                    }
                  }}
                  rows={1}
                  placeholder="Message"
                  style={{ resize: 'none', overflowY: 'auto', fontFamily: 'inherit', lineHeight: '1.4' }}
                />
              </>
            )}

            <button
              className={`chat-send-btn${recordState === 'holding' ? ' rec-btn' : ''}`}
              onPointerDown={!text.trim() && recordState === 'idle' ? startVoiceRecord : undefined}
              onPointerMove={!text.trim() && recordState === 'holding' ? handleRecordMove : undefined}
              onPointerUp={recordState === 'holding' ? stopVoiceRecord : undefined}
              onPointerLeave={recordState === 'holding' ? stopVoiceRecord : undefined}
              onClick={recordState === 'locked' || recordState === 'preview' ? sendLockedVoiceRecord : (text.trim() ? send : undefined)}
              disabled={sending && !!text.trim()}
              style={{
                background: recordState === 'preview' ? (activeTheme.accent || 'var(--accent)') : isRecordingAudio
                  ? '#ff5a3c'
                  : text.trim()
                    ? activeTheme.accent || 'var(--accent)'
                    : `${activeTheme.accent || '#C9A96E'}18`,
                border: text.trim() || isRecordingAudio ? 'none' : `1px solid ${activeTheme.accent || '#C9A96E'}33`,
                boxShadow: text.trim() || isRecordingAudio ? `0 5px 16px ${isRecordingAudio ? '#ff5a3c' : activeTheme.accent || '#C9A96E'}55` : 'none',
                transform: recordState === 'holding' ? 'scale(1.15)' : 'scale(1)',
                touchAction: recordState === 'holding' ? 'none' : 'auto'
              }}
            >
              {text.trim() || recordState === 'locked' || recordState === 'preview'
                ? <Icons.Send size={18} color={isRecordingAudio && recordState !== 'preview' ? '#fff' : (activeTheme.textMe || '#000')} />
                : <Icons.Mic size={18} color={isRecordingAudio ? '#fff' : (activeTheme.accent || 'var(--muted)')} />}
            </button>
          </div>
        </div>

        {/* ── OVERLAYS ─────────────────────────────────────── */}

        {showThemePicker && (
          <ThemePicker
            currentTheme={activeThemeId}
            isPremium={user?.is_premium}
            onSelect={id => { updateTheme(id); setShowThemePicker(false); }}
            onWallpaperUpdate={url => { updateWallpaper(url); setShowThemePicker(false); }}
            onClose={() => setShowThemePicker(false)}
            onPremiumRequired={() => {
              setShowThemePicker(false);
              setShowPremiumModal(true);
            }}
          />
        )}
        
        {showPremiumModal && (
          <PremiumUpgrade 
            onCancel={() => setShowPremiumModal(false)}
            onUpgradeSuccess={() => {
              setShowPremiumModal(false);
              window.location.reload();
            }}
          />
        )}

        {showingStudio && (
          <VlynxlyStudio
            initialFile={pendingFile}
            onCapture={(f, mode) => { setShowingStudio(false); setPendingFile(null); sendMedia(f, mode); }}
            onClose={() => { setShowingStudio(false); setPendingFile(null); }}
          />
        )}

        {/* Gallery secure send */}
        {showGallerySecureModal && (
          <div className="chat-modal-overlay">
            <div className="chat-modal-card" style={{ border:'1px solid #b3945a' }}>
              <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}><Icons.Vault size={42} color="#b3945a" /></div>
              <h3 style={{ marginBottom:6, color:'#fff', fontSize:'1.05rem' }}>Secure Media Transfer</h3>
              <p style={{ fontSize:'0.85rem', color:'var(--muted)', marginBottom:20 }}>How would you like to send this?</p>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {[['once','Once View'],['twice','Twice View']].map(([m,l]) => (
                  <button key={m} onClick={() => sendMedia(pendingFile, m)}
                    style={{ padding:12, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(179,148,90,0.3)', borderRadius:13, color:'#b3945a', fontWeight:600, cursor:'pointer', fontSize:'0.9rem' }}>
                    {l}
                  </button>
                ))}
                <button onClick={() => sendMedia(pendingFile, 'permanent')}
                  style={{ padding:12, background:'#b3945a', border:'none', borderRadius:13, color:'#000', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' }}>
                  Permanent Keep
                </button>
                <button onClick={() => { setShowGallerySecureModal(false); setPendingFile(null); }}
                  style={{ padding:12, background:'transparent', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'0.85rem' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Save request */}
        {saveRequest && (
          <div className="chat-modal-overlay">
            <div className="chat-modal-card" style={{ border:'1px solid var(--accent)' }}>
              <div style={{ marginBottom:16, display:'flex', justifyContent:'center' }}><Icons.Vault size={42} color="var(--accent)" /></div>
              <h3 style={{ marginBottom:6, color:'#fff' }}>Save Request</h3>
              <p style={{ fontSize:'0.88rem', color:'#fff', marginBottom:20 }}>
                <b>{saveRequest.from}</b> wants to save a photo. Allow?
              </p>
              <div style={{ display:'flex', gap:10 }}>
                <button className="btn btn-g" onClick={() => respondSave(false)} style={{ flex:1, padding:12, borderRadius:12, cursor:'pointer' }}>Deny</button>
                <button className="btn btn-p" onClick={() => respondSave(true)}  style={{ flex:1, padding:12, borderRadius:12, color:'#000', fontWeight:700, cursor:'pointer' }}>Allow</button>
              </div>
            </div>
          </div>
        )}

        {/* Requesting save banner */}
        {requestingSave && (
          <div style={{ position:'fixed', top:80, left:'50%', transform:'translateX(-50%)', background:'var(--accent)', color:'#000', padding:'10px 20px', borderRadius:99, fontWeight:700, zIndex:500, boxShadow:'0 8px 22px rgba(201,169,110,0.3)', display:'flex', alignItems:'center', gap:8, whiteSpace:'nowrap', fontSize:'0.88rem' }}>
            <div className="spinner-small" style={{ borderTopColor:'#000' }} /> Requesting Permission…
          </div>
        )}

        {/* Context Menu Overlay */}
        {contextMenuMsg && (
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 999999 }}
            onClick={() => setContextMenuMsg(null)}
          >
            <div style={{
              position: 'absolute',
              left: Math.max(16, Math.min(window.innerWidth - 320, (contextMenuMsg.x || window.innerWidth / 2) - 140)),
              top: Math.max(70, Math.min(window.innerHeight - 380, (contextMenuMsg.y || 200) - 55)),
              background: '#181818',
              borderRadius: 24,
              boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
              padding: '6px 10px',
              minWidth: 260,
              border: '1px solid rgba(255,255,255,0.12)',
              animation: 'fadeIn 0.15s ease',
              zIndex: 1000000
            }} onClick={e => e.stopPropagation()}>
              
              {/* Emoji quick reaction bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', gap: 10 }}>
                {['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✨'].map(emoji => (
                  <span 
                    key={emoji} 
                    style={{ 
                      fontSize: '1.55rem', 
                      cursor: 'pointer', 
                      padding: 4, 
                      transition: 'transform 0.15s ease',
                      display: 'inline-block',
                      userSelect: 'none'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEmojiSelect(contextMenuMsg.msg, emoji);
                    }}
                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.3)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                  >{emoji}</span>
                ))}
              </div>

              {contextMenuMsg.type === 'options' && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  {(() => {
                    const isOwnMsg = Boolean(user?.id) && Boolean(contextMenuMsg.msg?.sender_id) && String(contextMenuMsg.msg.sender_id) === String(user.id);
                    const canEdit = isOwnMsg &&
                      (!contextMenuMsg.msg.message_type || contextMenuMsg.msg.message_type === 'text') &&
                      !contextMenuMsg.msg.is_once_view &&
                      !contextMenuMsg.msg.id?.startsWith('temp_');

                    const actionItems = [
                      ...(canEdit ? [{
                        icon: <Icons.Edit size={18} />,
                        label: 'Edit',
                        action: () => {
                          setEditingMsg(contextMenuMsg.msg);
                          setText(contextMenuMsg.msg.text || '');
                          setReplyingTo(null);
                          setContextMenuMsg(null);
                          setTimeout(() => {
                            if (inputRef.current) {
                              inputRef.current.focus();
                              inputRef.current.style.height = 'auto';
                              inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
                            }
                          }, 50);
                        }
                      }] : []),
                      {
                        icon: <Icons.Reply size={18} />,
                        label: 'Reply',
                        action: () => { setReplyingTo(contextMenuMsg.msg); setContextMenuMsg(null); }
                      },
                      {
                        icon: <Icons.Copy size={18} />,
                        label: 'Copy',
                        action: () => { navigator.clipboard.writeText(contextMenuMsg.msg.text || ''); setContextMenuMsg(null); }
                      },
                      {
                        icon: <Icons.Pin size={18} />,
                        label: 'Pin to Chat',
                        action: () => { setPinnedMsg(contextMenuMsg.msg); setContextMenuMsg(null); }
                      },
                      {
                        icon: <span style={{ fontSize: '1.2rem' }}>✨</span>,
                        label: 'Ask Aura',
                        action: () => {
                          const target = contextMenuMsg.msg;
                          setContextMenuMsg(null);
                          setAuraModalMsg(target);
                        }
                      },
                      {
                        icon: <Icons.Vault size={18} />,
                        label: 'Save to Vault',
                        action: () => { 
                          if (contextMenuMsg.msg.id?.startsWith('temp_')) {
                            alert('Please wait for the message to finish sending before saving.');
                            setContextMenuMsg(null);
                            return;
                          }
                          api.post('/memories/save-message', { message_id: contextMenuMsg.msg.id })
                            .then(() => alert('✨ Saved to Memory Vault!'))
                            .catch((e) => alert('Failed to save message: ' + (e.response?.data?.detail || e.message)));
                          setContextMenuMsg(null); 
                        }
                      },
                    ];

                    if (contextMenuMsg.msg.media_url && !contextMenuMsg.msg.is_once_view) {
                      if (!isOwnMsg) {
                        actionItems.push({
                          icon: <Icons.Download size={18} />,
                          label: 'Save Media',
                          action: () => {
                            requestSave(contextMenuMsg.msg);
                            setContextMenuMsg(null);
                          }
                        });
                      } else {
                        actionItems.push({
                          icon: <Icons.Download size={18} />,
                          label: 'Download Media',
                          action: () => {
                            downloadMediaDirect(contextMenuMsg.msg);
                            setContextMenuMsg(null);
                          }
                        });
                      }
                    }

                    return (
                      <>
                        {actionItems.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: item.label === 'Ask Aura' ? 'var(--accent)' : '#fff', fontWeight: item.label === 'Ask Aura' ? 700 : 400, cursor: 'pointer', fontSize: '0.95rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={item.action}>
                            {item.label}
                            <div style={{ opacity: item.label === 'Ask Aura' ? 1 : 0.7, filter: item.label === 'Ask Aura' ? 'drop-shadow(0 0 5px rgba(201,169,110,0.5))' : 'none' }}>{item.icon}</div>
                          </div>
                        ))}

                        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: '#ff4444', cursor: 'pointer', fontSize: '0.95rem' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          onClick={() => {
                            setDeleteModalMsg(contextMenuMsg.msg);
                            setContextMenuMsg(null);
                          }}>
                          Delete
                          <div style={{ opacity: 0.7 }}><Icons.Trash size={18} /></div>
                        </div>

                        {!isOwnMsg && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '0.95rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            onClick={() => { alert('Reported!'); setContextMenuMsg(null); }}>
                            Report
                            <div style={{ opacity: 0.7 }}><Icons.Report size={18} /></div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
              </div>
            </div>
          )}

      {/* Delete Confirmation Modal */}
      {deleteModalMsg && (() => {
        const isOwnDelete = Boolean(user?.id) && Boolean(deleteModalMsg?.sender_id) && String(deleteModalMsg.sender_id) === String(user.id);

        const handleDelete = async (forEveryone) => {
          const target = deleteModalMsg;
          const targetId = target.id;
          setDeleteModalMsg(null);

          // Optimistically remove from local message list
          setMsgs(prev => prev.filter(m => m.id !== targetId));

          try {
            if (forEveryone && wsService.isConnected()) {
              wsService.send({
                type: 'message_delete',
                message_id: targetId,
                for_everyone: true
              });
            }

            await api.delete(`/chat/messages/${targetId}`, {
              params: { for_everyone: forEveryone }
            });
          } catch (err) {
            console.error('Delete message failed:', err);
            // Revert on failure
            setMsgs(prev => {
              if (prev.some(m => m.id === targetId)) return prev;
              const next = [...prev, target];
              return next.sort((a, b) => parseSafeDate(a.timestamp).getTime() - parseSafeDate(b.timestamp).getTime());
            });
            alert(err.response?.data?.detail || (forEveryone ? 'Failed to delete for everyone' : 'Failed to delete for me'));
          }
        };

        return (
          <div 
            style={{ position: 'fixed', inset: 0, zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
            onClick={() => setDeleteModalMsg(null)}
          >
            <div style={{
              background: '#1A1A1A',
              borderRadius: 16,
              padding: '16px 0',
              width: 290,
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              animation: 'fadeIn 0.15s ease'
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 16px 14px', fontSize: '1.05rem', color: '#fff', textAlign: 'center', fontWeight: 600 }}>Delete Message?</h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {isOwnDelete && (
                  <button
                    onClick={() => handleDelete(true)}
                    style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: '#ff4444', fontSize: '0.98rem', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,68,68,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    Delete for everyone
                  </button>
                )}
                <button
                  onClick={() => handleDelete(false)}
                  style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: '#fff', fontSize: '0.98rem', cursor: 'pointer', textAlign: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Delete for me
                </button>
                
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                
                <button
                  onClick={() => setDeleteModalMsg(null)}
                  style={{ background: 'transparent', border: 'none', padding: '12px 16px', color: 'var(--muted)', fontSize: '0.95rem', cursor: 'pointer', textAlign: 'center' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Secure Media Overlay */}
      {secureMediaOpen && (
        <SecureMediaOverlay 
          msg={secureMediaOpen} 
          wsService={wsService} 
          onClose={() => {
            setSecureMediaOpen(null);
          }} 
        />
      )}

      {/* Ask Aura Modal */}
      {auraModalMsg && (
        <AskAuraModal
          isOpen={Boolean(auraModalMsg)}
          message={auraModalMsg}
          partnerName={partner?.name || 'Partner'}
          userName={user?.name || 'You'}
          isOwnMsg={Boolean(user?.id) && Boolean(auraModalMsg?.sender_id) && String(auraModalMsg.sender_id) === String(user.id)}
          onClose={() => setAuraModalMsg(null)}
          onApplyReply={(replyText) => {
            setText(replyText);
            setAuraModalMsg(null);
            setTimeout(() => {
              if (inputRef.current) {
                inputRef.current.focus();
                inputRef.current.style.height = 'auto';
                inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
              }
            }, 60);
          }}
        />
      )}
      </div>
    </>
  );
}

/* ── Small helper components (no extra files needed) ────────── */

function SecureChip({ isCompromised, isSpent, isVideo, Icons }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 6px' }}>
      {isCompromised
        ? <Icons.Shield size={21} color="#FF3B30" />
        : isSpent
          ? <Icons.Vault size={21} color="var(--muted)" />
          : isVideo
            ? <Icons.Video size={21} color="var(--accent)" />
            : <Icons.Vault size={21} color="var(--accent)" />}
      <div style={{ fontSize:'0.86rem' }}>
        <div style={{ fontWeight:600 }}>
          {isCompromised ? 'Compromised' : isSpent ? 'Viewed' : isVideo ? 'Ephemeral Video' : 'Ephemeral Media'}
        </div>
        {!isSpent && !isCompromised && (
          <div style={{ fontSize:'0.7rem', opacity:.6 }}>Tap to {isVideo ? 'scan & play' : 'scan & reveal'}</div>
        )}
      </div>
    </div>
  );
}

function MediaWrap({ blurred, isSending, children }) {
  return (
    <div style={{ position:'relative', borderRadius:12, overflow:'hidden', display:'inline-block', maxWidth:'100%' }}>
      <div style={{ filter: blurred ? 'blur(22px)' : isSending ? 'brightness(0.78)' : 'none', transition:'filter 0.3s ease' }}>
        {children}
      </div>
      {blurred && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:'0.7rem', fontWeight:700, background:'rgba(0,0,0,0.2)', pointerEvents:'none', borderRadius:12 }}>
          TAP TO REVEAL
        </div>
      )}
      {isSending && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 15
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            border: '1.5px solid rgba(255,255,255,0.25)'
          }}>
            <div style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '2.5px solid rgba(255,255,255,0.25)',
              borderTopColor: '#b3945a',
              animation: 'spin 0.8s linear infinite'
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

