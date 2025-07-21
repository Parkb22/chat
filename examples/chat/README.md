
# Socket.IO Chat with Solana Wallet Authentication

A chat application built with Socket.IO that requires Solana wallet authentication to join the conversation.

## How to use

```
$ npm install
$ npm start
```

And point your browser to `http://localhost:3001` (or your configured port). Optionally, specify a port by supplying the `PORT` env variable.

## Features

### 🔐 Wallet Authentication
- Users must connect a Solana wallet (Phantom, Solflare, or Backpack) before joining
- Wallet addresses are used as unique identifiers for user authentication
- Usernames are permanently linked to wallet addresses

### 💬 Chat Features
- Real-time messaging with all connected users
- Multiple users can join the chat room simultaneously
- Users can see when others are typing
- Notifications when users join or leave the chatroom
- User info displays wallet address and chosen username

### 🎨 Modern UI
- Beautiful gradient backgrounds for different pages
- Responsive design that works on mobile and desktop
- Smooth transitions and hover effects
- Clean, modern interface

## Supported Wallets

- **Phantom Wallet** - Popular Solana wallet browser extension
- **Solflare Wallet** - Cross-platform Solana wallet
- **Backpack Wallet** - Multi-chain wallet with Solana support

## How it Works

1. **Connect Wallet**: Users first connect their Solana wallet
2. **Username Selection**: If it's a new wallet, users choose a permanent username
3. **Join Chat**: Once authenticated, users can participate in the chat
4. **Persistent Identity**: Username is tied to wallet address permanently

## Technical Details

- Built with Socket.IO for real-time communication
- Uses Solana web3.js for wallet integration
- In-memory storage for wallet-username mappings (consider database for production)
- Server validates wallet addresses and manages user sessions

## Development Notes

For production use, consider:
- Adding database storage for wallet-username mappings
- Implementing message history storage
- Adding rate limiting and spam protection
- Enhanced wallet signature verification for security
