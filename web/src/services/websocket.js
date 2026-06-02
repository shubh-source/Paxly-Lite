class WSService {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.token = null;
    this.coupleSpaceId = null;
    this._intentionalClose = false;
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
    
    let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    if (apiUrl.endsWith('/api')) apiUrl = apiUrl.slice(0, -4);
    
    const wsProtocol = apiUrl.startsWith('https') ? 'wss:' : 'ws:';
    const wsHost = apiUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${token}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.emit('connected', {});
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
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
      this.emit('disconnected', {});
      // Do NOT reconnect if:
      // - intentionally closed
      // - 4001 = no couple space yet (user not linked with partner)
      // - 4003 = forbidden
      if (!this._intentionalClose && e.code !== 4001 && e.code !== 4003 && e.code !== 1008) {
        this.reconnectTimer = setTimeout(() => this.connect(this.token), 5000);
      }
    };

    this.ws.onerror = (e) => console.error('WS Error:', e);
  }

  disconnect() {
    this._intentionalClose = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) { this.ws.close(); this.ws = null; }
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
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
  sendMessage(text, messageType = 'text', mediaUrl = null, isOnceView = false, viewLimit = 1) {
    this.send({ 
      type: 'chat_message', 
      text, 
      message_type: messageType, 
      media_url: mediaUrl,
      is_once_view: isOnceView,
      view_limit: viewLimit
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
}

export const wsService = new WSService();
