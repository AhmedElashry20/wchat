require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6 // 10MB for voice messages
});

const PORT = process.env.PORT || 3000;

// Static files
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// In-memory data store
const users = new Map();
const rooms = new Map();
const messages = new Map();
const directMessages = new Map();

// Default rooms
const defaultRooms = [
  { id: 'general', name: 'عام', icon: '💬', type: 'text' },
  { id: 'voice-lounge', name: 'صالة صوتية', icon: '🎙️', type: 'voice' },
  { id: 'gaming', name: 'ألعاب', icon: '🎮', type: 'text' },
  { id: 'music', name: 'موسيقى', icon: '🎵', type: 'voice' },
  { id: 'tech', name: 'تقنية', icon: '💻', type: 'text' }
];

defaultRooms.forEach(room => {
  rooms.set(room.id, { ...room, members: new Set(), voiceMembers: new Set() });
  messages.set(room.id, []);
});

// Socket.IO
io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);

  // User registration
  socket.on('user:register', (userData) => {
    const user = {
      id: socket.id,
      username: userData.username,
      avatar: userData.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${userData.username}`,
      status: 'online',
      joinedAt: new Date()
    };
    users.set(socket.id, user);
    io.emit('users:update', Array.from(users.values()));
    socket.emit('rooms:list', defaultRooms.map(r => ({
      ...r,
      members: rooms.get(r.id).members.size,
      voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => users.get(id)).filter(Boolean)
    })));
    console.log(`👤 ${user.username} joined`);
  });

  // Join room
  socket.on('room:join', (roomId) => {
    const room = rooms.get(roomId);
    const user = users.get(socket.id);
    if (!room || !user) return;

    // Leave previous rooms
    socket.rooms.forEach(r => {
      if (r !== socket.id) {
        socket.leave(r);
        const prevRoom = rooms.get(r);
        if (prevRoom) {
          prevRoom.members.delete(socket.id);
          prevRoom.voiceMembers.delete(socket.id);
        }
      }
    });

    socket.join(roomId);
    room.members.add(socket.id);

    const roomMessages = messages.get(roomId) || [];
    socket.emit('room:messages', { roomId, messages: roomMessages.slice(-100) });
    io.emit('rooms:update', defaultRooms.map(r => ({
      ...r,
      members: rooms.get(r.id).members.size,
      voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => users.get(id)).filter(Boolean)
    })));
  });

  // Send message
  socket.on('message:send', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const message = {
      id: uuidv4(),
      userId: socket.id,
      username: user.username,
      avatar: user.avatar,
      content: data.content,
      type: data.type || 'text', // text, voice, image, file
      fileUrl: data.fileUrl,
      fileName: data.fileName,
      roomId: data.roomId,
      timestamp: new Date(),
      reactions: {}
    };

    const roomMsgs = messages.get(data.roomId);
    if (roomMsgs) {
      roomMsgs.push(message);
      if (roomMsgs.length > 500) roomMsgs.splice(0, roomMsgs.length - 500);
    }

    io.to(data.roomId).emit('message:new', message);
  });

  // Direct message
  socket.on('dm:send', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const dmKey = [socket.id, data.to].sort().join(':');
    const message = {
      id: uuidv4(),
      from: socket.id,
      to: data.to,
      username: user.username,
      avatar: user.avatar,
      content: data.content,
      type: data.type || 'text',
      fileUrl: data.fileUrl,
      timestamp: new Date()
    };

    if (!directMessages.has(dmKey)) directMessages.set(dmKey, []);
    directMessages.get(dmKey).push(message);

    socket.emit('dm:new', message);
    io.to(data.to).emit('dm:new', message);
  });

  // Get DM history
  socket.on('dm:history', (targetId) => {
    const dmKey = [socket.id, targetId].sort().join(':');
    const history = directMessages.get(dmKey) || [];
    socket.emit('dm:messages', { targetId, messages: history.slice(-100) });
  });

  // Voice chat signaling
  socket.on('voice:join', (roomId) => {
    const room = rooms.get(roomId);
    const user = users.get(socket.id);
    if (!room || !user) return;

    room.voiceMembers.add(socket.id);
    socket.to(roomId).emit('voice:user-joined', { userId: socket.id, username: user.username });
    io.emit('rooms:update', defaultRooms.map(r => ({
      ...r,
      members: rooms.get(r.id).members.size,
      voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => users.get(id)).filter(Boolean)
    })));
  });

  socket.on('voice:leave', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.voiceMembers.delete(socket.id);
    socket.to(roomId).emit('voice:user-left', { userId: socket.id });
    io.emit('rooms:update', defaultRooms.map(r => ({
      ...r,
      members: rooms.get(r.id).members.size,
      voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => users.get(id)).filter(Boolean)
    })));
  });

  // WebRTC signaling
  socket.on('voice:offer', (data) => {
    io.to(data.to).emit('voice:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('voice:answer', (data) => {
    io.to(data.to).emit('voice:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('voice:ice-candidate', (data) => {
    io.to(data.to).emit('voice:ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  // Typing indicator
  socket.on('typing:start', (roomId) => {
    const user = users.get(socket.id);
    if (user) socket.to(roomId).emit('typing:update', { userId: socket.id, username: user.username, typing: true });
  });

  socket.on('typing:stop', (roomId) => {
    socket.to(roomId).emit('typing:update', { userId: socket.id, typing: false });
  });

  // Message reaction
  socket.on('message:react', (data) => {
    const roomMsgs = messages.get(data.roomId);
    if (!roomMsgs) return;
    const msg = roomMsgs.find(m => m.id === data.messageId);
    if (!msg) return;
    if (!msg.reactions[data.emoji]) msg.reactions[data.emoji] = [];
    const idx = msg.reactions[data.emoji].indexOf(socket.id);
    if (idx > -1) msg.reactions[data.emoji].splice(idx, 1);
    else msg.reactions[data.emoji].push(socket.id);
    io.to(data.roomId).emit('message:reacted', { messageId: data.messageId, reactions: msg.reactions });
  });

  // User status
  socket.on('user:status', (status) => {
    const user = users.get(socket.id);
    if (user) {
      user.status = status;
      io.emit('users:update', Array.from(users.values()));
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (user) console.log(`👋 ${user.username} disconnected`);
    users.delete(socket.id);
    rooms.forEach(room => {
      room.members.delete(socket.id);
      room.voiceMembers.delete(socket.id);
    });
    io.emit('users:update', Array.from(users.values()));
    io.emit('rooms:update', defaultRooms.map(r => ({
      ...r,
      members: rooms.get(r.id).members.size,
      voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => users.get(id)).filter(Boolean)
    })));
  });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║         🚀 WChat Server             ║
║    Running on port ${PORT}              ║
║    http://localhost:${PORT}             ║
╚══════════════════════════════════════╝
  `);
});
