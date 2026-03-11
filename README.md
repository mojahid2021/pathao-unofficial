# pathao-unofficial

Unofficial Pathao delivery API client library for Node.js. Provides OAuth token management, delivery pricing, order creation, and location hierarchy synchronization.

## Installation

```bash
npm install pathao-unofficial
```

## Database Setup

This package supports multiple databases for token and location data storage. Choose one:

```bash
# SQLite (lightweight, development):
npm install sqlite3

# PostgreSQL:
npm install pg

# MySQL:
npm install mysql2

# MongoDB:
npm install mongodb
```

## Configuration

Set environment variables for Pathao API credentials:

```bash
export PATHAO_BASE_URL=https://courier-api-sandbox.pathao.com
export PATHAO_CLIENT_ID=your-client-id
export PATHAO_CLIENT_SECRET=your-client-secret
export PATHAO_USERNAME=your-username
export PATHAO_PASSWORD=your-password

# Optional: database connection string
export DB_TYPE=sqlite       # Options: sqlite, postgres, mysql, mongodb
export DB_PATH=/tmp/app.db  # (SQLite only)
export DB_HOST=localhost    # (PostgreSQL/MySQL only)
export DB_PORT=5432         # (PostgreSQL/MySQL only)
export DB_NAME=pathao_db
export DB_USER=username
export DB_PASSWORD=password
```

## Quick Start: Token Management

### 1. Issue Token from Credentials

```javascript
import { getAndSaveTokenFromEnv } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

// Initialize database adapter
const adapter = await createAdapterFromEnv({ connect: true });

// Issue token using environment credentials and save to database
const token = await getAndSaveTokenFromEnv(adapter);
console.log('Token issued:', token.access_token);

// Close connection when done
await adapter.close();
```

### 2. Retrieve Stored Token

```javascript
import { getLatestToken } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// Get the most recently stored token
const token = await getLatestToken(adapter);

if (token) {
  console.log('Token expires at:', new Date(token.expires_at));
  console.log('Can use token:', token.access_token);
} else {
  console.log('No token stored. Issue one first.');
}

await adapter.close();
```

### 3. Refresh Token

```javascript
import { refreshAndSaveTokenFromDb } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// Refresh token and save new one to database
const newToken = await refreshAndSaveTokenFromDb(adapter, {
  baseUrl: process.env.PATHAO_BASE_URL
});

console.log('New token obtained:', newToken.access_token);
await adapter.close();
```

## Location Hierarchy Management

### 1. Query Location Data

```javascript
import { getCities, getZones, getAreas } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// Get all cities
const cities = await getCities(adapter);
console.log('Cities:', cities);
// Output: [{ city_id: 1, city_name: 'Dhaka' }, ...]

// Get zones for Dhaka (city_id: 1)
const zones = await getZones(adapter, 1);
console.log('Zones in Dhaka:', zones);
// Output: [{ zone_id: 1, zone_name: 'Gulshan' }, ...]

// Get areas in Gulshan (zone_id: 1)
const areas = await getAreas(adapter, 1);
console.log('Areas in Gulshan:', areas);
// Output: [
//   {
//     area_id: 1,
//     area_name: 'Block A',
//     home_delivery_available: 1,
//     pickup_available: 1
//   },
//   ...
// ]

await adapter.close();
```

### 2. Build Hierarchical Location Structure

```javascript
import { getLocationHierarchy } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// Get complete city -> zone -> area hierarchy
const hierarchy = await getLocationHierarchy(adapter);

console.log(JSON.stringify(hierarchy, null, 2));
/*
[
  {
    city_id: 1,
    city_name: 'Dhaka',
    zones: [
      {
        zone_id: 1,
        zone_name: 'Gulshan',
        areas: [
          {
            area_id: 1,
            area_name: 'Block A',
            home_delivery_available: 1,
            pickup_available: 1
          }
        ]
      }
    ]
  }
]
*/

await adapter.close();
```

### 3. Seed Location Data

