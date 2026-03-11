/**
 * @file    mysql.js
 * @module  MySQLAdapter
 * @desc    MySQL database adapter implementing the universal adapter interface.
 *
 * Wraps the mysql2/promise driver and provides:
 *  - Connection pool management
 *  - Promise-based query execution
 *  - Schema operations (createTable, dropTable, addColumn, removeColumn)
 */

/**
 * MySQL database adapter using connection pools.
 *
 * Provides interface consistent with SQLite, PostgreSQL, and MongoDB adapters,
 * abstracting the mysql2/promise driver's pool API behind a common adapter interface.
 *
 * Supports both connection string URLs and configuration objects.
 *
 * @class
 * @param  {Object}   config                  - MySQL configuration
 * @param  {Object}   config.connection       - Connection config (URL string or object)
 * @param  {string}   config.connection.host  - Database server hostname
 * @param  {number}   config.connection.port  - Database server port
 * @param  {string}   config.connection.user  - Database user
 * @param  {string}   config.connection.password - Database password
 * @param  {string}   config.connection.database - Database name
 *
 * @example
 *   const adapter = new MySQLAdapter({
 *     connection: {
 *       host: 'localhost',
 *       user: 'root',
 *       password: 'secret',
 *       database: 'myapp'
 *     }
 *   });
 *   await adapter.connect();
 */
class MySQLAdapter {
  constructor(config = {}) {
    this.config = config;
    this.pool = null;
    this.type = 'mysql';
  }

  /**
   * Connect to the MySQL database.
   *
   * Creates a connection pool using the configured connection details.
   *
   * @returns {Promise<MySQLAdapter>} - Connected adapter instance (for chaining)
   * @throws  {Error}                 - If mysql2 driver not installed or connection fails
   *
   * @example
   *   await adapter.connect();
   */
  async connect() {
    const mysqlModule = await import('mysql2/promise').catch(() => {
      throw new Error(
        'MySQL driver not available. Please install `mysql2`: npm install mysql2'
      );
    });

    this.pool = await mysqlModule.createPool(this.config.connection || {});
    return this;
  }

  /**
   * Close all connections in the pool.
   *
   * Gracefully closes the MySQL connection pool and releases resources.
   *
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.close();
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  /**
   * Execute a query against the database.
   *
   * Returns the rows array from query execution.
   *
   * @param  {string}  sql     - SQL statement with ? placeholders
   * @param  {Array}   params  - Parameterized values for placeholders
   * @returns {Promise<Array>}  - Array of result rows
   * @throws  {Error}          - If query execution fails
   *
   * @example
   *   const rows = await adapter.run('SELECT * FROM users WHERE id = ?', [1]);
   *   console.log(rows[0]); // First row
   */
  async run(sql, params = []) {
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  /**
   * Create a new table with the specified schema.
   *
   * Executes CREATE TABLE IF NOT EXISTS, making it safe to call multiple times.
   * Backticks are used to escape table and column names for MySQL compatibility.
   *
   * @param  {string}  tableName  - Name of the table to create
   * @param  {Object}  columns    - Column definitions as key-value pairs
   * @returns {Promise<void>}
   * @throws  {Error}             - If table creation fails
   *
   * @example
   *   await adapter.createTable('users', {
   *     id: 'INT AUTO_INCREMENT PRIMARY KEY',
   *     name: 'VARCHAR(255) NOT NULL'
   *   });
   */
  async createTable(tableName, columns = {}) {
    const columnDefinitions = Object.entries(columns)
      .map(
        ([columnName, columnType]) =>
          `\`${columnName}\` ${columnType}`
      )
      .join(', ');

    const sql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${columnDefinitions})`;
    return this.run(sql);
  }

  /**
   * Drop a table from the database.
   *
   * **DESTRUCTIVE**: Removes the table and all its data.
   * Executes DROP TABLE IF EXISTS, safe for non-existent tables.
   * Backticks are used to escape table names.
   *
   * @param  {string}  tableName  - Name of the table to drop
   * @returns {Promise<void>}
   * @throws  {Error}             - If table drop fails
   *
   * @example
   *   await adapter.dropTable('users');
   */
  async dropTable(tableName) {
    return this.run(`DROP TABLE IF EXISTS \`${tableName}\``);
  }

  /**
   * Add a new column to an existing table.
   *
   * Uses ALTER TABLE ADD COLUMN syntax with backtick escaping.
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
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnType}`
    );
  }

  /**
   * Remove a column from an existing table.
   *
   * Executes ALTER TABLE DROP COLUMN IF EXISTS with backtick escaping.
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
      `ALTER TABLE \`${tableName}\` DROP COLUMN IF EXISTS \`${columnName}\``
    );
  }
}

export { MySQLAdapter };
