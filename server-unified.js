// Unified server: serves static widget and Socket.IO on one port
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();
app.use(helmet({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));

// CSP with configurable frame-ancestors
app.use((req, res, next) => {
	const frameAncestors = process.env.FRAME_ANCESTORS || "'self'";
	res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors ${frameAncestors};`);
	next();
});

// Static files
app.use(express.static(PUBLIC_DIR, { index: false, etag: true, maxAge: '1h' }));

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);

// Socket.IO
const io = new Server(server, {
	path: '/socket.io',
	cors: {
		origin: (origin, cb) => {
			const list = (process.env.CORS_ORIGINS || '').split(',').filter(Boolean);
			if (!origin || list.length === 0 || list.includes(origin)) return cb(null, true);
			return cb(new Error('Not allowed by CORS: ' + origin));
		},
		credentials: false
	}
});

io.on('connection', (socket) => {
	const site = (socket.handshake.auth && socket.handshake.auth.site) || 'default';
	const sessionId = socket.id;
	socket.join('site:' + site);

	socket.on('client:msg', (payload) => {
		const text = (payload && payload.text) || '';
		socket.to('site:' + site).emit('server:msg', `[${sessionId.slice(0,6)}] ${text}`);
	});

	setTimeout(() => socket.emit('server:msg', 'Welcome to chat!'), 200);
});

server.listen(PORT, () => {
	console.log(`[unified] listening on http://localhost:${PORT}`);
	console.log(`[unified] static dir: ${PUBLIC_DIR}`);
});