```javascript
import { seedLocationData } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// Prepare location data
const locationData = {
  cities: [
    { city_id: 1, city_name: 'Dhaka' }
  ],
  zones: [
    { zone_id: 1, city_id: 1, zone_name: 'Gulshan' }
  ],
  areas: [
    {
      area_id: 1,
      zone_id: 1,
      area_name: 'Block A',
      home_delivery_available: 1,
      pickup_available: 1
    }
  ]
};

// Insert data into database
await seedLocationData(adapter, locationData);
console.log('Location data seeded successfully');

await adapter.close();
```

### 4. Sync Locations from Pathao API

```javascript
import { syncLocationsOnce } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// One-time sync from Pathao API
await syncLocationsOnce(adapter, {
  baseUrl: process.env.PATHAO_BASE_URL
});
console.log('Location sync completed');

await adapter.close();
```

### 5. Continuous Location Sync (Background)

```javascript
import { triggerLocationSync } from 'pathao-unofficial';

// Start background sync (runs every 6 hours by default)
const syncHandle = triggerLocationSync(null, {
  baseUrl: process.env.PATHAO_BASE_URL,
  intervalMs: 3600000  // 1 hour sync interval
});

console.log('Background sync started');

// Later: stop syncing
setTimeout(() => {
  syncHandle.stop();
  console.log('Sync stopped');
}, 3600000);
```

## Delivery Pricing & Orders

### 1. Calculate Delivery Price

```javascript
import { calculatePrice, getLatestToken } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });
const token = await getLatestToken(adapter);

// Calculate price for shipment
const price = await calculatePrice(adapter, {
  baseUrl: process.env.PATHAO_BASE_URL,
  token: token.access_token,
  payload: {
    recipient_name: 'John Doe',
    recipient_phone: '01XXXXXXXXX',
    recipient_address: 'House 123, Block A, Gulshan, Dhaka',
    recipient_city: 1,      // City ID
    recipient_zone: 1,      // Zone ID
    recipient_area: 1,      // Area ID
    weight: 2.5,            // Weight in kg
    delivery_type: 'regular' // or 'express'
  }
});

console.log('Delivery price:', price);
// Output: { charge: 120, discount: 0, vat: 0, total: 120 }

await adapter.close();
```

### 2. Create Order

```javascript
import { createOrder, getLatestToken } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });
const token = await getLatestToken(adapter);

// Create delivery order
const order = await createOrder(adapter, {
  baseUrl: process.env.PATHAO_BASE_URL,
  token: token.access_token,
  payload: {
    recipient_name: 'John Doe',
    recipient_phone: '01XXXXXXXXX',
    recipient_address: 'House 123, Block A, Gulshan, Dhaka',
    recipient_city: 1,
    recipient_zone: 1,
    recipient_area: 1,
    weight: 2.5,
    item_type: 1,           // Item type ID
    delivery_type: 'regular',
    comments: 'Handle with care'
  }
});

console.log('Order created:', order.order_id);
console.log('Tracking number:', order.tracking_number);

await adapter.close();
```

## PathaoClient Class (Convenience Wrapper)

```javascript
import { PathaoClient } from 'pathao-unofficial';

// Create client instance
const client = new PathaoClient();

// Get library version
console.log('Library version:', client.version());

// Estimate delivery cost (built-in helper)
const estimate = await client.estimateDelivery({
  distanceKm: 3.2,
  weightKg: 2
});

console.log('Estimated charge:', estimate.baseCharge);
console.log('Weight surcharge:', estimate.weightSurcharge);
console.log('Total estimate:', estimate.totalCharge);
```

## Database Adapter Usage

### Create Adapter Manually

```javascript
import { createAdapter } from 'pathao-unofficial';

// SQLite
const sqlite = await createAdapter({
  type: 'sqlite',
  config: { path: '/tmp/app.db' },
  connect: true
});

// PostgreSQL
const postgres = await createAdapter({
  type: 'postgres',
  config: {
    host: 'localhost',
    port: 5432,
    database: 'pathao',
    user: 'username',
    password: 'password'
  },
  connect: true
});

// MySQL
const mysql = await createAdapter({
  type: 'mysql',
  config: {
    host: 'localhost',
    port: 3306,
    database: 'pathao',
    user: 'username',
    password: 'password'
  },
  connect: true
});

// Use adapter...

// Close connection
await sqlite.close();
await postgres.close();
await mysql.close();
```

