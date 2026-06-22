// src/connectors/googlesheets.connector.js
// Connects to Google Sheets via OAuth2
// Reads inventory data from a spreadsheet in real time

const { google } = require('googleapis');
const { upsertInventoryRow } = require('./sql.connector');
const { buildAutoMapping } = require('./excel.connector');

// ─── OAuth2 Client ───────────────────────
function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// ─── Step 1: Generate auth URL ───────────
// Send this URL to the user so they can authorize StockMap
// to read their Google Sheets

function getAuthUrl(state = '') {
  const oauth2Client = createOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',   // get refresh_token so we can sync without user being online
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    state, // we pass workspaceId + connectorId here
  });
}

// ─── Step 2: Exchange code for tokens ────
// Called from the OAuth callback route

async function exchangeCode(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens; // { access_token, refresh_token, expiry_date }
}

// ─── Step 3: Sync ────────────────────────
// Reads data from the spreadsheet and upserts into StockMap

async function syncFromGoogleSheets(connector, warehouseId) {
  const { config } = connector;
  const { tokens, spreadsheetId, sheetName, customMapping } = config;

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);

  // Auto-refresh token if expired
  oauth2Client.on('tokens', (newTokens) => {
    // In production: persist new tokens back to connector config
    console.log('[GoogleSheets] Token refreshed');
  });

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  // Get all data from the sheet
  const range = sheetName ? `${sheetName}!A1:Z10000` : 'A1:Z10000';
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  const rawValues = response.data.values;
  if (!rawValues?.length) {
    return { rowsRead: 0, rowsUpdated: 0, errors: ['La hoja está vacía'] };
  }

  // First row = headers
  const headers = rawValues[0];
  const rows = rawValues.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? null; });
    return obj;
  });

  const mapping = customMapping || buildAutoMapping(headers);
  const result = { rowsRead: rows.length, rowsUpdated: 0, errors: [] };

  for (const rawRow of rows) {
    const normalized = {};
    for (const [field, col] of Object.entries(mapping)) {
      normalized[field] = rawRow[col] ?? null;
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

// ─── List available spreadsheets ─────────
// Lets the user pick which spreadsheet to connect

async function listSpreadsheets(tokens) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet'",
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: 20,
  });

  return res.data.files;
}

// ─── List sheets within a spreadsheet ────
async function listSheets(tokens, spreadsheetId) {
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
  const res = await sheets.spreadsheets.get({ spreadsheetId });

  return res.data.sheets.map(s => ({
    id: s.properties.sheetId,
    name: s.properties.title,
  }));
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  syncFromGoogleSheets,
  listSpreadsheets,
  listSheets,
};
