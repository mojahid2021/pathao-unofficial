/**
 * @file    location.js
 * @module  LocationAPI
 * @desc    Location data access layer for cities, zones, and areas.
 *
 * Provides database-agnostic queries for Pathao geographic hierarchy
 * (cities -> zones -> areas). Handles adapter-specific SQL syntax.
 *
 * Key responsibilities:
 *  - Query geography from database
 *  - Handle multi-database SQL dialect compatibility
 *  - Seed location data into database
 *  - Build hierarchical location structures
 */

// ─── SQL Utilities ────────────────────────────────────────────────────────

/**
 * Get appropriate SQL placeholder for the database adapter.
 *
 * Different databases use different placeholder syntaxes:
 *  - PostgreSQL: $1, $2, $3, ...
 *  - MySQL/SQLite: ?, ?, ?, ...
 *
 * @param  {Object}  adapter      - Database adapter instance
 * @param  {number}  placeholderIndex - Placeholder number (1-based)
 * @returns {string}               - SQL placeholder
 * @private
 */
function getSqlPlaceholder(adapter, placeholderIndex) {
  if (adapter && adapter.type === 'postgres') {
    return `$${placeholderIndex}`;
  }
  return '?';
}

/**
 * Normalize query result format across different database adapters.
 *
 * Different adapters return results in different structures:
 *  - PostgreSQL: { rows: [...] }
 *  - SQLite/MySQL: [...] or { rows: [...] }
 *
 * @param  {*}       result  - Raw result from adapter
 * @returns {Array}          - Normalized array of rows
 * @private
 */
function normalizeQueryResult(result) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  if (result.rows) {
    return result.rows;
  }

  return result;
}

// ─── City Queries ─────────────────────────────────────────────────────────

/**
 * Retrieve all cities from the database.
 *
 * Returns a list of all cities ordered alphabetically by name.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<Array>}   - Array of city objects { city_id, city_name }
 * @throws  {Error}           - If query fails
 *
 * @example
 *   const cities = await getCities(adapter);
 *   // [{ city_id: 1, city_name: 'Dhaka' }, ...]
 */
async function getCities(adapter) {
  const query = 'SELECT city_id, city_name FROM cities ORDER BY city_name';

  if (typeof adapter.all === 'function') {
    return adapter.all(query);
  }

  const result = await adapter.run(query);
  return normalizeQueryResult(result);
}

export { getCities };

// ─── Zone Queries ────────────────────────────────────────────────────────

/**
 * Retrieve all zones for a given city.
 *
 * Returns zones ordered alphabetically by name.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @param  {number}  cityId   - City ID to retrieve zones for
 * @returns {Promise<Array>}   - Array of zone objects { zone_id, zone_name }
 * @throws  {Error}           - If cityId missing or query fails
 *
 * @example
 *   const zones = await getZones(adapter, 1);
 *   // [{ zone_id: 1, zone_name: 'Gulshan' }, ...]
 */
async function getZones(adapter, cityId) {
  if (!cityId) {
    throw new Error('cityId is required to retrieve zones');
  }

  const query =
    'SELECT zone_id, zone_name FROM zones WHERE city_id = ' +
    getSqlPlaceholder(adapter, 1) +
    ' ORDER BY zone_name';

  const params = [cityId];

  if (typeof adapter.all === 'function') {
    return adapter.all(query, params);
  }

  const result = await adapter.run(query, params);
  return normalizeQueryResult(result);
}

export { getZones };

// ─── Area Queries ────────────────────────────────────────────────────────

/**
 * Retrieve all delivery areas for a given zone.
 *
 * Returns areas ordered alphabetically by name, including service availability flags.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @param  {number}  zoneId   - Zone ID to retrieve areas for
 * @returns {Promise<Array>}   - Array of area objects with service flags
 * @throws  {Error}           - If zoneId missing or query fails
 *
 * @example
 *   const areas = await getAreas(adapter, 5);
 *   // [{ area_id: 42, area_name: 'Banani', home_delivery_available: 1, ... }, ...]
 */
async function getAreas(adapter, zoneId) {
  if (!zoneId) {
    throw new Error('zoneId is required to retrieve areas');
  }

  const query =
    'SELECT area_id, area_name, home_delivery_available, pickup_available ' +
    'FROM areas WHERE zone_id = ' +
    getSqlPlaceholder(adapter, 1) +
    ' ORDER BY area_name';

  const params = [zoneId];

  if (typeof adapter.all === 'function') {
    return adapter.all(query, params);
  }

  const result = await adapter.run(query, params);
  return normalizeQueryResult(result);
}