### Run Custom Queries

```javascript
import { createAdapterFromEnv } from 'pathao-unofficial';

const adapter = await createAdapterFromEnv({ connect: true });

// PostgreSQL-style placeholders ($1, $2)
if (adapter.type === 'postgres') {
  const result = await adapter.run(
    'SELECT * FROM cities WHERE city_id = $1',
    [1]
  );
  console.log(result.rows);
}

// SQLite/MySQL-style placeholders (?)
if (adapter.type === 'sqlite' || adapter.type === 'mysql') {
  const result = await adapter.run(
    'SELECT * FROM cities WHERE city_id = ?',
    [1]
  );
  console.log(result);
}

await adapter.close();
```

## Error Handling

```javascript
import { getAndSaveTokenFromEnv } from 'pathao-unofficial';
import { createAdapterFromEnv } from 'pathao-unofficial';

try {
  const adapter = await createAdapterFromEnv({ connect: true });

  try {
    const token = await getAndSaveTokenFromEnv(adapter);
    console.log('Token issued successfully');
  } catch (error) {
    if (error.message.includes('PATHAO')) {
      console.error('Pathao API error:', error.message);
    } else {
      console.error('Authentication failed:', error.message);
    }
  } finally {
    await adapter.close();
  }
} catch (error) {
  console.error('Database connection failed:', error.message);
}
```

## API Reference

### Authentication
- `issueToken(baseUrl, credentials)` - Request OAuth token from Pathao
- `saveToken(adapter, token)` - Persist token to database
- `getLatestToken(adapter)` - Retrieve most recent token
- `getAndSaveTokenFromEnv(adapter)` - Issue and save token using env credentials
- `refreshToken(baseUrl, options)` - Refresh access token
- `refreshAndSaveTokenFromDb(adapter, options)` - Refresh and persist

### Locations
- `getCities(adapter)` - List all cities
- `getZones(adapter, cityId)` - List zones in city
- `getAreas(adapter, zoneId)` - List areas in zone
- `seedLocationData(adapter, data)` - Insert location data
- `getLocationHierarchy(adapter)` - Get complete hierarchy
- `syncLocationsOnce(adapter, options)` - Sync from Pathao API
- `triggerLocationSync(adapter, options)` - Background sync task

### Pricing & Orders
- `calculatePrice(adapter, options)` - Get delivery cost estimate
- `createOrder(adapter, options)` - Create delivery order

### Database
- `createAdapter(options)` - Create database adapter
- `createAdapterFromEnv(options)` - Create adapter from environment variables

## Testing

```bash
npm test
```

## License

MIT
await db.addColumn('users', 'email', 'TEXT');
const info = await db.tableInfo('users');
console.log(info);
await db.dropTable('users');
await db.close();
```

Example: choose Postgres

```js
import { createAdapter } from './src/db/index.js';

const db = createAdapter('postgres', { connection: { host: 'localhost', user: 'me', password: 'pw', database: 'db' } });
await db.connect();
await db.createTable('items', { id: 'SERIAL PRIMARY KEY', name: 'TEXT' });
await db.close();
```

Example: choose MySQL

```js
import { createAdapter } from './src/db/index.js';

