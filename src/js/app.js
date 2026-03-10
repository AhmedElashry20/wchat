/* ================================
   WChat - Main Application
   ================================ */

class WChatApp {
  constructor() {
    this.user = null;
    this.currentRoom = null;
    this.selectedColor = '#6C5CE7';
    this.isInVoice = false;
    this.typingTimeout = null;
  }

  init() {
    this.bindLoginEvents();
    this.bindChatEvents();
    this.bindVoiceEvents();
    this.bindUIEvents();
    uiComponent.setupEmojiPicker();
  }

  // ========== LOGIN ==========

  bindLoginEvents() {
    // Avatar color picker
    document.querySelectorAll('.avatar-color').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.avatar-color').forEach(c => c.classList.remove('selected'));
        el.classList.add('selected');
        this.selectedColor = el.dataset.color;
      });
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('username-input').value.trim();
      if (!username) return;
      this.login(username);
    });
  }

  login(username) {
    this.user = {
      username,
      avatar: Helpers.getAvatar(username, this.selectedColor)
    };

    socketService.connect();
    socketService.on('_connected', () => {
      socketService.register(this.user);
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      document.getElementById('my-username').textContent = username;
      document.getElementById('my-avatar').src = this.user.avatar;
      Helpers.showToast(`مرحباً ${username}!`, 'success');
    });

    this.setupSocketListeners();
  }

  // ========== SOCKET LISTENERS ==========

  setupSocketListeners() {
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
        chatComponent.appendMessage({
          ...msg,
          userId: msg.from,
          id: msg.id
        });
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
      if (this.isInVoice) {
        await voiceService.handleUserJoined(data.userId);
      }
    });

    socketService.on('voice:user-left', (data) => {
      voiceService.handleUserLeft(data.userId);
    });

    socketService.on('voice:offer', async (data) => {
      if (this.isInVoice) {
        await voiceService.handleOffer(data.from, data.offer);
      }
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

    // Voice call button
    const voiceBtn = document.getElementById('voice-call-btn');
    if (room && room.type === 'voice') {
      voiceBtn.classList.remove('hidden');
    }

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');

    // Update active state
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    uiComponent.updateRooms(uiComponent.rooms);
  }

  // Open DM
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

    // Switch to DMs tab
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

    // Send message
    const sendMessage = () => {
      const content = input.value.trim();
      if (!content) return;

      if (chatComponent.currentDM) {
        socketService.sendDM({
          to: chatComponent.currentDM,
          content,
          type: 'text'
        });
      } else if (this.currentRoom) {
        socketService.sendMessage({
          roomId: this.currentRoom,
          content,
          type: 'text'
        });
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

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';

      // Typing indicator
      if (this.currentRoom) {
        socketService.startTyping(this.currentRoom);
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          socketService.stopTyping(this.currentRoom);
        }, 2000);
      }
    });

    // File attach
    attachBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await this.uploadAndSend(file);
      fileInput.value = '';
    });

    // Emoji picker
    emojiBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      emojiPicker.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add('hidden');
      }
    });

    // User search
    document.getElementById('user-search').addEventListener('input', (e) => {
      uiComponent.filterUsers(e.target.value);
    });
  }

  // Upload file and send
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
      const msgData = {
        content: file.name,
        type,
        fileUrl: data.url,
        fileName: data.name
      };

      if (chatComponent.currentDM) {
        socketService.sendDM({ to: chatComponent.currentDM, ...msgData });
      } else if (this.currentRoom) {
        socketService.sendMessage({ roomId: this.currentRoom, ...msgData });
      }
    } catch (err) {
      Helpers.showToast('خطأ في رفع الملف', 'error');
    }
  }

  // Insert emoji
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

    // Join/leave voice
    voiceCallBtn.addEventListener('click', async () => {
      if (this.isInVoice) {
        this.leaveVoice();
      } else {
        await this.joinVoice();
      }
    });

    // Mute
    muteBtn.addEventListener('click', () => {
      const muted = voiceService.toggleMute();
      muteBtn.classList.toggle('active', muted);
      muteBtn.querySelector('i').className = muted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
    });

    // Deafen
    deafenBtn.addEventListener('click', () => {
      const deafened = voiceService.toggleDeafen();
      deafenBtn.classList.toggle('active', deafened);
      deafenBtn.querySelector('i').className = deafened ? 'fas fa-volume-mute' : 'fas fa-headphones';
      if (deafened) {
        muteBtn.classList.add('active');
        muteBtn.querySelector('i').className = 'fas fa-microphone-slash';
      }
    });

    // Leave voice
    leaveBtn.addEventListener('click', () => this.leaveVoice());

    // Voice recording
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
        // Upload voice message
        const file = new File([result.blob], 'voice-message.webm', { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('file', file);

        try {
          const res = await fetch('/upload', { method: 'POST', body: formData });
          const data = await res.json();

          const msgData = {
            content: Helpers.formatDuration(result.duration),
            type: 'voice',
            fileUrl: data.url,
          };

          if (chatComponent.currentDM) {
            socketService.sendDM({ to: chatComponent.currentDM, ...msgData });
          } else if (this.currentRoom) {
            socketService.sendMessage({ roomId: this.currentRoom, ...msgData });
          }
        } catch (err) {
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
      uiComponent.updateVoicePanel(true, [{ id: socketService.id, ...this.user }]);
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
    // Tab switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
    });

    // Mobile menu
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    // Members toggle
    document.getElementById('members-toggle').addEventListener('click', () => {
      document.getElementById('members-sidebar').classList.toggle('hidden');
    });

    document.getElementById('close-members').addEventListener('click', () => {
      document.getElementById('members-sidebar').classList.add('hidden');
    });

    // Status change
    document.getElementById('status-select').addEventListener('change', (e) => {
      socketService.updateStatus(e.target.value);
      const dot = document.querySelector('.user-profile .status-dot');
      dot.className = `status-dot ${e.target.value}`;
    });

    // Close sidebar on outside click (mobile)
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
