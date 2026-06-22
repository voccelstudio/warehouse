// src/connectors/powerbi.connector.js
// Connects to Power BI via Microsoft OAuth2 (Azure AD)
// Reads data from a Power BI dataset using DAX queries

const https = require('https');
const { upsertInventoryRow } = require('./sql.connector');

const AUTHORITY       = 'https://login.microsoftonline.com';
const POWERBI_SCOPE   = 'https://analysis.windows.net/powerbi/api/.default';
const POWERBI_API     = 'https://api.powerbi.com/v1.0/myorg';

// ─── OAuth2 Helpers ──────────────────────

function getAuthUrl(tenantId, state = '') {
  const params = new URLSearchParams({
    client_id:     process.env.POWERBI_CLIENT_ID,
    response_type: 'code',
    redirect_uri:  process.env.POWERBI_REDIRECT_URI,
    scope:         'https://analysis.windows.net/powerbi/api/Dataset.Read.All offline_access',
    state,
  });
  return `${AUTHORITY}/${tenantId}/oauth2/v2.0/authorize?${params}`;
}

async function exchangeCode(tenantId, code) {
  const body = new URLSearchParams({
    client_id:     process.env.POWERBI_CLIENT_ID,
    client_secret: process.env.POWERBI_CLIENT_SECRET,
    code,
    redirect_uri:  process.env.POWERBI_REDIRECT_URI,
    grant_type:    'authorization_code',
  });

  return postRequest(`${AUTHORITY}/${tenantId}/oauth2/v2.0/token`, body.toString());
}

async function refreshAccessToken(tenantId, refreshToken) {
  const body = new URLSearchParams({
    client_id:     process.env.POWERBI_CLIENT_ID,
    client_secret: process.env.POWERBI_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type:    'refresh_token',
    scope:         POWERBI_SCOPE,
  });

  return postRequest(`${AUTHORITY}/${tenantId}/oauth2/v2.0/token`, body.toString());
}

// ─── Power BI REST API ───────────────────

async function apiGet(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.powerbi.com',
      path: `/v1.0/myorg${path}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Power BI API')); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function executeDAX(accessToken, datasetId, daxQuery) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ queries: [{ query: daxQuery }], serializerSettings: { includeNulls: true } });
    const options = {
      hostname: 'api.powerbi.com',
      path: `/v1.0/myorg/datasets/${datasetId}/executeQueries`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON from Power BI API')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── List workspaces and datasets ────────

async function listWorkspaces(accessToken) {
  const res = await apiGet('/groups', accessToken);
  return res.value?.map(g => ({ id: g.id, name: g.name })) || [];
}

async function listDatasets(accessToken, groupId = null) {
  const path = groupId ? `/groups/${groupId}/datasets` : '/datasets';
  const res = await apiGet(path, accessToken);
  return res.value?.map(d => ({ id: d.id, name: d.name, tables: d.tables })) || [];
}

async function listTables(accessToken, datasetId) {
  const res = await apiGet(`/datasets/${datasetId}/tables`, accessToken);
  return res.value?.map(t => t.name) || [];
}

// ─── Main sync ───────────────────────────
// config.daxQuery: custom DAX, or we auto-build one from config.tableMapping

async function syncFromPowerBI(connector, warehouseId) {
  const { config } = connector;
  let { tokens, tenantId, datasetId, daxQuery, columnMapping } = config;

  // Refresh token if needed
  if (Date.now() > tokens.expiresAt - 60000) {
    tokens = await refreshAccessToken(tenantId, tokens.refreshToken);
    // TODO: persist refreshed tokens back to DB
  }

  // Build DAX if not provided
  if (!daxQuery) {
    const table = config.tableName || 'Inventario';
    daxQuery = `EVALUATE '${table}'`;
  }

  const response = await executeDAX(tokens.accessToken, datasetId, daxQuery);
  const rawRows = response.results?.[0]?.tables?.[0]?.rows || [];

  const result = { rowsRead: rawRows.length, rowsUpdated: 0, errors: [] };

  for (const rawRow of rawRows) {
    // Power BI returns column names as "TableName[ColumnName]"
    // We strip the table prefix for cleaner mapping
    const row = {};
    for (const [key, val] of Object.entries(rawRow)) {
      const cleanKey = key.replace(/^[^\[]+\[|\]$/g, '');
      row[cleanKey] = val;
    }

    // Apply column mapping
    const normalized = {};
    for (const [field, col] of Object.entries(columnMapping || {})) {
      normalized[field] = row[col] ?? null;
    }

    if (!normalized.cellCode || !normalized.sku) continue;

    try {
      await upsertInventoryRow(normalized, warehouseId);
      result.rowsUpdated++;
    } catch (err) {
      result.errors.push({ row: normalized.cellCode, error: err.message });
    }
  }

  return result;
}

// ─── Helper ──────────────────────────────

function postRequest(url, body) {
  return new Promise((resolve, reject) => {
    const { hostname, pathname } = new URL(url);
    const options = {
      hostname,
      path: pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  syncFromPowerBI,
  listWorkspaces,
  listDatasets,
  listTables,
};