const db = createAdapter('mysql', { connection: { host: 'localhost', user: 'me', password: 'pw', database: 'db' } });
await db.connect();
await db.createTable('things', { id: 'INT AUTO_INCREMENT PRIMARY KEY', name: 'VARCHAR(255)' });
await db.close();
```

MongoDB notes

This adapter maps SQL "tables" to MongoDB collections. Use `createAdapter('mongodb', { uri, dbName })`, then use `connect()`, `createTable`/`dropTable` to manage collections, and `insertOne`/`find` for data operations.

Example:

```js
import { createAdapter } from './src/db/index.js';
const db = createAdapter('mongodb', { uri: process.env.MONGODB_URI, dbName: 'pathao_unofficial' });
await db.connect();
await db.createTable('cities');
await db.insertOne('cities', { city_id: 1, city_name: 'Dhaka' });
const cities = await db.find('cities', {});
console.log(cities);
await db.dropTable('cities');
await db.close();
```

Testing

```
npm test
```

## Configuration & Environment (professional)

Use environment variables as the single source of truth for credentials and deployment configuration. Do not store secrets (client secret, user password, DB passwords) in the database or in version control. For local development, keep a `.env` file out of version control and use `dotenv`.

Recommended env variables:

- `PATHAO_BASE_URL` — Pathao API base URL (sandbox or production)
- `PATHAO_CLIENT_ID` — OAuth client id
- `PATHAO_CLIENT_SECRET` — OAuth client secret
- `PATHAO_USERNAME` — Merchant username/email
- `PATHAO_PASSWORD` — Merchant password

Database selection via environment

Set `DB_TYPE` (one of `sqlite`, `postgres`, `mysql`, `mongodb`) and `DATABASE_URL` (or DB-specific env vars). The library exposes `createAdapterFromEnv({ connect: true })` which will create and (optionally) connect the chosen adapter.

Examples:

- SQLite (in-memory):
	- `export DB_TYPE=sqlite`
	- `export DATABASE_URL=sqlite://:memory:`

- Postgres (connection URL):
	- `export DB_TYPE=postgres`
	- `export DATABASE_URL=postgres://user:pass@localhost:5432/dbname`

- MySQL (connection URL):
	- `export DB_TYPE=mysql`
	- `export DATABASE_URL=mysql://user:pass@localhost:3306/dbname`

- MongoDB:
	- `export DB_TYPE=mongodb`
	- `export DATABASE_URL=mongodb://user:pass@localhost:27017`
	- `export MONGODB_DB=pathao_unofficial` (optional)

Usage example:

```js
import { createAdapterFromEnv } from 'pathao-unofficial';
// create + connect
const adapter = await createAdapterFromEnv({ connect: true });
// use adapter (e.g., seed schema, request tokens)
```

Usage (modern, safe flow):

1. Provision secrets to your runtime environment (env vars, secret manager).
2. On startup, create a DB adapter and connect (e.g., SQLite for local, Postgres for prod).
3. Call `getAndSaveTokenFromEnv(adapter)` to issue a token using env credentials and persist only the token and expiry.
4. Use `getLatestToken(adapter)` to fetch the active token when making API calls.

Example code snippet:

```js
import { createAdapter, getAndSaveTokenFromEnv, getLatestToken } from 'pathao-unofficial';

// create adapter and connect (sqlite example)
const db = createAdapter('sqlite', { filename: ':memory:' });
await db.connect();

// issue token (reads PATHAO_* env vars) and save token record
const token = await getAndSaveTokenFromEnv(db);

// later when calling Pathao APIs
const stored = await getLatestToken(db);
const accessToken = stored && stored.access_token;
```

Security notes:

- Use short-lived tokens where possible and rotate credentials.
- Use platform secret stores (AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) in production and inject as env vars.
- Ensure `.env` files are listed in `.gitignore`.


License

MIT

## Sync worker & rate limits

The library provides a background sync worker that fetches cities → zones → areas from the Pathao API and persists them to the configured database. Pathao's API may enforce rate limits and transient errors — the sync worker implements retry/backoff logic so the overall sync flow is never lost.

- Retries: the sync uses a `fetchWithRetry` helper which retries on HTTP 429 and common transient server/network errors (502/503/504 and network failures).
- Backoff delays: retries wait for 1 minute, 2 minutes, 4 minutes, then 6 minutes (configurable in code via options).
- Behavior: the worker logs retry attempts and resumes the sync where it left off; transient failures do not discard already persisted records.
- Token refresh: if you expect access tokens to expire during long sync runs, implement a token-refresh flow (see `refreshToken` / `refreshAndSaveTokenFromDb` in `src/pathao/client.js`) and call it when you receive 401 responses in your environment. Integrating automatic token refresh into the sync loop is a recommended next step.

Example: start background sync (default interval 6 hours)