export { getAreas };

// ─── Data Seeding ────────────────────────────────────────────────────────

/**
 * Populate location tables with initial data.
 *
 * Inserts cities, zones, and areas from a data object into the database.
 * Assumes tables already exist (see createLocationTables in schema.js).
 *
 * **Note**: This operation is NOT idempotent. Duplicate data will cause
 * insertion to fail on databases with unique constraints.
 *
 * @param  {Object}  adapter   - Connected database adapter instance
 * @param  {Object}  data      - Location data to seed
 * @param  {Array}   data.cities - Cities array: [{ city_id, city_name }, ...]
 * @param  {Array}   data.zones  - Zones array: [{ zone_id, city_id, zone_name }, ...]
 * @param  {Array}   data.areas  - Areas array: [{ area_id, zone_id, ... }, ...]
 * @returns {Promise<void>}
 * @throws  {Error}             - If insertion fails (e.g., duplicate IDs)
 *
 * @example
 *   await seedLocationData(adapter, {
 *     cities: [{ city_id: 1, city_name: 'Dhaka' }],
 *     zones: [{ zone_id: 1, city_id: 1, zone_name: 'Gulshan' }],
 *     areas: [{ area_id: 1, zone_id: 1, area_name: 'Block A', ... }]
 *   });
 */
async function seedLocationData(adapter, data = {}) {
  const cities = data.cities || [];
  const zones = data.zones || [];
  const areas = data.areas || [];

  const p = (i) => getSqlPlaceholder(adapter, i);

  // Insert cities
  for (const city of cities) {
    await adapter.run(
      `INSERT INTO cities (city_id, city_name) VALUES (${p(1)}, ${p(2)})`,
      [city.city_id, city.city_name]
    );
  }

  // Insert zones
  for (const zone of zones) {
    await adapter.run(
      `INSERT INTO zones (zone_id, city_id, zone_name) VALUES (${p(1)}, ${p(2)}, ${p(3)})`,
      [zone.zone_id, zone.city_id, zone.zone_name]
    );
  }

  // Insert areas
  for (const area of areas) {
    const homeDeliveryFlag = area.home_delivery_available ? 1 : 0;
    const pickupFlag = area.pickup_available ? 1 : 0;

    await adapter.run(
      `INSERT INTO areas (area_id, zone_id, area_name, home_delivery_available, pickup_available) VALUES (${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)})`,
      [area.area_id, area.zone_id, area.area_name, homeDeliveryFlag, pickupFlag]
    );
  }
}

export { seedLocationData };

// ─── Hierarchical Queries ────────────────────────────────────────────────

/**
 * Retrieve complete location hierarchy: cities -> zones -> areas.
 *
 * Performs multiple queries to build a nested data structure representing
 * the full geographic hierarchy. Useful for UI forms and navigation.
 *
 * **Performance Note**: Makes N+1 queries. See sync.js for efficient batch
 * version when loading from Pathao API.
 *
 * @param  {Object}  adapter  - Connected database adapter instance
 * @returns {Promise<Array>}   - Nested hierarchy with cities, zones, and areas
 * @throws  {Error}           - If queries fail
 *
 * @example
 *   const hierarchy = await getLocationHierarchy(adapter);
 *   // [
 *   //  {
 *   //    city_id: 1,
 *   //    city_name: 'Dhaka',
 *   //    zones: [
 *   //      {
 *   //        zone_id: 1,
 *   //        zone_name: 'Gulshan',
 *   //        areas: [{ area_id: 1, area_name: 'Block A', ... }, ...]
 *   //      }, ...
 *   //    ]
 *   //  }, ...
 *   // ]
 */
async function getLocationHierarchy(adapter) {
  const cities = await getCities(adapter);
  const hierarchyOutput = [];

  for (const city of cities) {
    const cityZones = await getZones(adapter, city.city_id);
    const zonesWithAreas = [];

    for (const zone of cityZones) {
      const zoneAreas = await getAreas(adapter, zone.zone_id);
      zonesWithAreas.push({
        ...zone,
        areas: zoneAreas,
      });
    }

    hierarchyOutput.push({
      ...city,
      zones: zonesWithAreas,
    });
  }

  return hierarchyOutput;
}

export { getLocationHierarchy };
