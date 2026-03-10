/* ================================
   WChat - Voice Chat Service
   ================================ */

class VoiceService {
  constructor() {
    this.localStream = null;
    this.peerConnections = {};
    this.isMuted = false;
    this.isDeafened = false;
    this.currentRoom = null;
    this.timerInterval = null;
    this.timerSeconds = 0;

    // Recording
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordingTimer = null;
    this.recordingSeconds = 0;
  }

  // ICE servers config
  get iceConfig() {
    return {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
  }

  // Join voice channel
  async joinVoice(roomId) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.currentRoom = roomId;
      socketService.joinVoice(roomId);
      this.startTimer();

      Helpers.showToast('تم الانضمام للمكالمة الصوتية', 'success');
      return true;
    } catch (err) {
      console.error('Voice join error:', err);
      Helpers.showToast('لا يمكن الوصول للميكروفون', 'error');
      return false;
    }
  }

  // Leave voice channel
  leaveVoice() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    Object.values(this.peerConnections).forEach(pc => pc.close());
    this.peerConnections = {};

    if (this.currentRoom) {
      socketService.leaveVoice(this.currentRoom);
      this.currentRoom = null;
    }

    this.stopTimer();
    this.isMuted = false;
    this.isDeafened = false;
  }

  // Create peer connection
  createPeerConnection(userId) {
    const pc = new RTCPeerConnection(this.iceConfig);

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.sendIceCandidate({ to: userId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      const audioEl = document.createElement('audio');
      audioEl.srcObject = event.streams[0];
      audioEl.autoplay = true;
      audioEl.id = `audio-${userId}`;
      const container = document.getElementById('audio-container');
      const existing = container.querySelector(`#audio-${userId}`);
      if (existing) existing.remove();
      container.appendChild(audioEl);
    };

    this.peerConnections[userId] = pc;
    return pc;
  }

  // Handle new user joining voice
  async handleUserJoined(userId) {
    const pc = this.createPeerConnection(userId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketService.sendVoiceOffer({ to: userId, offer });
  }

  // Handle offer
  async handleOffer(userId, offer) {
    const pc = this.createPeerConnection(userId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketService.sendVoiceAnswer({ to: userId, answer });
  }

  // Handle answer
  async handleAnswer(userId, answer) {
    const pc = this.peerConnections[userId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // Handle ICE candidate
  async handleIceCandidate(userId, candidate) {
    const pc = this.peerConnections[userId];
    if (pc) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // Handle user left
  handleUserLeft(userId) {
    const pc = this.peerConnections[userId];
    if (pc) {
      pc.close();
      delete this.peerConnections[userId];
    }
    const audioEl = document.getElementById(`audio-${userId}`);
    if (audioEl) audioEl.remove();
  }

  // Toggle mute
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    return this.isMuted;
  }

  // Toggle deafen
  toggleDeafen() {
    this.isDeafened = !this.isDeafened;
    const container = document.getElementById('audio-container');
    container.querySelectorAll('audio').forEach(audio => {
      audio.muted = this.isDeafened;
    });
    if (this.isDeafened && !this.isMuted) this.toggleMute();
    return this.isDeafened;
  }

  // Timer
  startTimer() {
    this.timerSeconds = 0;
    this.timerInterval = setInterval(() => {
      this.timerSeconds++;
      const el = document.getElementById('voice-timer');
      if (el) el.textContent = Helpers.formatDuration(this.timerSeconds);
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
    this.timerSeconds = 0;
  }

  // Voice recording for voice messages
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.recordedChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };

      this.mediaRecorder.start(100);
      this.recordingSeconds = 0;
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds++;
        const el = document.getElementById('recording-time');
        if (el) el.textContent = Helpers.formatDuration(this.recordingSeconds);
      }, 1000);

      return true;
    } catch (err) {
      console.error('Recording error:', err);
      Helpers.showToast('لا يمكن الوصول للميكروفون', 'error');
      return false;
    }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
        clearInterval(this.recordingTimer);
        resolve({ blob, duration: this.recordingSeconds });
      };

      this.mediaRecorder.stop();
    });
  }

  cancelRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    clearInterval(this.recordingTimer);
    this.recordedChunks = [];
  }
}

const voiceService = new VoiceService();
