
# Degen Park Chat Widget with Solana Wallet Authentication

A modern chat widget built with Socket.IO that requires Solana wallet authentication. Features a beautiful landing page with a floating chat button that opens a popup chat interface.

## How to use

```
$ npm install
$ npm start
```

And point your browser to `http://localhost:3001` (or your configured port). Click the floating chat button to open the widget! Optionally, specify a port by supplying the `PORT` env variable.

## Features

### 🔐 Wallet Authentication
- Users must connect a Solana wallet (Phantom, Solflare, or Backpack) before joining
- Wallet addresses are used as unique identifiers for user authentication
- Usernames are permanently linked to wallet addresses

### 💬 Advanced Chat Features
- Real-time messaging with all connected users
- Multiple users can join the chat room simultaneously
- Users can see when others are typing
- Notifications when users join or leave the chatroom
- User info displays wallet address and chosen username
- **Clickable usernames** - Click any username to view their wallet on Solscan
- **Message Replies** - Click any message to reply to it with context
- **@User Tagging** - Tag other users with @username for mentions
- **Smart Notifications** - Red badge on chat button when tagged (widget closed)
- **Message Threading** - Visual reply indicators and context
- Direct blockchain transparency and verification

### 🎨 Modern UI & Chat Widget
- Beautiful landing page with feature showcase
- Floating chat button with pulse animation
- Popup chat widget optimized for smaller screens
- Smooth open/close animations and responsive design
- Beautiful gradient backgrounds for all pages
- Clean, modern interface with hover effects

## Supported Wallets

- **Phantom Wallet** - Popular Solana wallet browser extension
- **Solflare Wallet** - Cross-platform Solana wallet
- **Backpack Wallet** - Multi-chain wallet with Solana support

## How it Works

1. **Connect Wallet**: Users first connect their Solana wallet
2. **Username Selection**: If it's a new wallet, users choose a permanent username
3. **Join Chat**: Once authenticated, users can participate in the chat
4. **Persistent Identity**: Username is tied to wallet address permanently
5. **Blockchain Transparency**: Click any username to view their wallet on Solscan.io

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
