# Chat Widget Setup (Local)

## Endpoints
- `/chat-widget.js` → public loader script
- `/embed/chat.html` → iframe chat UI
- `/socket.io` → realtime (served by server-realtime.js)

## Run locally
```
node server-widget.js
node server-realtime.js
```

Then open:
- http://localhost:8080/chat-widget.js
- http://localhost:8080/embed/chat.html

Embed locally (example):
```
<script src="http://localhost:8080/chat-widget.js" data-site-id="demo" async></script>
```

## Security
- Set `FRAME_ANCESTORS` env to control embedding domains for CSP
- Set `CORS_ORIGINS` env (comma-separated) for Socket.IO CORS

## Deploy
- Serve `server-widget.js` on your HTTPS domain (e.g., chat.gamescampus.co.kr)
- Reverse-proxy `/socket.io` to `server-realtime.js` if on different port
- Example Nginx:
```
location /socket.io/ { proxy_pass http://127.0.0.1:8090; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; }
location / { proxy_pass http://127.0.0.1:8080; }
```
