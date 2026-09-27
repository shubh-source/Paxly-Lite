class WSService {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.token = null;
    this.coupleSpaceId = null;
    this._intentionalClose = false;
    this.queue = [];
  }

  connect(token, coupleSpaceId = null) {
    // Only connect if user has a couple space (otherwise backend returns 4001)
    if (!coupleSpaceId) {
      console.log('⏸️ WebSocket: no couple space, skipping connection');
      return;
    }
    
    // Save for reconnections
    this.token = token;
    this.coupleSpaceId = coupleSpaceId;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
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
      // Send token in payload instead of URL for better security
      this.send({ type: 'auth', token: token });
      
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.pingTimer) {
        clearInterval(this.pingTimer);
      }
      this.pingTimer = setInterval(() => {
        if (this.isConnected()) {
          try { this.ws.send(JSON.stringify({ type: 'ping' })); } catch {}
        }
      }, 20000);

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
      // - 4001 = no couple space yet (user not linked with partner)
      // - 4003 = forbidden
      if (!this._intentionalClose && e.code !== 4001 && e.code !== 4003 && e.code !== 1008) {
        this.reconnectTimer = setTimeout(() => this.connect(this.token, this.coupleSpaceId), 3000);
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
      this.ws.send(JSON.stringify(data));
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
  sendMessage(text, messageType = 'text', mediaUrl = null, isOnceView = false, viewLimit = 1, replyToId = null) {
    this.send({ 
      type: 'chat_message', 
      text, 
      message_type: messageType, 
      media_url: mediaUrl,
      is_once_view: isOnceView,
      view_limit: viewLimit,
      reply_to_id: replyToId
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
