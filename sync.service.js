// src/services/sync.service.js
// Unified sync engine — routes to the right connector based on type
// Handles logging, error recovery, and WebSocket broadcasts

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { emitSyncStarted, emitSyncComplete, emitSyncError } = require('./websocket.service');
const { syncFromSQL }          = require('../connectors/sql.connector');
const { importFromExcel }      = require('../connectors/excel.connector');
const { syncFromGoogleSheets } = require('../connectors/googlesheets.connector');
const { syncFromPowerBI }      = require('../connectors/powerbi.connector');

// ─── Run a sync for a specific connector ─
async function runSync(connectorId, warehouseId) {
  const connector = await prisma.connector.findUnique({
    where: { id: connectorId },
  });

  if (!connector) throw new Error(`Connector ${connectorId} not found`);
  if (connector.status === 'SYNCING') {
    throw new Error('Ya hay una sincronización en curso para este conector');
  }

  const startedAt = Date.now();
  const workspaceId = connector.workspaceId;

  // Mark as syncing
  await prisma.connector.update({
    where: { id: connectorId },
    data: { status: 'SYNCING' },
  });

  emitSyncStarted(workspaceId, {
    connectorId,
    connectorName: connector.name,
    type: connector.type,
  });

  let result;
  try {
    result = await dispatchSync(connector, warehouseId);

    const duration = Date.now() - startedAt;

    // Log success
    await prisma.syncLog.create({
      data: {
        connectorId,
        status: result.errors?.length ? 'partial' : 'success',
        rowsRead: result.rowsRead || 0,
        rowsUpdated: result.rowsUpdated || 0,
        duration,
        error: result.errors?.length ? JSON.stringify(result.errors.slice(0, 10)) : null,
      },
    });

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: 'ACTIVE', lastSyncAt: new Date(), lastError: null },
    });

    emitSyncComplete(workspaceId, {
      connectorId,
      connectorName: connector.name,
      ...result,
      duration,
    });

    return result;

  } catch (err) {
    const duration = Date.now() - startedAt;

    await prisma.syncLog.create({
      data: { connectorId, status: 'error', duration, error: err.message },
    });

    await prisma.connector.update({
      where: { id: connectorId },
      data: { status: 'ERROR', lastError: err.message },
    });

    emitSyncError(workspaceId, {
      connectorId,
      connectorName: connector.name,
      error: err.message,
    });

    throw err;
  }
}

// ─── Dispatch to correct connector ───────
async function dispatchSync(connector, warehouseId) {
  const { type } = connector;

  if (['SQL_POSTGRES', 'SQL_MYSQL', 'SQL_MSSQL'].includes(type)) {
    return syncFromSQL(connector, warehouseId);
  }

  if (type === 'GOOGLE_SHEETS') {
    return syncFromGoogleSheets(connector, warehouseId);
  }

  if (type === 'POWER_BI') {
    return syncFromPowerBI(connector, warehouseId);
  }

  // EXCEL is handled differently (file upload) but can also be re-synced
  // if the file is stored in the connector config as base64
  if (type === 'EXCEL' && connector.config?.lastFileBuffer) {
    const buffer = Buffer.from(connector.config.lastFileBuffer, 'base64');
    return importFromExcel(buffer, warehouseId, connector.config.mapping);
  }

  throw new Error(`Tipo de conector no soportado para sync: ${type}`);
}

// ─── Sync all active connectors ──────────
// Called by the scheduler job

async function syncAllActive() {
  const connectors = await prisma.connector.findMany({
    where: { status: { in: ['ACTIVE', 'ERROR'] }, syncMode: 'SCHEDULED' },
    include: { workspace: { include: { warehouses: { take: 1 } } } },
  });

  console.log(`[Sync] Running scheduled sync for ${connectors.length} connectors`);

  for (const connector of connectors) {
    const warehouse = connector.workspace.warehouses[0];
    if (!warehouse) continue;
    try {
      await runSync(connector.id, warehouse.id);
    } catch (err) {
      console.error(`[Sync] Failed for connector ${connector.id}:`, err.message);
    }
  }
}

module.exports = { runSync, syncAllActive };
