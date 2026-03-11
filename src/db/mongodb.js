/**
 * @file    mongodb.js
 * @module  MongoDBAdapter
 * @desc    MongoDB database adapter implementing the universal adapter interface.
 *
 * Wraps the mongodb driver to provide a SQL-like adapter interface for
 * document operations and collection management, maintaining compatibility
 * with relational database adapters (PostgreSQL, MySQL, SQLite).
 */

/**
 * MongoDB database adapter for NoSQL document operations.
 *
 * Provides a compatibility layer that adapts MongoDB's document-based API
 * to resemble the SQL adapter interface, enabling common usage patterns
 * across different database backends.
 *
 * Supports URI-based and object-based connection configuration.
 *
 * @class
 * @param  {Object}   config            - MongoDB configuration
 * @param  {string}   config.uri        - MongoDB connection URI (default: localhost:27017)
 * @param  {string}   config.dbName     - Database name (default: 'pathao_unofficial')
 * @param  {Object}   config.options    - MongoDB client options
 *
 * @example
 *   const adapter = new MongoDBAdapter({
 *     uri: 'mongodb://localhost:27017',
 *     dbName: 'myapp'
 *   });
 *   await adapter.connect();
 */
class MongoDBAdapter {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.database = null;
    this.type = 'mongodb';
  }

  /**
   * Connect to the MongoDB server.
   *
   * Establishes a client connection and selects the target database.
   * Uses environment variables as fallback for connection details.
   *
   * @returns {Promise<MongoDBAdapter>} - Connected adapter instance (for chaining)
   * @throws  {Error}                   - If mongodb driver not installed or connection fails
   *
   * @example
   *   await adapter.connect();
   */
  async connect() {
    const connectionUri =
      this.config.uri ||
      process.env.MONGODB_URI ||
      'mongodb://localhost:27017';

    const databaseName =
      this.config.dbName ||
      process.env.MONGODB_DB ||
      'pathao_unofficial';

    const mongodbModule = await import('mongodb').catch(() => {
      throw new Error(
        'MongoDB driver not available. Please install `mongodb`: npm install mongodb'
      );
    });

    const { MongoClient } = mongodbModule;
    this.client = new MongoClient(connectionUri, this.config.options || {});
    await this.client.connect();
    this.database = this.client.db(databaseName);

    return this;
  }

  /**
   * Close the connection to MongoDB.
   *
   * Gracefully closes the MongoDB client connection and releases resources.
   *
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.close();
   */
  async close() {
    if (this.client) {
      await this.client.close();
    }
  }

  /**
   * Execute a command (compatibility stub).
   *
   * MongoDB doesn't execute SQL; this returns metadata about the command
   * for compatibility with SQL adapter interface.
   *
   * For actual operations, use direct collection methods or helper functions
   * like insertOne, find, etc.
   *
   * @param  {string}  command  - Command name (not executed)
   * @param  {Array}   params   - Command parameters (not used)
   * @returns {Promise<Object>} - Metadata object { command, params }
   *
   * @example
   *   const meta = await adapter.run('SELECT *', []); // Returns metadata only
   */
  async run(command, params = []) {
    // MongoDB doesn't execute SQL; return metadata for compatibility
    return { command, params };
  }

  /**
   * Create a collection if it doesn't exist.
   *
   * Equivalent to CREATE TABLE in SQL adapters.
   * Uses MongoDB's explicit collection creation.
   *
   * @param  {string}  collectionName  - Name of the collection to create
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.createTable('users');
   */
  async createTable(collectionName) {
    const existingCollections = await this.database
      .listCollections({ name: collectionName })
      .toArray();

    if (existingCollections.length === 0) {
      await this.database.createCollection(collectionName);
    }

    return true;
  }

  /**
   * Drop a collection from the database.
   *
   * **DESTRUCTIVE**: Removes the collection and all its documents.
   * Equivalent to DROP TABLE in SQL adapters.
   *
   * @param  {string}  collectionName  - Name of the collection to drop
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.dropTable('users');
   */
  async dropTable(collectionName) {
    const collection = this.database.collection(collectionName);

    // Safely drop collection even if it doesn't exist
    await collection.drop().catch(() => {
      // Collection doesn't exist; safe to ignore
    });

    return true;
  }

  /**
   * Add a field to all documents in a collection.
   *
   * MongoDB equivalent to ALTER TABLE ADD COLUMN.
   * Updates all existing documents to include the new field.
   *
   * @param  {string}  collectionName - Name of the collection
   * @param  {string}  fieldName      - Name of the field to add
   * @param  {*}       defaultValue   - Default value for the field
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.addColumn('users', 'email', null);
   */
  async addColumn(collectionName, fieldName, defaultValue = null) {
    const collection = this.database.collection(collectionName);

    // Update all documents without this field to include it
    await collection.updateMany(
      { [fieldName]: { $exists: false } },
      { $set: { [fieldName]: defaultValue } }
    );

    return true;
  }

  /**
   * Remove a field from all documents in a collection.
   *
   * MongoDB equivalent to ALTER TABLE DROP COLUMN.
   * Unsets the field on all documents in the collection.
   *
   * @param  {string}  collectionName - Name of the collection
   * @param  {string}  fieldName      - Name of the field to remove
   * @returns {Promise<void>}
   *
   * @example
   *   await adapter.removeColumn('users', 'deprecated_field');
   */
  async removeColumn(collectionName, fieldName) {
    const collection = this.database.collection(collectionName);

    // Unset the field from all documents
    await collection.updateMany({}, { $unset: { [fieldName]: '' } });

    return true;
  }

  /**
   * Insert a single document into a collection.
   *
   * @param  {string}  collectionName  - Name of the collection
   * @param  {Object}  document        - Document to insert
   * @returns {Promise<Object>}         - MongoDB insert result
   * @throws  {Error}                  - If insert fails
   *
   * @example
   *   const result = await adapter.insertOne('users', { name: 'John', email: 'john@example.com' });
   */
  async insertOne(collectionName, document) {
    return this.database.collection(collectionName).insertOne(document);
  }

  /**
   * Find documents in a collection.
   *
   * @param  {string}  collectionName - Name of the collection
   * @param  {Object}  query          - MongoDB query filter
   * @param  {Object}  options        - Query options (sort, limit, etc.)
   * @returns {Promise<Array>}         - Array of matching documents
   * @throws  {Error}                 - If query fails
   *
   * @example
   *   const users = await adapter.find('users', { age: { $gt: 18 } });
   *   const limited = await adapter.find('users', {}, { limit: 10 });
   */
  async find(collectionName, query = {}, options = {}) {
    return this.database
      .collection(collectionName)
      .find(query, options)
      .toArray();
  }
}

export { MongoDBAdapter };
