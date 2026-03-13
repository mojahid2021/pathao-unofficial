/**
 * @file    index.js
 * @module  DatabaseAdapterFactory
 * @desc    Factory functions for creating database adapters and managing
 *          database connections across multiple ORM/driver libraries
 *          (PostgreSQL, MySQL, SQLite, MongoDB).
 *
 * Key responsibilities:
 *  - Create database adapters by type with validation
 *  - Initialize adapters from environment variables
 *  - Normalize database configuration across different drivers
 */

import { PostgresAdapter } from './postgres.js';
import { MySQLAdapter } from './mysql.js';
import { SQLiteAdapter } from './sqlite.js';
import { MongoDBAdapter } from './mongodb.js';

// ─── Constants ─────────────────────────────────────────────────────────────

const SUPPORTED = ['postgres', 'mysql', 'sqlite', 'mongodb'];

// ─── Database Adapter Factory ─────────────────────────────────────────────

/**
 * Create a database adapter instance for the specified database type.
 *
 * Validates the database type and instantiates the appropriate adapter class.
 * Throws an error if an unsupported database type is provided.
 *
 * @param  {string}  databaseType  - Database type: 'postgres', 'mysql', 'sqlite', or 'mongodb'
 * @param  {Object}  config        - Driver-specific configuration object
 * @returns {Object}               - Initialized database adapter instance
 * @throws  {Error}                - If database type is not supported
 *
 * @example
 *   const adapter = createAdapter('sqlite', { filename: ':memory:' });
 *   await adapter.connect();
 */
function createAdapter(databaseType, config = {}) {
  const normalizedType = (databaseType || '').toLowerCase();

  if (!SUPPORTED.includes(normalizedType)) {
    throw new Error(
      `Unsupported database adapter: "${databaseType}". ` +
        `Supported types: ${SUPPORTED.join(', ')}`
    );
  }

  const adapterMap = {
    postgres: () => new PostgresAdapter(config),
    mysql: () => new MySQLAdapter(config),
    sqlite: () => new SQLiteAdapter(config),
    mongodb: () => new MongoDBAdapter(config),
  };

  return adapterMap[normalizedType]();
}

export { createAdapter, SUPPORTED };

// ─── Environment-Based Adapter Factory ────────────────────────────────────

/**
 * Create a database adapter from environment variables.
 *
 * Reads database configuration from process.env with support for multiple
 * naming conventions:
 *  - DB_TYPE, DATABASE_TYPE, DB (defaults to 'sqlite')
 *  - DATABASE_URL or DB_URL for connection strings
 *  - Database-specific env variables (e.g., PGHOST, MYSQL_USER, MONGODB_URI)
 *
 * Optionally connects the adapter immediately if options.connect is true.
 *
 * @param  {Object}   options              - Configuration options
 * @param  {boolean}  options.connect      - Connect after creation (default: false)
 * @returns {Promise<Object>}               - Connected or initialized adapter instance
 * @throws  {Error}                        - If required env vars are missing or connection fails
 *
 * @example
 *   // Requires: DB_TYPE, DATABASE_URL or DB-specific env vars
 *   const adapter = await createAdapterFromEnv({ connect: true });
 *   await adapter.close();
 */
async function createAdapterFromEnv(options = {}) {
  const environmentVariables = process.env;
  const databaseType = (
    environmentVariables.DB_TYPE ||
    environmentVariables.DATABASE_TYPE ||
    environmentVariables.DB ||
    'sqlite'
  ).toLowerCase();

  const connectionUrl = environmentVariables.DATABASE_URL || environmentVariables.DB_URL || null;

  const adapterConfig = buildAdapterConfig(databaseType, {
    connectionUrl,
    env: environmentVariables,
  });

  const adapter = createAdapter(databaseType, adapterConfig);

  if (options.connect) {
    await adapter.connect();
  }

  return adapter;
}

/**
 * Build database-specific configuration object from environment variables.
 *
 * Normalizes configuration across different database drivers, handling
 * connection URLs and individual environment variable mappings.
 *
 * @param  {string}  databaseType - Database type identifier
 * @param  {Object}  context      - Context with connectionUrl and env variables
 * @returns {Object}              - Driver-specific configuration object
 * @private
 */
function buildAdapterConfig(databaseType, { connectionUrl, env }) {
  switch (databaseType) {
    case 'sqlite':
      return buildSqliteConfig({ connectionUrl, env });

    case 'postgres':
      return buildPostgresConfig({ connectionUrl, env });

    case 'mysql':
      return buildMysqlConfig({ connectionUrl, env });

    case 'mongodb':
      return buildMongodbConfig({ connectionUrl, env });

    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
}

/**
 * Build SQLite configuration.
 * @private
 */
function buildSqliteConfig({ connectionUrl, env }) {
  let filename = ':memory:';

  if (connectionUrl) {
    // Parse sqlite:// URLs by stripping protocol and slashes
    filename = connectionUrl
      .replace(/^sqlite:\/\//, '')
      .replace(/^\/*/, '');

    if (!filename) {
      filename = ':memory:';
    }
  } else if (env.SQLITE_FILE) {
    filename = env.SQLITE_FILE;
  }

  return { filename };
}

/**
 * Build PostgreSQL configuration.
 * @private
 */
function buildPostgresConfig({ connectionUrl, env }) {
  if (connectionUrl) {
    return { connection: connectionUrl };
  }

  return {
    connection: {
      host: env.DB_HOST || env.PGHOST,
      port: env.DB_PORT || env.PGPORT,
      user: env.DB_USER || env.PGUSER,
      password: env.DB_PASS || env.PGPASSWORD,
      database: env.DB_NAME || env.PGDATABASE,
    },
  };
}

/**
 * Build MySQL configuration.
 * @private
 */
function buildMysqlConfig({ connectionUrl, env }) {
  if (connectionUrl) {
    return { connection: connectionUrl };
  }

  return {
    connection: {
      host: env.DB_HOST || env.MYSQL_HOST,
      port: env.DB_PORT || env.MYSQL_PORT,
      user: env.DB_USER || env.MYSQL_USER,
      password: env.DB_PASS || env.MYSQL_PASSWORD,
      database: env.DB_NAME || env.MYSQL_DATABASE,
    },
  };
}

/**
 * Build MongoDB configuration.
 * @private
 */
function buildMongodbConfig({ connectionUrl, env }) {
  const mongoUri = connectionUrl || env.MONGODB_URI || 'mongodb://localhost:27017';
  const databaseName = env.MONGODB_DB || 'pathao_unofficial';

  return {
    uri: mongoUri,
    dbName: databaseName,
  };
}

export { createAdapterFromEnv };
