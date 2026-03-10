/* ================================
   WChat - Chat Component
   ================================ */

class ChatComponent {
  constructor() {
    this.currentRoom = null;
    this.currentDM = null;
    this.messagesArea = document.getElementById('messages-area');
    this.lastMessageUser = null;
    this.lastMessageDate = null;
  }

  // Render messages for a room
  renderMessages(messages) {
    this.messagesArea.innerHTML = '';
    this.lastMessageUser = null;
    this.lastMessageDate = null;

    if (messages.length === 0) {
      this.messagesArea.innerHTML = `
        <div class="welcome-message">
          <div class="welcome-icon">💬</div>
          <h2>لا توجد رسائل بعد</h2>
          <p>كن أول من يرسل رسالة!</p>
        </div>`;
      return;
    }

    messages.forEach(msg => this.appendMessage(msg, false));
    this.scrollToBottom();
  }

  // Append a single message
  appendMessage(msg, scroll = true) {
    const msgDate = Helpers.formatDate(msg.timestamp);
    if (msgDate !== this.lastMessageDate) {
      this.lastMessageDate = msgDate;
      const separator = document.createElement('div');
      separator.className = 'date-separator';
      separator.textContent = msgDate;
      this.messagesArea.appendChild(separator);
    }

    // Remove welcome message
    const welcome = this.messagesArea.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const isCompact = this.lastMessageUser === msg.userId;
    this.lastMessageUser = msg.userId;

    const div = document.createElement('div');
    div.className = `message ${isCompact ? 'compact' : ''}`;
    div.dataset.messageId = msg.id;

    let contentHtml = '';
    switch (msg.type) {
      case 'voice':
        const bars = Helpers.generateWaveform();
        contentHtml = `
          <div class="voice-message">
            <button class="voice-message-btn" onclick="chatComponent.playVoice(this, '${Helpers.escapeHtml(msg.fileUrl)}')">
              <i class="fas fa-play"></i>
            </button>
            <div class="voice-waveform">
              ${bars.map(h => `<div class="bar" style="height:${h}px"></div>`).join('')}
            </div>
            <span class="voice-duration">${msg.content || '0:00'}</span>
          </div>`;
        break;

      case 'image':
        contentHtml = `<img class="message-image" src="${Helpers.escapeHtml(msg.fileUrl)}" alt="صورة" onclick="window.open('${Helpers.escapeHtml(msg.fileUrl)}')">`;
        break;

      case 'file':
        contentHtml = `
          <a class="file-message" href="${Helpers.escapeHtml(msg.fileUrl)}" download="${Helpers.escapeHtml(msg.fileName || 'file')}">
            <div class="file-icon"><i class="fas fa-${Helpers.getFileIcon(msg.fileName || '')}"></i></div>
            <div class="file-info">
              <div class="file-name">${Helpers.escapeHtml(msg.fileName || 'ملف')}</div>
              <div class="file-size">اضغط للتحميل</div>
            </div>
          </a>`;
        break;

      default:
        contentHtml = `<div class="message-content">${Helpers.linkify(Helpers.escapeHtml(msg.content))}</div>`;
    }

    // Reactions
    let reactionsHtml = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      reactionsHtml = '<div class="message-reactions">';
      for (const [emoji, userIds] of Object.entries(msg.reactions)) {
        if (userIds.length === 0) continue;
        const isMine = userIds.includes(socketService.id);
        reactionsHtml += `
          <span class="reaction ${isMine ? 'mine' : ''}" onclick="chatComponent.react('${msg.id}', '${emoji}')">
            ${emoji} <span class="reaction-count">${userIds.length}</span>
          </span>`;
      }
      reactionsHtml += '</div>';
    }

    div.innerHTML = `
      <img class="message-avatar" src="${msg.avatar}" alt="${Helpers.escapeHtml(msg.username)}">
      <div class="message-body">
        <div class="message-header">
          <span class="message-username">${Helpers.escapeHtml(msg.username)}</span>
          <span class="message-time">${Helpers.formatTime(msg.timestamp)}</span>
        </div>
        ${contentHtml}
        ${reactionsHtml}
      </div>
      <div class="message-actions">
        <button class="msg-action-btn" onclick="chatComponent.showReactionPicker('${msg.id}')" title="تفاعل">
          <i class="fas fa-smile"></i>
        </button>
      </div>`;

    this.messagesArea.appendChild(div);
    if (scroll) this.scrollToBottom();
  }

  // Update reactions on a message
  updateReactions(messageId, reactions) {
    const msgEl = this.messagesArea.querySelector(`[data-message-id="${messageId}"]`);
    if (!msgEl) return;

    let container = msgEl.querySelector('.message-reactions');
    if (!container) {
      container = document.createElement('div');
      container.className = 'message-reactions';
      msgEl.querySelector('.message-body').appendChild(container);
    }

    container.innerHTML = '';
    for (const [emoji, userIds] of Object.entries(reactions)) {
      if (userIds.length === 0) continue;
      const isMine = userIds.includes(socketService.id);
      container.innerHTML += `
        <span class="reaction ${isMine ? 'mine' : ''}" onclick="chatComponent.react('${messageId}', '${emoji}')">
          ${emoji} <span class="reaction-count">${userIds.length}</span>
        </span>`;
    }
  }

  // React to message
  react(messageId, emoji) {
    const roomId = this.currentRoom || this.currentDM;
    if (roomId) {
      socketService.reactToMessage({ messageId, emoji, roomId });
    }
  }

  // Show quick reaction picker
  showReactionPicker(messageId) {
    const quickEmojis = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
    const existing = document.querySelector('.quick-reactions');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.className = 'quick-reactions';
    picker.style.cssText = `
      position: fixed; z-index: 100; background: var(--bg-card);
      border: 1px solid var(--border); border-radius: 24px;
      padding: 6px 10px; display: flex; gap: 4px;
      box-shadow: var(--shadow-lg);
    `;

    quickEmojis.forEach(emoji => {
      const btn = document.createElement('span');
      btn.style.cssText = 'cursor:pointer; font-size:20px; padding:4px; border-radius:50%; transition:all 0.2s;';
      btn.textContent = emoji;
      btn.onmouseenter = () => btn.style.transform = 'scale(1.3)';
      btn.onmouseleave = () => btn.style.transform = 'scale(1)';
      btn.onclick = () => {
        this.react(messageId, emoji);
        picker.remove();
      };
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);

    // Position near the message
    const msgEl = this.messagesArea.querySelector(`[data-message-id="${messageId}"]`);
    if (msgEl) {
      const rect = msgEl.getBoundingClientRect();
      picker.style.top = `${rect.top - 50}px`;
      picker.style.left = `${rect.left + 60}px`;
    }

    setTimeout(() => {
      const close = (e) => {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 10);
  }

  // Play voice message
  playVoice(btn, url) {
    const icon = btn.querySelector('i');
    const audio = new Audio(url);

    icon.className = 'fas fa-pause';
    audio.play();

    audio.onended = () => {
      icon.className = 'fas fa-play';
    };

    btn.onclick = () => {
      if (audio.paused) {
        audio.play();
        icon.className = 'fas fa-pause';
      } else {
        audio.pause();
        icon.className = 'fas fa-play';
      }
    };
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesArea.scrollTop = this.messagesArea.scrollHeight;
    });
  }
}

const chatComponent = new ChatComponent();
