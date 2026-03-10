/* ================================
   WChat - Helper Utilities
   ================================ */

const Helpers = {
  // Format time
  formatTime(date) {
    const d = new Date(date);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  },

  // Format date
  formatDate(date) {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return 'اليوم';
    if (d.toDateString() === yesterday.toDateString()) return 'أمس';
    return d.toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  },

  // Format duration (seconds)
  formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  },

  // Linkify text
  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s<]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  },

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Generate avatar URL
  getAvatar(username, color = '#6C5CE7') {
    return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}&backgroundColor=${color.replace('#', '')}`;
  },

  // Show toast notification
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
    toast.innerHTML = `<i class="fas fa-${icons[type] || icons.info}"></i> ${message}`;

    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // Generate random waveform bars for voice messages
  generateWaveform(count = 30) {
    return Array.from({ length: count }, () => Math.random() * 24 + 4);
  },

  // Debounce
  debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  // Get file icon
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
      pdf: 'file-pdf', doc: 'file-word', docx: 'file-word',
      xls: 'file-excel', xlsx: 'file-excel',
      ppt: 'file-powerpoint', pptx: 'file-powerpoint',
      zip: 'file-archive', rar: 'file-archive',
      mp3: 'file-audio', wav: 'file-audio', ogg: 'file-audio',
      mp4: 'file-video', avi: 'file-video', mov: 'file-video',
      png: 'file-image', jpg: 'file-image', jpeg: 'file-image', gif: 'file-image',
      js: 'file-code', html: 'file-code', css: 'file-code', py: 'file-code',
      txt: 'file-alt'
    };
    return icons[ext] || 'file';
  },

  // Check if file is image
  isImage(filename) {
    return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(filename);
  },

  // Emojis list
  emojis: [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊',
    '😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋',
    '😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🫡',
    '🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬',
    '🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢',
    '🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎',
    '🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳',
    '🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱',
    '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠',
    '👍','👎','👏','🙌','🤝','❤️','🔥','⭐','💯','🎉',
    '😈','💀','👻','👽','🤖','💩','🐱','🐶','🦁','🐻',
    '🌹','🌸','💐','🌈','☀️','🌙','⚡','💧','🎵','🎮'
  ]
};
