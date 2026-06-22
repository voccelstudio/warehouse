// src/connectors/sql.connector.js
// Connects to client's external SQL database (Postgres, MySQL, SQL Server)
// Reads inventory data and maps it to StockMap's data model

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ─── Driver factory ──────────────────────
// Returns a query function for any SQL engine

async function createSqlClient(config) {
  const { engine, host, port, database, user, password, schema, instance } = config;

  if (engine === 'postgres') {
    const { Pool } = require('pg');
    const pool = new Pool({ host, port: port || 5432, database, user, password });
    await pool.query('SELECT 1'); // test connection
    return {
      query: (sql, params) => pool.query(sql, params).then(r => r.rows),
      close:  () => pool.end(),
    };
  }

  if (engine === 'mysql') {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ host, port: port || 3306, database, user, password });
    return {
      query: (sql, params) => conn.execute(sql, params).then(([rows]) => rows),
      close:  () => conn.end(),
    };
  }

  if (engine === 'mssql') {
    const mssql = require('mssql');
    const pool = await mssql.connect({
      server: host,
      database,
      user,
      password,
      options: { encrypt: true, trustServerCertificate: true, instanceName: instance },
    });
    return {
      query: async (sql) => {
        const result = await pool.request().query(sql);
        return result.recordset;
      },
      close: () => pool.close(),
    };
  }

  throw new Error(`Motor SQL no soportado: ${engine}`);
}

// ─── Column mapping ──────────────────────
// Each client may have different column names.
// The connector config stores the mapping.
//
// Example mapping stored in Connector.config:
// {
//   table: "deposito_items",
//   columns: {
//     cellCode:    "ubicacion",
//     sku:         "codigo_producto",
//     productName: "descripcion",
//     quantity:    "stock_actual",
//     maxCapacity: "stock_maximo",
//     expiryDate:  "fecha_vencimiento",
//     supplier:    "proveedor",
//     destination: "destino",
//     orderRef:    "nro_orden"
//   }
// }

function buildSelectQuery(mapping) {
  const { table, columns: c, whereClause } = mapping;
  const cols = Object.entries(c)
    .map(([alias, col]) => `${col} AS "${alias}"`)
    .join(', ');
  return `SELECT ${cols} FROM ${table}${whereClause ? ' WHERE ' + whereClause : ''}`;
}

// ─── Main sync function ──────────────────
async function syncFromSQL(connector, warehouseId) {
  const { config } = connector;
  const { connection, mapping } = config;

  let client;
  const result = { rowsRead: 0, rowsUpdated: 0, errors: [] };

  try {
    client = await createSqlClient(connection);
    const query = buildSelectQuery(mapping);
    const rows = await client.query(query);
    result.rowsRead = rows.length;

    for (const row of rows) {
      try {
        await upsertInventoryRow(row, warehouseId);
        result.rowsUpdated++;
      } catch (err) {
        result.errors.push({ row: row.cellCode, error: err.message });
      }
    }
  } finally {
    if (client) await client.close();
  }

  return result;
}

// ─── Upsert logic ────────────────────────
// Applies a single data row from external source into StockMap

async function upsertInventoryRow(row, warehouseId) {
  const {
    cellCode, sku, productName, quantity, maxCapacity,
    expiryDate, supplier, destination, orderRef, category, barcode, weight
  } = row;

  if (!cellCode || !sku) return;

  // 1. Ensure cell exists
  const cell = await prisma.cell.upsert({
    where: { warehouseId_cellCode: { warehouseId, cellCode } },
    update: { status: quantity > 0 ? 'OCCUPIED' : 'FREE' },
    create: {
      cellCode,
      rackUnit: parseInt(cellCode.match(/R(\d+)/)?.[1] || 0),
      bay:      parseInt(cellCode.match(/B(\d+)/)?.[1] || 0),
      level:    parseInt(cellCode.match(/L(\d+)/)?.[1] || 0),
      side:     cellCode.match(/(\d)([AB])$/)?.[2] || 'A',
      status:   quantity > 0 ? 'OCCUPIED' : 'FREE',
      warehouseId,
    },
  });

  // 2. Ensure product exists
  const product = await prisma.product.upsert({
    where: { sku },
    update: { name: productName, supplier, category, barcode, weight: parseFloat(weight) || null },
    create: { sku, name: productName || sku, supplier, category, barcode, weight: parseFloat(weight) || null },
  });

  // 3. Upsert inventory record
  await prisma.inventory.upsert({
    where: { cellId: cell.id },
    update: {
      quantity:    parseInt(quantity) || 0,
      maxCapacity: parseInt(maxCapacity) || 50,
      expiryDate:  expiryDate ? new Date(expiryDate) : null,
      destination,
      orderRef,
      productId: product.id,
    },
    create: {
      cellId:      cell.id,
      productId:   product.id,
      quantity:    parseInt(quantity) || 0,
      maxCapacity: parseInt(maxCapacity) || 50,
      expiryDate:  expiryDate ? new Date(expiryDate) : null,
      destination,
      orderRef,
    },
  });
}

module.exports = { syncFromSQL, createSqlClient, upsertInventoryRow };
