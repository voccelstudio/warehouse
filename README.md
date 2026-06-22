# StockMap Backend

API REST + WebSockets para el software de logística StockMap.

## Stack
- **Node.js** + Express
- **PostgreSQL** + Prisma ORM
- **WebSockets** (ws) para tiempo real
- **Conectores:** SQL (Postgres/MySQL/SQL Server), Excel, Google Sheets, Power BI

---

## Setup rápido

### 1. Instalar dependencias
```bash
npm install
```

### 2. Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

### 3. Levantar PostgreSQL (con Docker)
```bash
docker run --name stockmap-db \
  -e POSTGRES_USER=user \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=stockmap \
  -p 5432:5432 -d postgres:15
```

### 4. Crear la base de datos
```bash
npm run db:push        # aplica el schema sin migraciones (dev rápido)
# o
npm run db:migrate     # crea migraciones versionadas (producción)
```

### 5. Correr el servidor
```bash
npm run dev     # desarrollo con hot reload
npm start       # producción
```

El servidor corre en `http://localhost:4000`

---

## API Reference

### Auth
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/auth/register` | Crear cuenta + workspace |
| POST | `/api/auth/login` | Login, devuelve JWT |

### Warehouse
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/warehouses` | Listar depósitos |
| POST | `/api/warehouses` | Crear depósito |
| GET | `/api/warehouses/:id/layout` | Layout completo para el visor 3D |

### Inventory
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/inventory/cell/:cellCode` | Datos de una celda |
| PUT | `/api/inventory/cell/:cellCode` | Actualizar cantidad (registra movimiento) |

### Movimientos
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/movements` | Historial de movimientos |

### Conectores
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/connectors` | Listar conectores del workspace |
| POST | `/api/connectors` | Crear conector |
| POST | `/api/connectors/:id/sync` | Disparar sync manual |
| GET | `/api/connectors/:id/logs` | Logs de sync |
| POST | `/api/connectors/excel/preview` | Preview de archivo Excel |
| POST | `/api/connectors/excel/import` | Importar Excel al depósito |
| GET | `/api/connectors/google/auth-url` | URL de autorización Google |
| GET | `/api/connectors/google/callback` | Callback OAuth Google |
| GET | `/api/connectors/powerbi/auth-url` | URL de autorización Power BI |
| GET | `/api/connectors/powerbi/callback` | Callback OAuth Power BI |

### Reportes
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/reports/summary` | Resumen de ocupación |
| GET | `/api/reports/export` | Exportar inventario a Excel |

---

## WebSocket

Conectar al WS en `ws://localhost:4000/ws`

### Unirse a un workspace:
```json
{ "type": "JOIN", "workspaceId": "uuid", "token": "jwt" }
```

### Eventos que recibe el cliente:
```json
{ "type": "CELL_UPDATED",  "payload": { "cellCode": "R01-B03-L2A", "quantity": 12 } }
{ "type": "SYNC_STARTED",  "payload": { "connectorId": "...", "connectorName": "ERP" } }
{ "type": "SYNC_COMPLETE", "payload": { "rowsRead": 142, "rowsUpdated": 138 } }
{ "type": "SYNC_ERROR",    "payload": { "error": "Connection refused" } }
```

---

## Configuración de conectores

### SQL
```json
{
  "connection": {
    "engine": "postgres",
    "host": "192.168.1.10",
    "port": 5432,
    "database": "erp_client",
    "user": "readonly_user",
    "password": "secret"
  },
  "mapping": {
    "table": "deposito_items",
    "columns": {
      "cellCode":    "ubicacion",
      "sku":         "codigo_producto",
      "productName": "descripcion",
      "quantity":    "stock_actual",
      "maxCapacity": "stock_maximo",
      "expiryDate":  "fecha_vencimiento",
      "supplier":    "proveedor"
    }
  }
}
```

### Google Sheets
```json
{
  "tokens": { "...oauth tokens después del callback..." },
  "spreadsheetId": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "sheetName": "Inventario Marzo",
  "customMapping": {
    "cellCode": "Posición",
    "sku": "Código",
    "quantity": "Cant. Actual"
  }
}
```

### Power BI
```json
{
  "tokens": { "...oauth tokens..." },
  "tenantId": "your-azure-tenant-id",
  "datasetId": "dataset-uuid",
  "tableName": "Inventario",
  "columnMapping": {
    "cellCode": "Ubicacion",
    "sku": "CodigoProducto",
    "quantity": "StockActual"
  }
}
```
