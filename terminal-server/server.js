const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3001;
const SECRET = process.env.TERMINAL_SECRET || '';
const COMMAND = (process.env.TERMINAL_COMMAND || 'claude').split(' ');
const SESSION_TTL_MS = parseInt(process.env.SESSION_TTL_MS || '3600000', 10); // 1 hour

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// sessions: Map<sessionId, { pty, clients: Set<ws>, scrollback: string, idleTimer }>
const sessions = new Map();

app.get('/health', (_, res) => res.json({ ok: true, sessions: sessions.size }));

function getOrCreate(sessionId) {
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId);
    clearTimeout(s.idleTimer);
    s.idleTimer = null;
    return s;
  }

  const shell = COMMAND[0];
  const args = COMMAND.slice(1);

  const proc = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 220,
    rows: 50,
    cwd: process.env.HOME || '/tmp',
    env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
  });

  const session = { pty: proc, clients: new Set(), scrollback: '', idleTimer: null };

  proc.onData((data) => {
    session.scrollback += data;
    if (session.scrollback.length > 200_000) {
      session.scrollback = session.scrollback.slice(-100_000);
    }
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'output', data }));
    }
  });

  proc.onExit(({ exitCode }) => {
    for (const ws of session.clients) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
    }
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

function scheduleIdle(session, sessionId) {
  session.idleTimer = setTimeout(() => {
    try { session.pty.kill(); } catch {}
    sessions.delete(sessionId);
  }, SESSION_TTL_MS);
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/ws') { socket.destroy(); return; }

  const token = url.searchParams.get('token');
  if (SECRET && token !== SECRET) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get('sessionId') || uuidv4();

  const session = getOrCreate(sessionId);
  session.clients.add(ws);

  ws.send(JSON.stringify({ type: 'connected', sessionId }));

  // Replay scrollback so reconnecting clients see previous output
  if (session.scrollback) {
    ws.send(JSON.stringify({ type: 'output', data: session.scrollback }));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && typeof msg.data === 'string') {
        session.pty.write(msg.data);
      } else if (msg.type === 'resize' && msg.cols && msg.rows) {
        session.pty.resize(
          Math.max(1, Math.min(500, msg.cols)),
          Math.max(1, Math.min(200, msg.rows))
        );
      }
    } catch {}
  });

  ws.on('close', () => {
    session.clients.delete(ws);
    if (session.clients.size === 0) scheduleIdle(session, sessionId);
  });

  ws.on('error', () => {
    session.clients.delete(ws);
    if (session.clients.size === 0) scheduleIdle(session, sessionId);
  });
});

server.listen(PORT, () => {
  console.log(`Terminal server on :${PORT}${SECRET ? ' (auth enabled)' : ' (no auth — set TERMINAL_SECRET)'}`);
  console.log(`Command: ${COMMAND.join(' ')}`);
});

process.on('SIGTERM', () => {
  for (const [, s] of sessions) {
    try { s.pty.kill(); } catch {}
  }
  server.close(() => process.exit(0));
});
