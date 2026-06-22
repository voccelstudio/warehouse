// src/index.js — StockMap Backend Entry Point
require('dotenv').config();
const http        = require('http');
const app         = require('./app');
const { initWebSocket } = require('./services/websocket.service');
const { initSyncJobs }  = require('./jobs/sync.jobs');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

// WebSocket server — same port as HTTP
initWebSocket(server);

// Background sync jobs
initSyncJobs();

server.listen(PORT, () => {
  console.log(`\n┌─────────────────────────────────────┐`);
  console.log(`│   STOCKMAP Backend v1.0             │`);
  console.log(`│   http://localhost:${PORT}             │`);
  console.log(`│   ENV: ${process.env.NODE_ENV}                │`);
  console.log(`└─────────────────────────────────────┘\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});
