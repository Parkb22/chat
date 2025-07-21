// Setup basic express server
const express = require('express');
const app = express();
const path = require('path');
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const port = process.env.PORT || 3001;

// For signature verification
const nacl = require('tweetnacl');
const bs58 = require('bs58');

server.listen(port, () => {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

// Serve landing page as the default
app.get('/', (req, res) => {
  res.redirect('/landing.html');
});

// Serve the full-page chat interface
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Chatroom with Solana wallet authentication

let numUsers = 0;
// Store wallet-to-username mappings
const walletUserMap = new Map();
// Store active socket connections with their wallet info
const activeSockets = new Map();

// Admin system
const ADMIN_WALLET = 'DhNPBXAgDtPwSTeEMcHxGtFLCdx1F8NU9hBdYxzu7W8U';
const mutedUsers = new Set();
const deletedMessages = new Set();

// Helper function to check if user is admin
const isAdmin = (walletAddress) => {
  return walletAddress === ADMIN_WALLET;
};

// Helper function to validate Solana wallet address
const isValidSolanaAddress = (address) => {
  // Basic validation - Solana addresses are typically 32-44 characters long
  return typeof address === 'string' && address.length >= 32 && address.length <= 44;
};

// Helper function to verify Solana wallet signature
const verifySignature = (message, signature, publicKey) => {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = new Uint8Array(signature);
    const publicKeyBytes = bs58.decode(publicKey);
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // When client wants to check if user exists for a wallet
  socket.on('check user', (data) => {
    console.log('Checking user for wallet with signature verification');
    
    if (!data || !data.walletAddress || !data.signature || !data.message) {
      socket.emit('error', 'Missing authentication data');
      return;
    }

    const { walletAddress, signature, message, timestamp } = data;

    if (!isValidSolanaAddress(walletAddress)) {
      socket.emit('error', 'Invalid wallet address');
      return;
    }

    // Verify timestamp is recent (within 5 minutes)
    const currentTime = Date.now();
    if (currentTime - timestamp > 5 * 60 * 1000) {
      socket.emit('error', 'Authentication expired, please reconnect');
      return;
    }

    // Verify the signature
    if (!verifySignature(message, signature, walletAddress)) {
      socket.emit('error', 'Invalid signature - authentication failed');
      return;
    }

    console.log('Signature verified for wallet:', walletAddress);

    // Store authentication data temporarily
    socket.tempAuth = { walletAddress, verified: true };

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

    // Check if socket has valid temporary authentication
    if (!socket.tempAuth || !socket.tempAuth.verified || socket.tempAuth.walletAddress !== walletAddress) {
      socket.emit('error', 'Authentication required - please reconnect wallet');
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
      walletAddress: socket.walletAddress,
      isAdmin: isAdmin(socket.walletAddress)
    });

    // Clear temporary authentication data
    delete socket.tempAuth;

    ++numUsers;
    
    console.log(`User ${socket.username} (${socket.walletAddress}) joined. Total users: ${numUsers}${isAdmin(socket.walletAddress) ? ' [ADMIN]' : ''}`);

    socket.emit('login', {
      numUsers: numUsers,
      isAdmin: isAdmin(socket.walletAddress)
    });

    // Echo globally (all clients) that a person has connected
    socket.broadcast.emit('user joined', {
      username: socket.username,
      numUsers: numUsers,
      walletAddress: socket.walletAddress,
      isAdmin: isAdmin(socket.walletAddress)
    });
  });

  // Handle user disconnect request
  socket.on('disconnect user', () => {
    console.log('User requested disconnect:', socket.id);
    
    if (activeSockets.has(socket.id)) {
      const userInfo = activeSockets.get(socket.id);
      activeSockets.delete(socket.id);
      --numUsers;

      console.log(`User ${userInfo.username} (${userInfo.walletAddress}) disconnected. Total users: ${numUsers}`);

      // Echo globally that this client has left
      socket.broadcast.emit('user left', {
        username: userInfo.username,
        numUsers: numUsers
      });

      // Clear socket authentication data
      delete socket.username;
      delete socket.walletAddress;
      delete socket.tempAuth;
    }
  });

  // When the client emits 'new message', this listens and executes
  socket.on('new message', (messageData) => {
    if (!socket.username || !socket.walletAddress) {
      socket.emit('error', 'Not authenticated');
      return;
    }

    // Check if user is muted
    if (mutedUsers.has(socket.walletAddress)) {
      socket.emit('error', 'You are muted and cannot send messages');
      return;
    }

    const message = typeof messageData === 'string' ? messageData : messageData.message;
    const replyTo = messageData.replyTo || null;

    console.log(`Message from ${socket.username} (${socket.walletAddress}): ${message}`);
    
    // Check for @mentions in the message
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(message)) !== null) {
      mentions.push(match[1]);
    }

    // Generate unique message ID
    const messageId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    // Broadcast message with mention data
    const broadcastData = {
      username: socket.username,
      message: message,
      walletAddress: socket.walletAddress,
      replyTo: replyTo,
      mentions: mentions,
      messageId: messageId,
      timestamp: new Date(),
      isAdmin: isAdmin(socket.walletAddress)
    };

    // Send to all other users
    socket.broadcast.emit('new message', broadcastData);
    
    // Log mentions for potential future notification system
    if (mentions.length > 0) {
      console.log(`User ${socket.username} mentioned: ${mentions.join(', ')}`);
    }
  });

  // Admin: Delete message
  socket.on('delete message', (messageId) => {
    if (!isAdmin(socket.walletAddress)) {
      socket.emit('error', 'Admin privileges required');
      return;
    }

    deletedMessages.add(messageId);
    console.log(`Admin ${socket.username} deleted message: ${messageId}`);
    
    // Broadcast deletion to all clients
    io.emit('message deleted', { messageId });
  });

  // Admin: Mute user
  socket.on('mute user', (targetWalletAddress) => {
    if (!isAdmin(socket.walletAddress)) {
      socket.emit('error', 'Admin privileges required');
      return;
    }

    mutedUsers.add(targetWalletAddress);
    console.log(`Admin ${socket.username} muted user: ${targetWalletAddress}`);
    
    // Find and disconnect the muted user's sockets
    for (const [socketId, socketInfo] of activeSockets.entries()) {
      if (socketInfo.walletAddress === targetWalletAddress) {
        const targetSocket = io.sockets.sockets.get(socketId);
        if (targetSocket) {
          targetSocket.emit('user muted', { reason: 'You have been muted by an administrator' });
        }
      }
    }
    
    // Broadcast mute to all clients
    io.emit('user muted', { walletAddress: targetWalletAddress });
  });

  // Admin: Unmute user
  socket.on('unmute user', (targetWalletAddress) => {
    if (!isAdmin(socket.walletAddress)) {
      socket.emit('error', 'Admin privileges required');
      return;
    }

    mutedUsers.delete(targetWalletAddress);
    console.log(`Admin ${socket.username} unmuted user: ${targetWalletAddress}`);
    
    // Broadcast unmute to all clients
    io.emit('user unmuted', { walletAddress: targetWalletAddress });
  });

  // When the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    if (!socket.username) return;
    
    socket.broadcast.emit('typing', {
      username: socket.username,
      walletAddress: socket.walletAddress
    });
  });

  // When the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    if (!socket.username) return;
    
    socket.broadcast.emit('stop typing', {
      username: socket.username,
      walletAddress: socket.walletAddress
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

    // Clean up any temporary authentication data
    delete socket.tempAuth;
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
