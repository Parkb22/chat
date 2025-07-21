// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3001;

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Chatroom with Solana wallet authentication

let numUsers = 0;
// Store wallet-to-username mappings
const walletUserMap = new Map();
// Store active socket connections with their wallet info
const activeSockets = new Map();

// Helper function to validate Solana wallet address
const isValidSolanaAddress = (address) => {
  // Basic validation - Solana addresses are typically 32-44 characters long
  return typeof address === 'string' && address.length >= 32 && address.length <= 44;
};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // When client wants to check if user exists for a wallet
  socket.on('check user', (walletAddress) => {
    console.log('Checking user for wallet:', walletAddress);
    
    if (!isValidSolanaAddress(walletAddress)) {
      socket.emit('error', 'Invalid wallet address');
      return;
    }

    if (walletUserMap.has(walletAddress)) {
      const username = walletUserMap.get(walletAddress);
      socket.emit('user exists', { username });
    } else {
      socket.emit('user new');
    }
  });

  // When the client emits 'add user', this listens and executes
  socket.on('add user', (userData) => {
    console.log('Add user request:', userData);
    
    if (!userData || !userData.walletAddress || !userData.username) {
      socket.emit('error', 'Missing wallet address or username');
      return;
    }

    const { walletAddress, username } = userData;

    if (!isValidSolanaAddress(walletAddress)) {
      socket.emit('error', 'Invalid wallet address');
      return;
    }

    // Check if this socket is already authenticated
    if (activeSockets.has(socket.id)) {
      console.log('Socket already authenticated:', socket.id);
      return;
    }

    // Check if wallet already has a different username
    if (walletUserMap.has(walletAddress) && walletUserMap.get(walletAddress) !== username) {
      // Wallet already has a username, use the existing one
      const existingUsername = walletUserMap.get(walletAddress);
      socket.username = existingUsername;
      socket.walletAddress = walletAddress;
    } else {
      // New wallet or same username, store/update the mapping
      walletUserMap.set(walletAddress, username);
      socket.username = username;
      socket.walletAddress = walletAddress;
    }

    // Store socket info
    activeSockets.set(socket.id, {
      username: socket.username,
      walletAddress: socket.walletAddress
    });

    ++numUsers;
    
    console.log(`User ${socket.username} (${socket.walletAddress}) joined. Total users: ${numUsers}`);

    socket.emit('login', {
      numUsers: numUsers
    });

    // Echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers
    });
  });

  // When the client emits 'new message', this listens and executes
  socket.on('new message', (data) => {
    if (!socket.username || !socket.walletAddress) {
      socket.emit('error', 'Not authenticated');
      return;
    }

    console.log(`Message from ${socket.username}: ${data}`);
    
    // We tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });

  // When the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    if (!socket.username) return;
    
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // When the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    if (!socket.username) return;
    
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // When the user disconnects.. perform this
  socket.on('disconnect', () => {
    console.log('Disconnect:', socket.id);
    
    if (activeSockets.has(socket.id)) {
      const userInfo = activeSockets.get(socket.id);
      activeSockets.delete(socket.id);
      --numUsers;

      console.log(`User ${userInfo.username} (${userInfo.walletAddress}) left. Total users: ${numUsers}`);

      // Echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: userInfo.username,
        numUsers: numUsers
      });
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
