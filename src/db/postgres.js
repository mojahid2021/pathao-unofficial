/**
 * @file    postgres.js
 * @module  PostgresAdapter
 * @desc    PostgreSQL database adapter implementing the universal adapter interface.
 *
 * Wraps the pg (node-postgres) driver and provides:
 *  - Connection management with connection strings or config objects
 *  - Promise-based query execution
 *  - Schema operations (createTable, dropTable, addColumn, removeColumn)
 */

/**
 * PostgreSQL database adapter.
 *
 * Provides interface consistent with SQLite, MySQL, and MongoDB adapters,
 * abstracting the pg driver's Client API behind a common adapter interface.
 *
 * Supports both connection string URLs and configuration objects.
 *
 * @class
 * @param  {Object}   config                - PostgreSQL configuration
 * @param  {Object}   config.connection     - Connection config (URL string or object)
 * @param  {string}   config.connection.host  - Database server hostname
 * @param  {number}   config.connection.port  - Database server port
 * @param  {string}   config.connection.user  - Database user
 * @param  {string}   config.connection.password - Database password
 * @param  {string}   config.connection.database - Database name
 *
 * @example
 *   const adapter = new PostgresAdapter({
 *     connection: {
 *       host: 'localhost',
 *       user: 'postgres',
 *       password: 'secret',
 *       database: 'myapp'
 *     }
 *   });
 *   await adapter.connect();
 */
class PostgresAdapter {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.type = 'postgres';
  }

  /**
   * Connect to the PostgreSQL database.
   *
   * Establishes a client connection using the configured connection details.
   *
   * @returns {Promise<PostgresAdapter>} - Connected adapter instance (for chaining)
   * @throws  {Error}                    - If pg driver not installed or connection fails
   *
   * @example
   *   await adapter.connect();
   */
  async connect() {
    const pgModule = await import('pg').catch(() => {
      throw new Error(
        'PostgreSQL driver not available. Please install `pg`: npm install pg'
      );
    });

    const { Client } = pgModule;
    this.client = new Client(this.config.connection);
    await this.client.connect();
    return this;
  }

  /**
   * Close the database connection.
   *
   * Gracefully closes the PostgreSQL client connection.
   *
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.close();
   */
  async close() {
    if (this.client) {
      await this.client.end();
    }
  }

  /**
   * Execute a query against the database.
   *
   * Returns the full result object from pg query execution.
   * Use for INSERT, UPDATE, DELETE, SELECT statements.
   *
   * @param  {string}  sql     - SQL statement with $1, $2, etc. placeholders
   * @param  {Array}   params  - Parameterized values for placeholders
   * @returns {Promise<Object>} - Query result object with rows property
   * @throws  {Error}          - If query execution fails
   *
   * @example
   *   const result = await adapter.run('SELECT * FROM users WHERE id = $1', [1]);
   *   console.log(result.rows[0]); // First row
   */
  async run(sql, params = []) {
    const result = await this.client.query(sql, params);
    return result;
  }

  /**
   * Create a new table with the specified schema.
   *
   * Executes CREATE TABLE IF NOT EXISTS, making it safe to call multiple times.
   *
   * @param  {string}  tableName  - Name of the table to create
   * @param  {Object}  columns    - Column definitions as key-value pairs
   * @returns {Promise<void>}
   * @throws  {Error}             - If table creation fails
   *
   * @example
   *   await adapter.createTable('users', {
   *     id: 'SERIAL PRIMARY KEY',
   *     name: 'VARCHAR(255) NOT NULL'
   *   });
   */
  async createTable(tableName, columns = {}) {
    const columnDefinitions = Object.entries(columns)
      .map(([columnName, columnType]) => `${columnName} ${columnType}`)
      .join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnDefinitions})`;
    return this.run(sql);
  }

  /**
   * Drop a table from the database.
   *
   * **DESTRUCTIVE**: Removes the table and all its data.
   * Executes DROP TABLE IF EXISTS, safe for non-existent tables.
   *
   * @param  {string}  tableName  - Name of the table to drop
   * @returns {Promise<void>}
   * @throws  {Error}             - If table drop fails
   *
   * @example
   *   await adapter.dropTable('users');
   */
  async dropTable(tableName) {
    return this.run(`DROP TABLE IF EXISTS ${tableName}`);
  }

  /**
   * Add a new column to an existing table.
   *
   * Uses ALTER TABLE ADD COLUMN syntax.
   *
   * @param  {string}  tableName    - Name of the existing table
   * @param  {string}  columnName   - Name of the new column
   * @param  {string}  columnType   - SQL type for the column
   * @returns {Promise<void>}
   * @throws  {Error}               - If column addition fails
   *
   * @example
   *   await adapter.addColumn('users', 'email', 'VARCHAR(255) NOT NULL');
   */
  async addColumn(tableName, columnName, columnType) {
    return this.run(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`
    );
  }

  /**
   * Remove a column from an existing table.
   *
   * Executes ALTER TABLE DROP COLUMN IF EXISTS for safe removal.
   *
   * @param  {string}  tableName   - Name of the table
   * @param  {string}  columnName  - Name of the column to remove
   * @returns {Promise<void>}
   * @throws  {Error}              - If column removal fails
   *
   * @example
   *   await adapter.removeColumn('users', 'deprecated_field');
   */
  async removeColumn(tableName, columnName) {
    return this.run(
      `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName}`
    );
  }
}

export { PostgresAdapter };
