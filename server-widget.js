// Minimal widget/static server for chat widget
const path = require('path');
const express = require('express');
const helmet = require('helmet');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');

const app = express();

// Security headers (CSP will be adjusted below)
app.use(helmet({
	crossOriginEmbedderPolicy: false,
	crossOriginResourcePolicy: false
}));

// Basic CSP allowing embedding by same-origin; adjust frame-ancestors per deployment
app.use((req, res, next) => {
	const frameAncestors = process.env.FRAME_ANCESTORS || "'self'";
	res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; connect-src 'self' https: wss:; frame-ancestors ${frameAncestors};`);
	next();
});

// Serve static widget assets
app.use(express.static(PUBLIC_DIR, { index: false, etag: true, maxAge: '1h' }));

// Health
app.get('/healthz', (req, res) => res.json({ ok: true }));

// Fallback 404 with hint
app.use((req, res) => {
	res.status(404).json({ error: 'Not found', hint: 'Expected /chat-widget.js or /embed/chat.html' });
});

app.listen(PORT, () => {
	console.log(`[widget] listening on http://localhost:${PORT}`);
	console.log(`[widget] serving static from ${PUBLIC_DIR}`);
});


