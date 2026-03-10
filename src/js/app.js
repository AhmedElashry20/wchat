/* ================================
   WChat - Main Application
   ================================ */

// Global auth helpers
function switchAuthTab(tab) {
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('login-tab-btn').classList.toggle('active', tab === 'login');
  document.getElementById('register-tab-btn').classList.toggle('active', tab === 'register');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('register-error').classList.add('hidden');
}

function togglePassword(inputId, btn) {
  const input = document.getElementById(inputId);
  const icon = btn.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

class WChatApp {
  constructor() {
    this.user = null;
    this.token = null;
    this.currentRoom = null;
    this.selectedColor = '#6C5CE7';
    this.isInVoice = false;
    this.typingTimeout = null;
  }

  init() {
    this.bindAuthEvents();
    this.bindChatEvents();
    this.bindVoiceEvents();
    this.bindUIEvents();
    uiComponent.setupEmojiPicker();

    // Check saved session
    this.checkSession();
  }

  // ========== AUTH ==========

  async checkSession() {
    const token = localStorage.getItem('wchat_token');
    if (!token) return;

    try {
      const res = await fetch('/api/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      if (res.ok && data.user) {
        this.token = token;
        this.user = data.user;
        this.enterApp();
      } else {
        localStorage.removeItem('wchat_token');
      }
    } catch {
      // Server not available
    }
  }

  bindAuthEvents() {
    // Avatar color picker
    document.querySelectorAll('.avatar-color').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.avatar-color').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedColor = el.dataset.color;
      });
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const errorEl = document.getElementById('login-error');
      errorEl.classList.add('hidden');

      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      if (!username || !password) return;

      btn.classList.add('btn-loading');
      btn.disabled = true;

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          this.token = data.token;
          this.user = data.user;
          localStorage.setItem('wchat_token', data.token);
          this.enterApp();
        } else {
          errorEl.textContent = data.error || 'خطأ في تسجيل الدخول';
          errorEl.classList.remove('hidden');
        }
      } catch {
        errorEl.textContent = 'خطأ في الاتصال بالسيرفر';
        errorEl.classList.remove('hidden');
      }

      btn.classList.remove('btn-loading');
      btn.disabled = false;
    });

    // Register form
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('register-btn');
      const errorEl = document.getElementById('register-error');
      errorEl.classList.add('hidden');

      const username = document.getElementById('register-username').value.trim();
      const email = document.getElementById('register-email').value.trim();
      const password = document.getElementById('register-password').value;
      const confirm = document.getElementById('register-confirm').value;

      if (!username || !password) return;

      if (password !== confirm) {
        errorEl.textContent = 'كلمة المرور غير متطابقة';
        errorEl.classList.remove('hidden');
        return;
      }

      if (password.length < 6) {
        errorEl.textContent = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        errorEl.classList.remove('hidden');
        return;
      }

      btn.classList.add('btn-loading');
      btn.disabled = true;

      const avatar = Helpers.getAvatar(username, this.selectedColor);

      try {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password, avatar })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          this.token = data.token;
          this.user = data.user;
          localStorage.setItem('wchat_token', data.token);
          Helpers.showToast('تم إنشاء الحساب بنجاح!', 'success');
          this.enterApp();
        } else {
          errorEl.textContent = data.error || 'خطأ في إنشاء الحساب';
          errorEl.classList.remove('hidden');
        }
      } catch {
        errorEl.textContent = 'خطأ في الاتصال بالسيرفر';
        errorEl.classList.remove('hidden');
      }

      btn.classList.remove('btn-loading');
      btn.disabled = false;
    });

    // Check username availability (on typing)
    let checkTimer;
    document.getElementById('register-username').addEventListener('input', (e) => {
      const status = document.getElementById('username-status');
      const val = e.target.value.trim();

      clearTimeout(checkTimer);
      if (val.length < 3) {
        status.textContent = '';
        return;
      }

      status.textContent = '...';
      checkTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/check-username/${encodeURIComponent(val)}`);
          const data = await res.json();
          status.textContent = data.available ? '✅' : '❌';
        } catch {
          status.textContent = '';
        }
      }, 500);
    });
  }

  enterApp() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('my-username').textContent = this.user.username;
    document.getElementById('my-avatar').src = this.user.avatar;

    // Connect socket and authenticate
    socketService.connect();
    socketService.on('_connected', () => {
      socketService.socket.emit('auth:token', { token: this.token });
    });

    this.setupSocketListeners();
    Helpers.showToast(`مرحباً ${this.user.username}!`, 'success');
  }

  logout() {
    localStorage.removeItem('wchat_token');
    this.token = null;
    this.user = null;
    if (this.isInVoice) this.leaveVoice();
    if (socketService.socket) socketService.socket.disconnect();
    document.getElementById('app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    // Reset forms
    document.getElementById('login-form').reset();
    document.getElementById('register-form').reset();
    switchAuthTab('login');
  }

  // ========== SOCKET LISTENERS ==========

  setupSocketListeners() {
    socketService.on('auth:success', (user) => {
      console.log('Authenticated:', user.username);
    });

    socketService.on('auth:error', (msg) => {
      Helpers.showToast(msg, 'error');
      this.logout();
    });

    socketService.on('users:update', (users) => {
      uiComponent.updateUsers(users);
    });

    socketService.on('rooms:list', (rooms) => {
      uiComponent.updateRooms(rooms);
    });

    socketService.on('rooms:update', (rooms) => {
      uiComponent.updateRooms(rooms);
    });

    socketService.on('room:messages', (data) => {
      if (data.roomId === this.currentRoom) {
        chatComponent.renderMessages(data.messages);
      }
    });

    socketService.on('message:new', (msg) => {
      if (msg.roomId === this.currentRoom) {
        chatComponent.appendMessage(msg);
      }
    });

    socketService.on('message:reacted', (data) => {
      chatComponent.updateReactions(data.messageId, data.reactions);
    });

    socketService.on('dm:messages', (data) => {
      if (data.targetId === chatComponent.currentDM) {
        chatComponent.renderMessages(data.messages);
      }
    });

    socketService.on('dm:new', (msg) => {
      const dmTarget = msg.from === socketService.id ? msg.to : msg.from;
      uiComponent.dmUsers.add(dmTarget);
      uiComponent.updateDMList();

      if (chatComponent.currentDM === dmTarget || chatComponent.currentDM === msg.from) {
        chatComponent.appendMessage({ ...msg, userId: msg.from, id: msg.id });
      } else if (msg.from !== socketService.id) {
        Helpers.showToast(`رسالة جديدة من ${msg.username}`, 'info');
      }
    });

    socketService.on('typing:update', (data) => {
      const indicator = document.getElementById('typing-indicator');
      const userEl = document.getElementById('typing-user');
      if (data.typing) {
        userEl.textContent = data.username;
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 3000);
      } else {
        indicator.classList.add('hidden');
      }
    });

    // Voice signaling
    socketService.on('voice:user-joined', async (data) => {
      if (this.isInVoice) await voiceService.handleUserJoined(data.userId);
    });

    socketService.on('voice:user-left', (data) => {
      voiceService.handleUserLeft(data.userId);
    });

    socketService.on('voice:offer', async (data) => {
      if (this.isInVoice) await voiceService.handleOffer(data.from, data.offer);
    });

    socketService.on('voice:answer', async (data) => {
      await voiceService.handleAnswer(data.from, data.answer);
    });

    socketService.on('voice:ice-candidate', async (data) => {
      await voiceService.handleIceCandidate(data.from, data.candidate);
    });
  }

  // ========== ROOM MANAGEMENT ==========

  joinRoom(roomId) {
    this.currentRoom = roomId;
    chatComponent.currentRoom = roomId;
    chatComponent.currentDM = null;
    chatComponent.lastMessageUser = null;
    chatComponent.lastMessageDate = null;

    socketService.joinRoom(roomId);

    const room = uiComponent.rooms.find(r => r.id === roomId);
    if (room) {
      document.getElementById('chat-title').textContent = room.name;
      document.getElementById('chat-icon').textContent = room.icon;
      document.getElementById('chat-subtitle').textContent =
        room.type === 'voice' ? 'غرفة صوتية' : `${room.members} عضو`;
    }

    document.getElementById('welcome-message')?.remove();
    document.getElementById('message-input-area').style.display = 'flex';

    const voiceBtn = document.getElementById('voice-call-btn');
    if (room && room.type === 'voice') {
      voiceBtn.classList.remove('hidden');
    }

    document.getElementById('sidebar').classList.remove('open');
    uiComponent.updateRooms(uiComponent.rooms);
  }

  openDM(userId) {
    if (userId === socketService.id) return;

    chatComponent.currentRoom = null;
    chatComponent.currentDM = userId;
    chatComponent.lastMessageUser = null;
    chatComponent.lastMessageDate = null;
    this.currentRoom = null;

    const user = uiComponent.users.find(u => u.id === userId);
    if (user) {
      document.getElementById('chat-title').textContent = user.username;
      document.getElementById('chat-icon').textContent = '💬';
      document.getElementById('chat-subtitle').textContent = 'محادثة خاصة';
    }

    uiComponent.dmUsers.add(userId);
    uiComponent.updateDMList();
    socketService.getDMHistory(userId);

    document.getElementById('message-input-area').style.display = 'flex';
    document.getElementById('sidebar').classList.remove('open');
    this.switchTab('dms');
  }

  // ========== CHAT EVENTS ==========

  bindChatEvents() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const attachBtn = document.getElementById('attach-btn');
    const fileInput = document.getElementById('file-input');
    const emojiBtn = document.getElementById('emoji-btn');
    const emojiPicker = document.getElementById('emoji-picker');

    const sendMessage = () => {
      const content = input.value.trim();
      if (!content) return;

      if (chatComponent.currentDM) {
        socketService.sendDM({ to: chatComponent.currentDM, content, type: 'text' });
      } else if (this.currentRoom) {
        socketService.sendMessage({ roomId: this.currentRoom, content, type: 'text' });
      }

      input.value = '';
      input.style.height = 'auto';
      socketService.stopTyping(this.currentRoom);
    };

    sendBtn.addEventListener('click', sendMessage);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      if (this.currentRoom) {
        socketService.startTyping(this.currentRoom);
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => socketService.stopTyping(this.currentRoom), 2000);
      }
    });

    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this.uploadAndSend(file);
      fileInput.value = '';
    });

    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add('hidden');
      }
    });

    document.getElementById('user-search').addEventListener('input', (e) => {
      uiComponent.filterUsers(e.target.value);
    });
  }

  async uploadAndSend(file) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      Helpers.showToast('جاري رفع الملف...', 'info');
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.error) {
        Helpers.showToast('فشل رفع الملف', 'error');
        return;
      }

      const type = Helpers.isImage(file.name) ? 'image' : 'file';
      const msgData = { content: file.name, type, fileUrl: data.url, fileName: data.name };

      if (chatComponent.currentDM) {
        socketService.sendDM({ to: chatComponent.currentDM, ...msgData });
      } else if (this.currentRoom) {
        socketService.sendMessage({ roomId: this.currentRoom, ...msgData });
      }
    } catch {
      Helpers.showToast('خطأ في رفع الملف', 'error');
    }
  }

  insertEmoji(emoji) {
    const input = document.getElementById('message-input');
    input.value += emoji;
    input.focus();
    document.getElementById('emoji-picker').classList.add('hidden');
  }

  // ========== VOICE EVENTS ==========

  bindVoiceEvents() {
    const voiceCallBtn = document.getElementById('voice-call-btn');
    const muteBtn = document.getElementById('mute-btn');
    const deafenBtn = document.getElementById('deafen-btn');
    const leaveBtn = document.getElementById('voice-leave-btn');
    const recordBtn = document.getElementById('voice-record-btn');
    const recordCancel = document.getElementById('recording-cancel');
    const recordSend = document.getElementById('recording-send');

    voiceCallBtn.addEventListener('click', async () => {
      if (this.isInVoice) this.leaveVoice();
      else await this.joinVoice();
    });

    muteBtn.addEventListener('click', () => {
      const muted = voiceService.toggleMute();
      muteBtn.classList.toggle('active', muted);
      muteBtn.querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    });

    deafenBtn.addEventListener('click', () => {
      const deafened = voiceService.toggleDeafen();
      deafenBtn.classList.toggle('active', deafened);
      deafenBtn.querySelector('i').className = deafened ? 'fas fa-volume-mute' : 'fas fa-headphones';
      if (deafened) {
        muteBtn.classList.add('active');
        muteBtn.querySelector('i').className = 'fas fa-microphone-slash';
      }
    });

    leaveBtn.addEventListener('click', () => this.leaveVoice());

    recordBtn.addEventListener('click', async () => {
      const started = await voiceService.startRecording();
      if (started) {
        document.getElementById('recording-overlay').classList.remove('hidden');
        recordBtn.classList.add('recording');
      }
    });

    recordCancel.addEventListener('click', () => {
      voiceService.cancelRecording();
      document.getElementById('recording-overlay').classList.add('hidden');
      recordBtn.classList.remove('recording');
    });

    recordSend.addEventListener('click', async () => {
      const result = await voiceService.stopRecording();
      document.getElementById('recording-overlay').classList.add('hidden');
      recordBtn.classList.remove('recording');

      if (result && result.blob) {
        const file = new File([result.blob], 'voice-message.webm', { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await fetch('/upload', { method: 'POST', body: formData });
          const data = await res.json();
          const msgData = { content: Helpers.formatDuration(result.duration), type: 'voice', fileUrl: data.url };

          if (chatComponent.currentDM) {
            socketService.sendDM({ to: chatComponent.currentDM, ...msgData });
          } else if (this.currentRoom) {
            socketService.sendMessage({ roomId: this.currentRoom, ...msgData });
          }
        } catch {
          Helpers.showToast('خطأ في إرسال الرسالة الصوتية', 'error');
        }
      }
    });
  }

  async joinVoice() {
    if (!this.currentRoom) return;
    const success = await voiceService.joinVoice(this.currentRoom);
    if (success) {
      this.isInVoice = true;
      uiComponent.updateVoicePanel(true, [{ id: socketService.id, username: this.user.username, avatar: this.user.avatar }]);
      document.getElementById('voice-call-btn').querySelector('i').className = 'fas fa-phone-slash';
    }
  }

  leaveVoice() {
    voiceService.leaveVoice();
    this.isInVoice = false;
    uiComponent.updateVoicePanel(false);
    document.getElementById('voice-call-btn').querySelector('i').className = 'fas fa-phone';
    Helpers.showToast('غادرت المكالمة الصوتية', 'info');
  }

  // ========== UI EVENTS ==========

  bindUIEvents() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('members-toggle').addEventListener('click', () => {
      document.getElementById('members-sidebar').classList.toggle('hidden');
    });

    document.getElementById('close-members').addEventListener('click', () => {
      document.getElementById('members-sidebar').classList.add('hidden');
    });

    document.getElementById('status-select').addEventListener('change', (e) => {
      socketService.updateStatus(e.target.value);
      const dot = document.querySelector('.user-profile .status-dot');
      dot.className = `status-dot ${e.target.value}`;
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      this.logout();
    });

    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const menuBtn = document.getElementById('mobile-menu-btn');
      if (window.innerWidth <= 768 && sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  switchTab(tabName) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
  }
}

// Initialize
const app = new WChatApp();
document.addEventListener('DOMContentLoaded', () => app.init());
