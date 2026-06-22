// src/connectors/excel.connector.js
// Handles .xlsx and .csv file imports
// Client uploads a file → we parse it → upsert into StockMap

const XLSX = require('xlsx');
const { upsertInventoryRow } = require('./sql.connector');

// ─── Parse uploaded file ─────────────────
// Supports .xlsx, .xls, .csv
// Returns array of row objects

function parseFile(buffer, mimetype) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0]; // always use first sheet
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  return rows;
}

// ─── Column mapping ──────────────────────
// The client's file may have any column names.
// We normalize them based on a provided mapping or auto-detect.
//
// Auto-detect looks for common names in Spanish and English:
const AUTO_DETECT_MAP = {
  cellCode:    ['ubicacion', 'celda', 'posicion', 'cell', 'location', 'cell_code'],
  sku:         ['sku', 'codigo', 'code', 'item_code', 'producto_id'],
  productName: ['descripcion', 'producto', 'nombre', 'description', 'product', 'name'],
  quantity:    ['cantidad', 'stock', 'qty', 'quantity', 'stock_actual'],
  maxCapacity: ['capacidad', 'capacity', 'max', 'stock_maximo', 'max_capacity'],
  expiryDate:  ['vencimiento', 'caducidad', 'expiry', 'expiry_date', 'fecha_vencimiento'],
  supplier:    ['proveedor', 'supplier', 'vendor'],
  destination: ['destino', 'destination', 'cliente'],
  orderRef:    ['orden', 'order', 'remito', 'order_ref', 'nro_orden'],
  category:    ['categoria', 'category', 'rubro'],
  barcode:     ['barcode', 'codigo_barras', 'ean', 'gtin'],
  weight:      ['peso', 'weight', 'kg'],
};

function buildAutoMapping(headers) {
  const lower = headers.map(h => h.toLowerCase().trim());
  const mapping = {};

  for (const [field, aliases] of Object.entries(AUTO_DETECT_MAP)) {
    const match = aliases.find(alias => lower.includes(alias));
    if (match) {
      const originalHeader = headers[lower.indexOf(match)];
      mapping[field] = originalHeader;
    }
  }

  return mapping;
}

function applyMapping(rows, mapping) {
  return rows.map(row => {
    const normalized = {};
    for (const [field, colName] of Object.entries(mapping)) {
      normalized[field] = row[colName] ?? null;
    }
    return normalized;
  });
}

// ─── Validation ──────────────────────────
function validateRows(rows) {
  const errors = [];
  const valid = [];

  rows.forEach((row, i) => {
    if (!row.cellCode) {
      errors.push({ row: i + 2, error: 'Falta columna de ubicación (cellCode)' });
      return;
    }
    if (!row.sku) {
      errors.push({ row: i + 2, error: 'Falta columna SKU/código de producto' });
      return;
    }
    valid.push(row);
  });

  return { valid, errors };
}

// ─── Main import function ─────────────────
async function importFromExcel(buffer, warehouseId, customMapping = null) {
  const rows = parseFile(buffer);

  if (!rows.length) {
    throw new Error('El archivo está vacío o no tiene datos en la primera hoja');
  }

  const headers = Object.keys(rows[0]);
  const mapping = customMapping || buildAutoMapping(headers);

  // Check that we at least detected cellCode and sku
  if (!mapping.cellCode || !mapping.sku) {
    return {
      success: false,
      error: 'No se pudo detectar las columnas de ubicación o SKU automáticamente',
      detectedHeaders: headers,
      suggestedMapping: mapping,
    };
  }

  const normalized = applyMapping(rows, mapping);
  const { valid, errors: validationErrors } = validateRows(normalized);

  const result = {
    rowsRead: rows.length,
    rowsValid: valid.length,
    rowsUpdated: 0,
    errors: validationErrors,
    detectedMapping: mapping,
  };

  for (const row of valid) {
    try {
      await upsertInventoryRow(row, warehouseId);
      result.rowsUpdated++;
    } catch (err) {
      result.errors.push({ row: row.cellCode, error: err.message });
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

// ─── Preview (no writes) ─────────────────
// Returns first 5 rows with detected mapping — for UI confirmation step

function previewExcel(buffer) {
  const rows = parseFile(buffer);
  if (!rows.length) return { error: 'Archivo vacío' };

  const headers = Object.keys(rows[0]);
  const mapping = buildAutoMapping(headers);
  const preview = rows.slice(0, 5).map(row => applyMapping([row], mapping)[0]);

  return { headers, detectedMapping: mapping, preview, totalRows: rows.length };
}

module.exports = { importFromExcel, previewExcel, buildAutoMapping };
