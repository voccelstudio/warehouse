// src/services/websocket.service.js
// Real-time updates — when inventory changes, all connected clients get notified
const WebSocket = require('ws');

let wss = null;

// Map of workspaceId → Set of WebSocket clients
const rooms = new Map();

const initWebSocket = (server) => {
  wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    console.log('[WS] Client connected');

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);

        // Client must join a workspace room to receive updates
        if (msg.type === 'JOIN') {
          const { workspaceId, token } = msg;
          // TODO: validate token here in production
          ws.workspaceId = workspaceId;
          if (!rooms.has(workspaceId)) rooms.set(workspaceId, new Set());
          rooms.get(workspaceId).add(ws);
          ws.send(JSON.stringify({ type: 'JOINED', workspaceId }));
          console.log(`[WS] Client joined workspace: ${workspaceId}`);
        }
      } catch (e) {
        console.error('[WS] Invalid message:', e.message);
      }
    });

    ws.on('close', () => {
      if (ws.workspaceId && rooms.has(ws.workspaceId)) {
        rooms.get(ws.workspaceId).delete(ws);
      }
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => console.error('[WS] Error:', err.message));
  });

  console.log('[WS] WebSocket server initialized at /ws');
};

/**
 * Broadcast an event to all clients in a workspace
 * 
 * Usage:
 *   broadcast(workspaceId, 'CELL_UPDATED', { cellId: 'R01-B03-L2A', status: 'OCCUPIED', ... })
 *   broadcast(workspaceId, 'SYNC_COMPLETE', { connector: 'SQL_POSTGRES', rows: 142 })
 */
const broadcast = (workspaceId, type, payload) => {
  if (!rooms.has(workspaceId)) return;
  const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });

  rooms.get(workspaceId).forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

// Convenience emitters
const emitCellUpdated   = (wid, cell)    => broadcast(wid, 'CELL_UPDATED',    cell);
const emitSyncComplete  = (wid, summary) => broadcast(wid, 'SYNC_COMPLETE',   summary);
const emitSyncError     = (wid, error)   => broadcast(wid, 'SYNC_ERROR',      error);
const emitSyncStarted   = (wid, info)    => broadcast(wid, 'SYNC_STARTED',    info);

module.exports = {
  initWebSocket,
  broadcast,
  emitCellUpdated,
  emitSyncComplete,
  emitSyncError,
  emitSyncStarted,
};
