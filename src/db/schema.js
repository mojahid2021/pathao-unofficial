/**
 * @file    schema.js
 * @module  DatabaseSchema
 * @desc    Database schema definitions and migration functions for
 *          location data (cities, zones, areas) and OAuth token storage.
 *
 * Key responsibilities:
 *  - Create normalized location and authentication tables
 *  - Provide schema teardown for testing and cleanup
 */

// ─── Location Schema ───────────────────────────────────────────────────────

/**
 * Create location hierarchy tables (cities, zones, areas) in the database.
 *
 * Creates three related tables representing Pathao's geographic structure:
 *  - cities: Map of city IDs to city names
 *  - zones: Zones within cities
 *  - areas: Delivery areas within zones with service availability flags
 *
 * Idempotent: safe to call multiple times on existing schema.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<void>}
 * @throws  {Error}           - If table creation fails
 *
 * @example
 *   await createLocationTables(adapter);
 */
async function createLocationTables(adapter) {
  // Cities: Geographic cities serviced by Pathao
  await adapter.createTable('cities', {
    city_id: 'INTEGER PRIMARY KEY',
    city_name: 'TEXT NOT NULL',
  });

  // Zones: Geographic zones within each city
  await adapter.createTable('zones', {
    zone_id: 'INTEGER PRIMARY KEY',
    city_id: 'INTEGER NOT NULL',
    zone_name: 'TEXT NOT NULL',
  });

  // Areas: Delivery areas within zones with service capabilities
  await adapter.createTable('areas', {
    area_id: 'INTEGER PRIMARY KEY',
    zone_id: 'INTEGER NOT NULL',
    area_name: 'TEXT NOT NULL',
    home_delivery_available: 'BOOLEAN DEFAULT 0',
    pickup_available: 'BOOLEAN DEFAULT 0',
  });
}

/**
 * Drop all location hierarchy tables from the database.
 *
 * DESTRUCTIVE: Removes cities, zones, and areas tables completely.
 * Use only for testing or cleanup operations.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<void>}
 * @throws  {Error}           - If table deletion fails
 *
 * @example
 *   await dropLocationTables(adapter);
 */
async function dropLocationTables(adapter) {
  // Drop in reverse dependency order to avoid foreign key conflicts
  await adapter.dropTable('areas');
  await adapter.dropTable('zones');
  await adapter.dropTable('cities');
}

export { createLocationTables, dropLocationTables };

/**
 * Create OAuth token storage table in the database.
 *
 * Creates a single table to persist OAuth tokens received from Pathao's
 * authentication API. Tokens are never stored in plaintext; this table
 * is for authenticated servers only.
 *
 * Idempotent: safe to call multiple times on existing schema.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<void>}
 * @throws  {Error}           - If table creation fails
 *
 * @example
 *   await createAuthTables(adapter);
 */
async function createAuthTables(adapter) {
  // Use database-appropriate auto-increment primary key syntax
  let idColumnType;
  if (adapter.type === 'postgres') {
    idColumnType = 'SERIAL PRIMARY KEY';
  } else if (adapter.type === 'mysql') {
    idColumnType = 'INT AUTO_INCREMENT PRIMARY KEY';
  } else {
    idColumnType = 'INTEGER PRIMARY KEY AUTOINCREMENT';
  }

  await adapter.createTable('oauth_tokens', {
    id: idColumnType,
    access_token: 'TEXT NOT NULL',
    refresh_token: 'TEXT',
    token_type: 'TEXT',
    expires_at: 'INTEGER',
  });
}

/**
 * Drop authentication token table from the database.
 *
 * DESTRUCTIVE: Removes all stored OAuth tokens.
 * Use only for testing or cleanup operations.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<void>}
 * @throws  {Error}           - If table deletion fails
 *
 * @example
 *   await dropAuthTables(adapter);
 */
async function dropAuthTables(adapter) {
  await adapter.dropTable('oauth_tokens');
}

export { createAuthTables, dropAuthTables };
