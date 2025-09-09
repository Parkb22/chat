// Minimal Socket.IO realtime server routing messages between browser sessions
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const helmet = require('helmet');

const app = express();
app.use(helmet({
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: false
}));

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);

const io = new Server(server, {
	path: '/socket.io',
	cors: {
		origin: (origin, cb) => {
			// Allow no-origin (direct) and configured list
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

	// Place user in site-specific room
	socket.join('site:' + site);

	// Basic echo/logging; in production, route to agents/queues
	socket.on('client:msg', (payload) => {
		const text = (payload && payload.text) || '';
		// Broadcast to others in same site room (or to agents backend)
		socket.to('site:' + site).emit('server:msg', `[${sessionId.slice(0,6)}] ${text}`);
	});

	// Example server push
	setTimeout(() => {
		socket.emit('server:msg', 'Welcome to chat!');
	}, 200);

	socket.on('disconnect', () => {});
});

const PORT = process.env.RTC_PORT || 8090;
server.listen(PORT, () => console.log(`[realtime] listening on http://localhost:${PORT}`));


