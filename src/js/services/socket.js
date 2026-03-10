/* ================================
   WChat - Socket Service
   ================================ */

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
  }

  connect() {
    this.socket = io({
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.emit('_connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      Helpers.showToast('انقطع الاتصال بالسيرفر', 'error');
    });

    this.socket.on('connect_error', () => {
      Helpers.showToast('خطأ في الاتصال', 'error');
    });

    // Forward all events to registered listeners
    const events = [
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

  // Register user
  register(userData) {
    this.socket.emit('user:register', userData);
  }

  // Join room
  joinRoom(roomId) {
    this.socket.emit('room:join', roomId);
  }

  // Send message
  sendMessage(data) {
    this.socket.emit('message:send', data);
  }

  // Send DM
  sendDM(data) {
    this.socket.emit('dm:send', data);
  }

  // Get DM history
  getDMHistory(targetId) {
    this.socket.emit('dm:history', targetId);
  }

  // Typing
  startTyping(roomId) {
    this.socket.emit('typing:start', roomId);
  }

  stopTyping(roomId) {
    this.socket.emit('typing:stop', roomId);
  }

  // Voice
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

  // React to message
  reactToMessage(data) {
    this.socket.emit('message:react', data);
  }

  // Update status
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

  emit(event, data) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(cb => cb(data));
  }

  get id() {
    return this.socket?.id;
  }
}

const socketService = new SocketService();
