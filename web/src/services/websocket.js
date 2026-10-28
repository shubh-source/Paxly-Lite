class WSService {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.token = null;
    this.coupleSpaceId = null;
    this._intentionalClose = false;
    this.queue = [];
    this.reconnectAttempts = 0;

    // ⚡ Fast Wakeup & Instant Reconnect on screen unlock / tab focus / network resume
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.handleResume();
        }
      });
      window.addEventListener('focus', () => {
        this.handleResume();
      });
      window.addEventListener('online', () => {
        this.handleResume();
      });
    }
  }

  handleResume() {
    if (!this.token || !this.coupleSpaceId) return;
    if (!this.isConnected()) {
      console.log('⚡ Tab/Screen resumed: reconnecting WebSocket instantly');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.reconnectAttempts = 0;
      this.connect(this.token, this.coupleSpaceId);
    } else {
      // Announce immediate presence touch so partner knows we just became active
      this.send({ type: 'presence_touch' });
    }
  }

  connect(token, coupleSpaceId = null) {
    // Only connect if user has a couple space (otherwise backend returns 4001)
    if (!coupleSpaceId) {
      console.log('⏸️ WebSocket: no couple space, skipping connection');
      return;
    }
    
    const spaceChanged = this.coupleSpaceId && this.coupleSpaceId !== coupleSpaceId;
    this.token = token;
    this.coupleSpaceId = coupleSpaceId;

    if (spaceChanged && this.ws) {
      console.log('🔄 Couple space updated, reconnecting WebSocket to new space:', coupleSpaceId);
      this._intentionalClose = true;
      try { this.ws.close(); } catch {}
      this.ws = null;
    } else if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    
    this._intentionalClose = false;
    
    const defaultBackend = import.meta.env.PROD 
      ? 'https://paxly-lite.onrender.com' 
      : 'http://localhost:8000';

    let apiUrl = import.meta.env.VITE_API_URL || defaultBackend;
    if (apiUrl.endsWith('/api')) apiUrl = apiUrl.slice(0, -4);
    
    const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const wsHost = apiUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const wsUrl = `${wsProtocol}//${wsHost}/ws`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      // Send token in payload instead of URL for better security
      this.send({ type: 'auth', token: token });
      
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.pingTimer) {
        clearInterval(this.pingTimer);
      }
      // Keepalive ping every 10 seconds for snappy disconnect detection
      this.pingTimer = setInterval(() => {
        if (this.isConnected()) {
          try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch {
            this.handleResume();
          }
        }
      }, 10000);

      this.emit('connected', {});
      
      // Flush queued messages after authentication
      setTimeout(() => {
        while (this.queue.length > 0) {
          const queued = this.queue.shift();
          this.send(queued);
        }
      }, 100);
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'pong') return; // keepalive response
        if (data.type === 'webrtc_offer') {
          this.latestOffer = data;
        }
        if (data.type === 'webrtc_end' || data.type === 'webrtc_reject') {
          this.latestOffer = null;
        }
        this.emit(data.type, data);
      } catch {}
    };

    this.ws.onclose = (e) => {
      console.log('🔌 WebSocket disconnected', e.code);
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      this.emit('disconnected', {});
      // Do NOT reconnect if:
      // - intentionally closed
      // - 4003 = forbidden
      // - 1008 = policy violation
      if (!this._intentionalClose && e.code !== 4003 && e.code !== 1008) {
        // If 4001: retry up to 5 times if user has coupleSpaceId (could be server cold start / reconnect race)
        if (e.code === 4001 && (!this.coupleSpaceId || this.reconnectAttempts >= 5)) {
          console.log('WebSocket: 4001 skipping retry (no couple space or limit reached)');
          return;
        }
        // Fast adaptive retry: starts at 500ms
        const delay = Math.min(500 * Math.pow(1.5, this.reconnectAttempts), 5000);
        this.reconnectAttempts++;
        this.reconnectTimer = setTimeout(() => this.connect(this.token, this.coupleSpaceId), delay);
      }
    };

    this.ws.onerror = (e) => console.error('WS Error:', e);
  }

  disconnect() {
    this._intentionalClose = true;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (err) {
        console.error('WS send error:', err);
        if (data?.type !== 'auth') {
          this.queue.push(data);
        }
      }
    } else {
      // Queue message and try to reconnect if not connected
      if (data?.type !== 'auth') {
        this.queue.push(data);
      }
      if (this.token && this.coupleSpaceId && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        this.connect(this.token, this.coupleSpaceId);
      }
    }
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
    return () => this.off(event, cb);
  }

  off(event, cb) {
    this.listeners[event] = (this.listeners[event] || []).filter(l => l !== cb);
  }

  emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }

  // Chat
  sendMessage(text, messageType = 'text', mediaUrl = null, isOnceView = false, viewLimit = 1, replyToId = null, tempId = null) {
    this.send({ 
      type: 'chat_message', 
      text, 
      message_type: messageType, 
      media_url: mediaUrl,
      is_once_view: isOnceView,
      view_limit: viewLimit,
      reply_to_id: replyToId,
      temp_id: tempId
    });
  }

  sendTyping(isTyping) {
    this.send({ type: 'typing', is_typing: isTyping });
  }

  sendReaction(messageId, emoji) {
    this.send({ type: 'reaction', message_id: messageId, emoji });
  }

  // WebRTC Signaling
  sendOffer(sdp, callType = 'video') {
    this.send({ type: 'webrtc_offer', sdp, call_type: callType });
  }

  sendAnswer(sdp) {
    this.send({ type: 'webrtc_answer', sdp });
  }

  sendIceCandidate(candidate, sdpMLineIndex, sdpMid) {
    this.send({ type: 'webrtc_ice', candidate, sdpMLineIndex, sdpMid });
  }

  endCall() {
    this.send({ type: 'webrtc_end' });
  }

  rejectCall() {
    this.send({ type: 'webrtc_reject' });
  }

  // Media Permissions
  sendMediaSaveRequest(mediaUrl, messageId) {
    this.send({ type: 'media_save_request', media_url: mediaUrl, message_id: messageId });
  }

  sendMediaSaveResponse(requestId, allowed, messageId) {
    this.send({ type: 'media_save_response', request_id: requestId, allowed, message_id: messageId });
  }

  // Vault Download Permissions
  sendVaultDownloadRequest(memoryId, title) {
    this.send({ type: 'vault_download_request', memory_id: memoryId, title });
  }

  sendVaultDownloadResponse(requestId, allowed, memoryId) {
    this.send({ type: 'vault_download_response', request_id: requestId, allowed, memory_id: memoryId });
  }
}

export const wsService = new WSService();
