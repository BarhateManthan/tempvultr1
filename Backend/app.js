const express = require('express');
const cors = require('cors');  
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const repRoutes = require('./routes/repRoutes');
require('dotenv').config();
const tokenRoutes = require('./videoCall/tokenService');
const transcriptionRoutes = require('./videoCall/transcriptionService');
require('./videoCall/socketService'); // Initializes socket server
const app = express();
const PORT = process.env.PORT || 3000;
const http = require('http');
const { Server } = require('socket.io');
// Middleware
app.use(express.json());

const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Unified CORS for all routes
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

// Socket connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-channel', (channelName) => {
    socket.join(channelName);
  });
  
  socket.on('transcription', (data) => {
    if (data.channelName) {
      io.to(data.channelName).emit('transcription', data);
    }
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/representative', repRoutes);
app.use('/api/video', tokenRoutes);
app.use('/api', transcriptionRoutes);

// Start unified server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});