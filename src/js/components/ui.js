/* ================================
   WChat - UI Component
   ================================ */

class UIComponent {
  constructor() {
    this.rooms = [];
    this.users = [];
    this.dmUsers = new Set();
  }

  // Update rooms list
  updateRooms(rooms) {
    this.rooms = rooms;
    const textContainer = document.getElementById('text-rooms');
    const voiceContainer = document.getElementById('voice-rooms');

    textContainer.innerHTML = '';
    voiceContainer.innerHTML = '';

    rooms.forEach(room => {
      const container = room.type === 'voice' ? voiceContainer : textContainer;
      const isActive = chatComponent.currentRoom === room.id;

      let voiceMembersHtml = '';
      if (room.type === 'voice' && room.voiceMembers && room.voiceMembers.length > 0) {
        voiceMembersHtml = `<div class="room-voice-members">
          ${room.voiceMembers.map(u => `
            <div class="room-voice-member">
              <img src="${u.avatar}" alt="">
              <span>${Helpers.escapeHtml(u.username)}</span>
            </div>
          `).join('')}
        </div>`;
      }

      container.innerHTML += `
        <div class="room-item ${isActive ? 'active' : ''}" onclick="app.joinRoom('${room.id}')">
          <span class="room-icon">${room.icon}</span>
          <span class="room-name">${Helpers.escapeHtml(room.name)}</span>
          ${room.members > 0 ? `<span class="room-count">${room.members}</span>` : ''}
        </div>
        ${voiceMembersHtml}`;
    });
  }

  // Update users list
  updateUsers(users) {
    this.users = users;
    const container = document.getElementById('users-list');
    const roomMembers = document.getElementById('room-members');

    // Sort: online first
    const sorted = [...users].sort((a, b) => {
      const order = { online: 0, away: 1, busy: 2, offline: 3 };
      return (order[a.status] || 3) - (order[b.status] || 3);
    });

    const renderUser = (user) => `
      <div class="user-item" onclick="app.openDM('${user.id}')">
        <div class="user-item-avatar">
          <img src="${user.avatar}" alt="${Helpers.escapeHtml(user.username)}">
          <span class="status-dot ${user.status}"></span>
        </div>
        <span class="user-item-name">${Helpers.escapeHtml(user.username)}</span>
        <span class="user-item-status">${this.getStatusText(user.status)}</span>
      </div>`;

    container.innerHTML = sorted.map(renderUser).join('');
    roomMembers.innerHTML = sorted.map(renderUser).join('');

    // Update DM list
    this.updateDMList();
  }

  // Update DM list
  updateDMList() {
    const container = document.getElementById('dm-list');
    if (this.dmUsers.size === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">
          <i class="fas fa-envelope" style="font-size:24px; margin-bottom:8px; display:block;"></i>
          لا توجد محادثات خاصة<br>اضغط على عضو لبدء محادثة
        </div>`;
      return;
    }

    container.innerHTML = '';
    this.dmUsers.forEach(userId => {
      const user = this.users.find(u => u.id === userId);
      if (!user) return;
      const isActive = chatComponent.currentDM === userId;
      container.innerHTML += `
        <div class="dm-item ${isActive ? 'active' : ''}" onclick="app.openDM('${userId}')">
          <img src="${user.avatar}" alt="">
          <div class="dm-item-info">
            <div class="dm-item-name">${Helpers.escapeHtml(user.username)}</div>
            <div class="dm-item-preview">محادثة خاصة</div>
          </div>
        </div>`;
    });
  }

  // Get status text
  getStatusText(status) {
    const texts = { online: 'متصل', away: 'بالخارج', busy: 'مشغول', offline: 'غير متصل' };
    return texts[status] || 'غير متصل';
  }

  // Update voice panel
  updateVoicePanel(show, members = []) {
    const panel = document.getElementById('voice-panel');
    const membersContainer = document.getElementById('voice-members');

    if (show) {
      panel.classList.remove('hidden');
      membersContainer.innerHTML = members.map(m => `
        <div class="voice-member" id="voice-member-${m.id}">
          <div class="voice-member-avatar">
            <img src="${m.avatar}" alt="${Helpers.escapeHtml(m.username)}">
          </div>
          <span class="voice-member-name">${Helpers.escapeHtml(m.username)}</span>
        </div>`).join('');
    } else {
      panel.classList.add('hidden');
    }
  }

  // Setup emoji picker
  setupEmojiPicker() {
    const grid = document.getElementById('emoji-grid');
    grid.innerHTML = Helpers.emojis.map(emoji =>
      `<span class="emoji-item" onclick="app.insertEmoji('${emoji}')">${emoji}</span>`
    ).join('');
  }

  // Filter users
  filterUsers(query) {
    const items = document.querySelectorAll('#users-list .user-item');
    items.forEach(item => {
      const name = item.querySelector('.user-item-name').textContent.toLowerCase();
      item.style.display = name.includes(query.toLowerCase()) ? '' : 'none';
    });
  }
}

const uiComponent = new UIComponent();