```js
import { createAdapterFromEnv, triggerLocationSync } from 'pathao-unofficial';
// Option A: Let the library auto-create the adapter from environment
// (no arguments). The worker will read `PATHAO_BASE_URL` and DB env vars
// from your runtime environment automatically.
const worker = triggerLocationSync();

// Option B: Create adapter yourself and pass it in (gives more control)
// const adapter = await createAdapterFromEnv({ connect: true });
// const worker = triggerLocationSync(adapter);
// stop later
// worker.stop();
```

This approach keeps the sync robust against intermittent rate limits while ensuring data is persisted incrementally.

## Price Calculation API

The package includes a helper to call Pathao's price calculation endpoint `/aladdin/api/v1/merchant/price-plan`.

Usage:

```js
import { calculatePrice } from 'pathao-unofficial';

// payload example
const payload = {
	store_id: 123,
	item_type: 2,
	delivery_type: 48,
	item_weight: 0.5,
	recipient_city: 1,
	recipient_zone: 10
};

// Option A: pass a DB adapter to read token from DB
// const res = await calculatePrice(adapter, payload);

// Option B: pass token directly (or rely on PATHAO_BASE_URL + DB token)
// const res = await calculatePrice(null, payload, { token: process.env.PATHAO_TOKEN });

// Response example (200):
// { message: 'price', type: 'success', code: 200, data: { price: 80, final_price: 80, ... } }
```

Request parameters:
- `store_id` (integer, required)
- `item_type` (integer, required) — 1=document, 2=parcel
- `delivery_type` (integer, required) — 48=normal, 12=on-demand
- `item_weight` (float, required) — 0.5–10 kg
- `recipient_city` (integer, required)
- `recipient_zone` (integer, required)

The helper will read `PATHAO_BASE_URL` from env if not provided in options. It expects an access token either via `options.token` or stored in the DB (via `getAndSaveTokenFromEnv` / `saveToken`).

## Create Order API

Use `createOrder` to create a new order via `/aladdin/api/v1/orders`.

Usage:

```js
import { createOrder } from 'pathao-unofficial';

const payload = {
	store_id: 123,
	merchant_order_id: 'ABC-123',
	recipient_name: 'Demo Recipient',
	recipient_phone: '017XXXXXXXX',
	recipient_address: 'House 123, Road 4, Sector 10, Uttara, Dhaka-1230',
	delivery_type: 48,
	item_type: 2,
	special_instruction: 'Need to Deliver before 5 PM',
	item_quantity: 1,
	item_weight: 0.5,
	item_description: 'Cloth item',
	amount_to_collect: 900
};

// Option A: pass adapter to read token from DB
// const res = await createOrder(adapter, payload);

// Option B: pass token directly
// const res = await createOrder(null, payload, { token: process.env.PATHAO_TOKEN });

// Success response (200):
// { message: 'Order Created Successfully', type: 'success', code: 200, data: { consignment_id: '...', merchant_order_id: 'ABC-123', order_status: 'Pending', delivery_fee: 80 } }
```

Required fields in `payload`:
- `store_id` (integer)
- `recipient_name` (string)
- `recipient_phone` (string, 11 chars)
- `recipient_address` (string)
- `delivery_type` (integer)
- `item_type` (integer)
- `item_quantity` (integer)
- `item_weight` (float)
- `amount_to_collect` (integer)

Optional: `merchant_order_id`, `recipient_secondary_phone`, `recipient_city`, `recipient_zone`, `recipient_area`, `special_instruction`, `item_description`.

## Hierarchical Locations

You can fetch locations from the DB in a hierarchical shape (cities → zones → areas) with `getLocationHierarchy`.

```js
import { getLocationHierarchy } from 'pathao-unofficial';

const tree = await getLocationHierarchy(adapter);
// Example output:
// [ { city_id: 1, city_name: 'Dhaka', zones: [ { zone_id: 10, zone_name: 'Uttara', areas: [ { area_id: 100, area_name: 'Sector 10', ... } ] } ] } ]
```

This is convenient for building address pickers or returning full location trees to clients.
