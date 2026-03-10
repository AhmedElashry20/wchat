require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 10e6
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'wchat_secret_key_2024';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ============ DATABASE (In-Memory) ============
const registeredUsers = new Map(); // username -> { username, password, email, avatar, createdAt }
const onlineUsers = new Map();     // socketId -> user data
const rooms = new Map();
const messages = new Map();
const directMessages = new Map();

// ============ AUTH API ============

// Register
app.post('/api/register', async (req, res) => {
  const { username, password, email, avatar } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  }

  // Check duplicate username
  if (registeredUsers.has(username.toLowerCase())) {
    return res.status(400).json({ error: 'اسم المستخدم مستخدم بالفعل' });
  }

  // Check duplicate email
  if (email) {
    const emailExists = Array.from(registeredUsers.values()).some(u => u.email === email.toLowerCase());
    if (emailExists) {
      return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Save user
  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    email: email ? email.toLowerCase() : null,
    avatar: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${username}`,
    createdAt: new Date()
  };

  registeredUsers.set(username.toLowerCase(), user);

  // Generate token
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

  console.log(`📝 New user registered: ${username}`);
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, avatar: user.avatar, email: user.email }
  });
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبين' });
  }

  const user = registeredUsers.get(username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

  console.log(`🔑 User logged in: ${username}`);
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, avatar: user.avatar, email: user.email }
  });
});

// Verify token
app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = registeredUsers.get(decoded.username.toLowerCase());
    if (!user) return res.status(401).json({ error: 'المستخدم غير موجود' });
    res.json({ user: { id: user.id, username: user.username, avatar: user.avatar, email: user.email } });
  } catch {
    res.status(401).json({ error: 'جلسة منتهية، سجل دخول مرة أخرى' });
  }
});

// Check username availability
app.get('/api/check-username/:username', (req, res) => {
  const exists = registeredUsers.has(req.params.username.toLowerCase());
  res.json({ available: !exists });
});

// File upload
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

// ============ ROOMS ============
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

function getRoomsList() {
  return defaultRooms.map(r => ({
    ...r,
    members: rooms.get(r.id).members.size,
    voiceMembers: Array.from(rooms.get(r.id).voiceMembers).map(id => onlineUsers.get(id)).filter(Boolean)
  }));
}

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log(`✅ Connected: ${socket.id}`);

  // Authenticate socket with token
  socket.on('auth:token', (data) => {
    try {
      const decoded = jwt.verify(data.token, JWT_SECRET);
      const dbUser = registeredUsers.get(decoded.username.toLowerCase());
      if (!dbUser) return socket.emit('auth:error', 'المستخدم غير موجود');

      const user = {
        id: socket.id,
        odId: dbUser.id,
        username: dbUser.username,
        avatar: dbUser.avatar,
        status: 'online',
        joinedAt: new Date()
      };

      onlineUsers.set(socket.id, user);
      socket.emit('auth:success', user);
      io.emit('users:update', Array.from(onlineUsers.values()));
      socket.emit('rooms:list', getRoomsList());
      console.log(`👤 ${user.username} authenticated`);
    } catch {
      socket.emit('auth:error', 'جلسة منتهية');
    }
  });

  // Join room
  socket.on('room:join', (roomId) => {
    const room = rooms.get(roomId);
    const user = onlineUsers.get(socket.id);
    if (!room || !user) return;

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
    io.emit('rooms:update', getRoomsList());
  });

  // Send message
  socket.on('message:send', (data) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const message = {
      id: uuidv4(),
      userId: socket.id,
      username: user.username,
      avatar: user.avatar,
      content: data.content,
      type: data.type || 'text',
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
    const user = onlineUsers.get(socket.id);
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

  socket.on('dm:history', (targetId) => {
    const dmKey = [socket.id, targetId].sort().join(':');
    const history = directMessages.get(dmKey) || [];
    socket.emit('dm:messages', { targetId, messages: history.slice(-100) });
  });

  // Voice
  socket.on('voice:join', (roomId) => {
    const room = rooms.get(roomId);
    const user = onlineUsers.get(socket.id);
    if (!room || !user) return;
    room.voiceMembers.add(socket.id);
    socket.to(roomId).emit('voice:user-joined', { userId: socket.id, username: user.username });
    io.emit('rooms:update', getRoomsList());
  });

  socket.on('voice:leave', (roomId) => {
    const room = rooms.get(roomId);
    if (!room) return;
    room.voiceMembers.delete(socket.id);
    socket.to(roomId).emit('voice:user-left', { userId: socket.id });
    io.emit('rooms:update', getRoomsList());
  });

  socket.on('voice:offer', (data) => {
    io.to(data.to).emit('voice:offer', { from: socket.id, offer: data.offer });
  });

  socket.on('voice:answer', (data) => {
    io.to(data.to).emit('voice:answer', { from: socket.id, answer: data.answer });
  });

  socket.on('voice:ice-candidate', (data) => {
    io.to(data.to).emit('voice:ice-candidate', { from: socket.id, candidate: data.candidate });
  });

  // Typing
  socket.on('typing:start', (roomId) => {
    const user = onlineUsers.get(socket.id);
    if (user) socket.to(roomId).emit('typing:update', { userId: socket.id, username: user.username, typing: true });
  });

  socket.on('typing:stop', (roomId) => {
    socket.to(roomId).emit('typing:update', { userId: socket.id, typing: false });
  });

  // Reaction
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

  // Status
  socket.on('user:status', (status) => {
    const user = onlineUsers.get(socket.id);
    if (user) {
      user.status = status;
      io.emit('users:update', Array.from(onlineUsers.values()));
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (user) console.log(`👋 ${user.username} disconnected`);
    onlineUsers.delete(socket.id);
    rooms.forEach(room => {
      room.members.delete(socket.id);
      room.voiceMembers.delete(socket.id);
    });
    io.emit('users:update', Array.from(onlineUsers.values()));
    io.emit('rooms:update', getRoomsList());
  });
});

// ============ GET LOCAL IP ============
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ============ START SERVER ============
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`
╔═══════════════════════════════════════════════╗
║            🚀 WChat Server                    ║
║                                               ║
║  💻 Local:   http://localhost:${PORT}            ║
║  📱 Phone:   http://${localIP}:${PORT}       ║
║                                               ║
║  👥 Registered users: ${registeredUsers.size}                    ║
╚═══════════════════════════════════════════════╝
  `);
});
