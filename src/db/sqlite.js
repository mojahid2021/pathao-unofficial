/**
 * @file    sqlite.js
 * @module  SQLiteAdapter
 * @desc    SQLite database adapter implementing the universal adapter interface.
 *
 * Wraps the sqlite3 Node.js driver and provides:
 *  - Connection management with in-memory and file-based databases
 *  - Promise-based query execution (all, get, run)
 *  - Schema operations (createTable, dropTable, addColumn, tableInfo)
 */

/**
 * SQLite database adapter for file and in-memory databases.
 *
 * Provides Promise-based interface wrapping sqlite3's callback-based API,
 * enabling consistent usage with PostgreSQL, MySQL, and MongoDB adapters.
 *
 * Supports both in-memory (`:memory:`) and persisted file databases.
 *
 * @class
 * @param  {Object}   config            - SQLite configuration
 * @param  {string}   config.filename   - Database file path or ':memory:' for in-memory DB
 *
 * @example
 *   const adapter = new SQLiteAdapter({ filename: 'app.db' });
 *   await adapter.connect();
 *   const users = await adapter.all('SELECT * FROM users');
 *   await adapter.close();
 */
class SQLiteAdapter {
  constructor(config = {}) {
    this.config = config;
    this.database = null;
    this.type = 'sqlite';

    // Promise-wrapped async methods (initialized in connect)
    this.runAsync = null;
    this.allAsync = null;
    this.getAsync = null;
  }

  /**
   * Connect to the SQLite database.
   *
   * Loads the sqlite3 driver and initializes the database connection.
   * Converts callback-based sqlite3 API to Promise-based methods.
   *
   * @returns {Promise<SQLiteAdapter>} - Connected adapter instance (for chaining)
   * @throws  {Error}                  - If sqlite3 is not installed or connection fails
   *
   * @example
   *   await adapter.connect();
   */
  async connect() {
    const sqliteModule = await import('sqlite3').catch(() => {
      throw new Error(
        'SQLite driver not available. Please install `sqlite3`: npm install sqlite3'
      );
    });

    let sqlite = sqliteModule.default || sqliteModule;

    // Enable verbose logging for debugging (optional)
    if (typeof sqlite.verbose === 'function') {
      sqlite = sqlite.verbose();
    }

    const Database = sqlite.Database;
    this.database = new Database(this.config.filename || ':memory:');

    // Wrap callback-based methods as Promises
    this.runAsync = (sql, params = []) =>
      new Promise((resolve, reject) => {
        this.database.run(sql, params, function handleRunCallback(error) {
          if (error) {
            reject(error);
          } else {
            resolve(this);
          }
        });
      });

    this.allAsync = (sql, params = []) =>
      new Promise((resolve, reject) => {
        this.database.all(sql, params, (error, rows) => {
          if (error) {
            reject(error);
          } else {
            resolve(rows);
          }
        });
      });

    this.getAsync = (sql, params = []) =>
      new Promise((resolve, reject) => {
        this.database.get(sql, params, (error, row) => {
          if (error) {
            reject(error);
          } else {
            resolve(row);
          }
        });
      });

    return this;
  }

  /**
   * Close the database connection.
   *
   * Gracefully closes the SQLite database connection and releases resources.
   *
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.close();
   */
  async close() {
    if (this.database) {
      this.database.close();
    }
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE).
   *
   * @param  {string}  sql     - SQL statement with placeholders
   * @param  {Array}   params  - Parameterized values for placeholders
   * @returns {Promise<Object>} - Result object containing affected row info
   * @throws  {Error}          - If query execution fails
   *
   * @example
   *   await adapter.run('INSERT INTO users (name) VALUES (?)', ['John']);
   */
  async run(sql, params = []) {
    return this.runAsync(sql, params);
  }

  /**
   * Execute a query that returns multiple rows.
   *
   * @param  {string}  sql     - SQL SELECT statement
   * @param  {Array}   params  - Parameterized values for placeholders
   * @returns {Promise<Array>}  - Array of row objects
   * @throws  {Error}          - If query execution fails
   *
   * @example
   *   const users = await adapter.all('SELECT * FROM users WHERE age > ?', [18]);
   */
  async all(sql, params = []) {
    return this.allAsync(sql, params);
  }

  /**
   * Execute a query that returns a single row.
   *
   * @param  {string}  sql     - SQL SELECT statement
   * @param  {Array}   params  - Parameterized values for placeholders
   * @returns {Promise<Object|null>} - Single row object or null if not found
   * @throws  {Error}                 - If query execution fails
   *
   * @example
   *   const user = await adapter.get('SELECT * FROM users WHERE id = ?', [1]);
   */
  async get(sql, params = []) {
    return this.getAsync(sql, params);
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
   *     id: 'INTEGER PRIMARY KEY',
   *     name: 'TEXT NOT NULL'
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
   *   await adapter.addColumn('users', 'email', 'TEXT NOT NULL');
   */
  async addColumn(tableName, columnName, columnType) {
    return this.run(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`
    );
  }

  /**
   * Remove a column from an existing table.
   *
   * **LIMITATION**: SQLite does not support direct DROP COLUMN.
   * Use table recreation workflow instead.
   *
   * @param  {string}  tableName   - Name of the table
   * @param  {string}  columnName  - Name of the column to remove
   * @returns {Promise<void>}
   * @throws  {Error}              - Always throws; not supported in SQLite
   *
   * @example
   *   // This operation is not supported in SQLite
   *   await adapter.removeColumn('users', 'deprecated_field');
   */
  async removeColumn(tableName, columnName) {
    throw new Error(
      'SQLite does not support DROP COLUMN directly. ' +
        'Use table recreation workflow instead.'
    );
  }

  /**
   * Get schema information about a table.
   *
   * Returns PRAGMA table_info output describing columns and their types.
   *
   * @param  {string}  tableName  - Name of the table to inspect
   * @returns {Promise<Array>}     - Array of column info objects
   * @throws  {Error}              - If table info retrieval fails
   *
   * @example
   *   const schema = await adapter.tableInfo('users');
   *   // [{cid: 0, name: 'id', type: 'INTEGER', notnull: 1, dflt_value: null, pk: 1}, ...]
   */
  async tableInfo(tableName) {
    return this.all(`PRAGMA table_info(${tableName})`);
  }
}

export { SQLiteAdapter };
