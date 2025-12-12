// server.js
// Broadcasts all supported tickers' prices to every connected client every second.
const http = require('http');
const WebSocket = require('ws');

const SUPPORTED = ['GOOG','TSLA','AMZN','META','NVDA'];

let prices = {};
SUPPORTED.forEach(t => prices[t] = +(100 + Math.random()*900).toFixed(2));

const clients = new Map();

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('client connected');
  clients.set(ws, { email: null, subs: new Set() });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'login') {
        clients.get(ws).email = msg.email || null;
        ws.send(JSON.stringify({ type: 'login_ack', email: msg.email }));
      } else if (msg.type === 'get_supported') {
        ws.send(JSON.stringify({ type: 'supported', supported: SUPPORTED }));
      } else if (msg.type === 'subscribe') {
        const meta = clients.get(ws);
        if (SUPPORTED.includes(msg.ticker)) {
          meta.subs.add(msg.ticker);
          ws.send(JSON.stringify({ type: 'subscribed', ticker: msg.ticker }));
        } else {
          ws.send(JSON.stringify({ type: 'error', message: 'Unsupported ticker' }));
        }
      } else if (msg.type === 'unsubscribe') {
        const meta = clients.get(ws);
        meta.subs.delete(msg.ticker);
        ws.send(JSON.stringify({ type: 'unsubscribed', ticker: msg.ticker }));
      } else {
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (err) {
      console.warn('invalid message', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log('client disconnected');
  });
});

// Price updater: change prices and broadcast ALL tickers to all clients every second
setInterval(() => {
  SUPPORTED.forEach(t => {
    const change = (Math.random() - 0.5) * 2; // -1..+1
    prices[t] = Math.max(0.01, +(prices[t] + change).toFixed(2));
  });

  // build payload with all tickers
  const updatesAll = SUPPORTED.map(t => ({ ticker: t, price: prices[t], ts: Date.now() }));

  // broadcast to everyone
  clients.forEach((meta, ws) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'price_updates', updates: updatesAll }));
  });
}, 1000);

const PORT = 4000;
server.listen(PORT, () => console.log(`WebSocket server listening on ws://localhost:${PORT}`));
