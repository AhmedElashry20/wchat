/* ================================
   WChat - Socket Service
   ================================ */

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
    this.connected = false;
  }

  connect() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10
    });

    this.socket.on('connect', () => {
      console.log('Connected to server:', this.socket.id);
      this.connected = true;
      this.emit('_connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      this.connected = false;
      Helpers.showToast('انقطع الاتصال بالسيرفر', 'error');
    });

    this.socket.on('connect_error', (err) => {
      console.error('Connection error:', err.message);
    });

    // Forward all server events to internal listeners
    const events = [
      'auth:success', 'auth:error',
      'users:update', 'rooms:list', 'rooms:update',
      'room:messages', 'message:new', 'message:reacted',
      'dm:new', 'dm:messages',
      'typing:update',
      'voice:user-joined', 'voice:user-left',
      'voice:offer', 'voice:answer', 'voice:ice-candidate'
    ];

    events.forEach(event => {
      this.socket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  // Auth
  authenticate(token) {
    this.socket.emit('auth:token', { token });
  }

  joinRoom(roomId) {
    this.socket.emit('room:join', roomId);
  }

  sendMessage(data) {
    this.socket.emit('message:send', data);
  }

  sendDM(data) {
    this.socket.emit('dm:send', data);
  }

  getDMHistory(targetId) {
    this.socket.emit('dm:history', targetId);
  }

  startTyping(roomId) {
    if (roomId) this.socket.emit('typing:start', roomId);
  }

  stopTyping(roomId) {
    if (roomId) this.socket.emit('typing:stop', roomId);
  }

  joinVoice(roomId) {
    this.socket.emit('voice:join', roomId);
  }

  leaveVoice(roomId) {
    this.socket.emit('voice:leave', roomId);
  }

  sendVoiceOffer(data) {
    this.socket.emit('voice:offer', data);
  }

  sendVoiceAnswer(data) {
    this.socket.emit('voice:answer', data);
  }

  sendIceCandidate(data) {
    this.socket.emit('voice:ice-candidate', data);
  }

  reactToMessage(data) {
    this.socket.emit('message:react', data);
  }

  updateStatus(status) {
    this.socket.emit('user:status', status);
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  clearListeners() {
    this.listeners = {};
  }

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }

  get id() {
    return this.socket?.id;
  }
}

const socketService = new SocketService();
