class WSService {
  constructor() {
    this.ws = null;
    this.listeners = {};
    this.reconnectTimer = null;
    this.token = null;
  }

  connect(token) {
    this.token = token;
    let wsBase = import.meta.env.VITE_API_URL 
      ? import.meta.env.VITE_API_URL.replace('http', 'ws') 
      : 'ws://localhost:8000';
    
    const wsUrl = `${wsBase}/ws?token=${token}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.emit('connected', {});
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        this.emit(data.type, data);
      } catch {}
    };

    this.ws.onclose = () => {
      console.log('🔌 WebSocket disconnected');
      this.emit('disconnected', {});
      // Auto reconnect after 3s
      this.reconnectTimer = setTimeout(() => this.connect(this.token), 3000);
    };

    this.ws.onerror = (e) => console.error('WS Error:', e);
  }

  disconnect() {
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
}

export const wsService = new WSService();
