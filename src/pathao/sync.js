/**
 * @file    sync.js
 * @module  LocationSync
 * @desc    Fetch and synchronize Pathao location hierarchy to database.
 *
 * Provides functions to:
 *  - Fetch cities, zones, areas from Pathao API
 *  - Upsert location data across multiple database engines
 *  - Run continuous sync with exponential backoff retry logic
 *
 * Handles rate limiting and transient server errors with configurable
 * retry delays and maximum attempts. Supports all database adapters
 * (PostgreSQL, MySQL, SQLite, MongoDB) with adapter-specific upsert syntax.
 */

import { getLatestToken } from './client.js';
import { createLocationTables } from '../db/schema.js';
import { createAdapterFromEnv } from '../db/index.js';

// ─── Retry Configuration ──────────────────────────────────────────────────

/**
 * Default exponential backoff delays in milliseconds.
 * Sequence: 60s, 120s, 240s, 360s
 * Prevents overwhelming the API during rate limiting.
 */
const DEFAULT_RETRY_DELAYS = [60_000, 120_000, 240_000, 360_000];

/**
 * Default sync interval: 6 hours (in milliseconds).
 */
const DEFAULT_SYNC_INTERVAL_MS = 1000 * 60 * 60 * 6;

/**
 * HTTP status codes that trigger retry logic.
 */
const RETRYABLE_HTTP_STATUSES = [429, 502, 503, 504];

// ─── Fetch Utilities ──────────────────────────────────────────────────────

/**
 * Ensure fetch API is available globally.
 *
 * For Node.js versions <18, install and polyfill fetch from `undici` package.
 * Modern Node.js (≥18) has native globalThis.fetch.
 *
 * @returns {Promise<void>}
 * @throws  {Error} - If fetch cannot be made available
 * @private
 */
async function ensureFetch() {
  if (globalThis.fetch) {
    return;
  }

  try {
    const undici = await import('undici');
    globalThis.fetch = undici.fetch;
  } catch (error) {
    throw new Error(
      'fetch() is not available. Install Node.js >=18 or add the `undici` package'
    );
  }
}

/**
 * Pause execution for specified milliseconds.
 *
 * Utility for implementing backoff and interval delays.
 *
 * @param   {number} delayMs - Milliseconds to sleep
 * @returns {Promise<void>}
 * @private
 */
function sleep(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

/**
 * Fetch JSON from URL with OAuth authentication.
 *
 * Convenience wrapper. Delegates to fetchWithRetry() with default
 * retry configuration.
 *
 * @param   {string}  url   - URL to fetch from
 * @param   {string}  token - OAuth bearer token (optional)
 * @returns {Promise<Object>} - Parsed JSON response
 * @throws  {Error}   - If fetch fails
 * @private
 */
async function fetchJson(url, token) {
  return fetchWithRetry(url, token);
}

/**
 * Fetch with exponential backoff retry for transient failures.
 *
 * Implements retry logic for rate limiting (429) and server errors (502, 503, 504).
 * Exponential backoff prevents overwhelming the API. Network errors also trigger retries.
 *
 * **Configuration:**
 *  - options.delays: Array of retry delays in ms (default: DEFAULT_RETRY_DELAYS)
 *  - options.maxAttempts: Max fetch attempts (default: delays.length + 1)
 *
 * **HTTP Status Handling:**
 *  - 2xx: Success, return parsed JSON
 *  - 429, 502, 503, 504: Retryable, apply backoff delay
 *  - Other errors: Fail immediately
 *
 * @param   {string}  url     - Target URL
 * @param   {string}  token   - OAuth bearer token (optional)
 * @param   {Object}  options - Configuration object
 * @param   {Array}   options.delays - Retry delays in milliseconds
 * @param   {number}  options.maxAttempts - Maximum fetch attempts
 * @returns {Promise<Object>} - Parsed JSON response
 * @throws  {Error}   - After exhausting retries or non-retryable error
 * @private
 */
async function fetchWithRetry(url, token, options = {}) {
  await ensureFetch();

  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const retryDelays =
    options.delays && Array.isArray(options.delays)
      ? options.delays
      : DEFAULT_RETRY_DELAYS;

  const maxAttempts =
    options.maxAttempts && options.maxAttempts > 0
      ? options.maxAttempts
      : retryDelays.length + 1;

  let attemptCount = 0;

  while (true) {
    attemptCount += 1;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        return response.json();
      }

      // Handle HTTP errors
      const httpStatus = response.status;
      const responseText = await response.text().catch(() => '');

      if (RETRYABLE_HTTP_STATUSES.includes(httpStatus)) {
        if (attemptCount <= maxAttempts) {
          const delayIndex = Math.min(
            attemptCount - 1,
            retryDelays.length - 1
          );
          const currentDelay = retryDelays[delayIndex];

          console.warn(
            `HTTP ${httpStatus} from ${url}; ` +
              `retrying in ${Math.round(currentDelay / 1000)}s ` +
              `(attempt ${attemptCount}/${maxAttempts})`
          );

          await sleep(currentDelay);
          continue;
        }

        const error = new Error(
          `Fetch failed: HTTP ${httpStatus} ${response.statusText}. ` +
            `Response: ${responseText.substring(0, 200)}`
        );
        error.status = httpStatus;
        throw error;
      }

      // Non-retryable HTTP error
      const error = new Error(
        `Fetch failed: HTTP ${httpStatus} ${response.statusText}. ` +
          `Response: ${responseText.substring(0, 200)}`
      );
      error.status = httpStatus;
      throw error;
    } catch (error) {
      // Network error or fetch exception: retry if attempts remain
      if (attemptCount < maxAttempts) {
        const delayIndex = Math.min(attemptCount - 1, retryDelays.length - 1);
        const currentDelay = retryDelays[delayIndex];

        console.warn(
          `Fetch error: ${error.message}; ` +
            `retrying in ${Math.round(currentDelay / 1000)}s ` +
            `(attempt ${attemptCount}/${maxAttempts})`
        );

        await sleep(currentDelay);
        continue;
      }

      throw error;
    }
  }
}

// ─── Database Upsert Operations ────────────────────────────────────────────

/**
 * Insert or update a city in the database.
 *
 * Uses adapter-specific upsert syntax (INSERT OR REPLACE, ON CONFLICT,
 * ON DUPLICATE KEY, MongoDB updateOne with upsert).
 *
 * @param   {Object}  adapter - Connected database adapter
 * @param   {Object}  city    - City object { city_id, city_name }
 * @returns {Promise<void>}
 * @throws  {Error}   - If database operation fails
 * @private
 */
async function upsertCity(adapter, city) {
  const { city_id: cityId, city_name: cityName } = city;

  if (adapter.type === 'mongodb') {
    const collection = adapter.db.collection('cities');
    await collection.updateOne(
      { city_id: cityId },
      { $set: { city_name: cityName } },
      { upsert: true }
    );
    return;
  }

  if (adapter.type === 'postgres') {
    const query =
      'INSERT INTO cities (city_id, city_name) VALUES ($1, $2) ' +
      'ON CONFLICT (city_id) DO UPDATE SET city_name = EXCLUDED.city_name';

    await adapter.run(query, [cityId, cityName]);
    return;
  }

  if (adapter.type === 'mysql') {
    const query =
      'INSERT INTO cities (city_id, city_name) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE city_name = VALUES(city_name)';

    await adapter.run(query, [cityId, cityName]);
    return;
  }

  // SQLite and default fallback
  const query =
    'INSERT OR REPLACE INTO cities (city_id, city_name) VALUES (?, ?)';

  await adapter.run(query, [cityId, cityName]);
}

/**
 * Insert or update a zone in the database.
 *
 * Uses adapter-specific upsert syntax. Handles all supported database engines.
 *
 * @param   {Object}  adapter - Connected database adapter
 * @param   {Object}  zone    - Zone object { zone_id, city_id, zone_name }
 * @returns {Promise<void>}
 * @throws  {Error}   - If database operation fails
 * @private
 */
async function upsertZone(adapter, zone) {
  const { zone_id: zoneId, city_id: cityId, zone_name: zoneName } = zone;

  if (adapter.type === 'mongodb') {
    const collection = adapter.db.collection('zones');
    await collection.updateOne(
      { zone_id: zoneId },
      { $set: { city_id: cityId, zone_name: zoneName } },
      { upsert: true }
    );
    return;
  }

  if (adapter.type === 'postgres') {
    const query =
      'INSERT INTO zones (zone_id, city_id, zone_name) VALUES ($1, $2, $3) ' +
      'ON CONFLICT (zone_id) DO UPDATE SET ' +
      '  city_id = EXCLUDED.city_id, ' +
      '  zone_name = EXCLUDED.zone_name';

    await adapter.run(query, [zoneId, cityId, zoneName]);
    return;
  }

  if (adapter.type === 'mysql') {
    const query =
      'INSERT INTO zones (zone_id, city_id, zone_name) VALUES (?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE ' +
      '  city_id = VALUES(city_id), ' +
      '  zone_name = VALUES(zone_name)';

    await adapter.run(query, [zoneId, cityId, zoneName]);
    return;
  }

  // SQLite and default fallback
  const query =
    'INSERT OR REPLACE INTO zones (zone_id, city_id, zone_name) VALUES (?, ?, ?)';

  await adapter.run(query, [zoneId, cityId, zoneName]);
}

/**
 * Insert or update an area in the database.
 *
 * Uses adapter-specific upsert syntax. Normalizes boolean flags (1/0 for SQL,
 * true/false for MongoDB).
 *
 * @param   {Object}  adapter - Connected database adapter
 * @param   {Object}  area    - Area object { area_id, zone_id, area_name,
 *                               home_delivery_available, pickup_available }
 * @returns {Promise<void>}
 * @throws  {Error}   - If database operation fails
 * @private
 */
async function upsertArea(adapter, area) {
  const {
    area_id: areaId,
    zone_id: zoneId,
    area_name: areaName,
    home_delivery_available: homeDeliveryAvailable,
    pickup_available: pickupAvailable,
  } = area;

  const homeDeliveryFlag = homeDeliveryAvailable ? 1 : 0;
  const pickupFlag = pickupAvailable ? 1 : 0;

  if (adapter.type === 'mongodb') {
    const collection = adapter.db.collection('areas');
    await collection.updateOne(
      { area_id: areaId },
      {
        $set: {
          zone_id: zoneId,
          area_name: areaName,
          home_delivery_available: !!homeDeliveryAvailable,
          pickup_available: !!pickupAvailable,
        },
      },
      { upsert: true }
    );
    return;
  }

  if (adapter.type === 'postgres') {
    const query =
      'INSERT INTO areas ' +
      '  (area_id, zone_id, area_name, home_delivery_available, pickup_available) ' +
      'VALUES ($1, $2, $3, $4, $5) ' +
      'ON CONFLICT (area_id) DO UPDATE SET ' +
      '  zone_id = EXCLUDED.zone_id, ' +
      '  area_name = EXCLUDED.area_name, ' +
      '  home_delivery_available = EXCLUDED.home_delivery_available, ' +
      '  pickup_available = EXCLUDED.pickup_available';

    await adapter.run(query, [
      areaId,
      zoneId,
      areaName,
      homeDeliveryFlag,
      pickupFlag,
    ]);
    return;
  }

  if (adapter.type === 'mysql') {
    const query =
      'INSERT INTO areas ' +
      '  (area_id, zone_id, area_name, home_delivery_available, pickup_available) ' +
      'VALUES (?, ?, ?, ?, ?) ' +
      'ON DUPLICATE KEY UPDATE ' +
      '  zone_id = VALUES(zone_id), ' +
      '  area_name = VALUES(area_name), ' +
      '  home_delivery_available = VALUES(home_delivery_available), ' +
      '  pickup_available = VALUES(pickup_available)';

    await adapter.run(query, [
      areaId,
      zoneId,
      areaName,
      homeDeliveryFlag,
      pickupFlag,
    ]);
    return;
  }

  // SQLite and default fallback
  const query =
    'INSERT OR REPLACE INTO areas ' +
    '  (area_id, zone_id, area_name, home_delivery_available, pickup_available) ' +
    'VALUES (?, ?, ?, ?, ?)';

  await adapter.run(query, [
    areaId,
    zoneId,
    areaName,
    homeDeliveryFlag,
    pickupFlag,
  ]);
}

// ─── Synchronization ──────────────────────────────────────────────────────

/**
 * Fetch and synchronize location hierarchy from Pathao API to database.
 *
 * Fetches cities, zones, and areas from Pathao API and upserts them into
 * the database. Creates location tables if they don't exist.
 *
 * **Authentication:**
 * Obtains OAuth token from:
 * 1. options.token (if provided)
 * 2. Latest token from database
 * 3. Fails if neither available
 *
 * **Configuration Options:**
 * ```javascript
 * {
 *   baseUrl: 'https://platform.pathao.com', // Pathao API base URL
 *   token: 'access_token_string',            // Explicit token (optional)
 * }
 * ```
 *
 * @param   {Object}  adapter - Connected database adapter
 * @param   {Object}  options - Configuration { baseUrl, token }
 * @returns {Promise<void>}
 * @throws  {Error}   - If baseUrl missing, adapter invalid, or API/DB errors
 *
 * @example
 *   const adapter = await createAdapterFromEnv();
 *   await syncLocationsOnce(adapter, {
 *     baseUrl: 'https://platform.pathao.com',
 *     token: 'oauth_access_token'
 *   });
 */
async function syncLocationsOnce(adapter, options = {}) {
  if (!adapter) {
    throw new Error('adapter is required for synchronization');
  }

  // Validate and normalize base URL
  const baseUrl = (options.baseUrl || process.env.PATHAO_BASE_URL || '')
    .replace(/\/$/, '');

  if (!baseUrl) {
    throw new Error(
      'PATHAO_BASE_URL is required. ' +
        'Set environment variable or pass in options.baseUrl'
    );
  }

  // Ensure location tables exist
  await createLocationTables(adapter);

  // Obtain access token
  let accessToken = options.token;

  if (!accessToken) {
    const tokenRow = await getLatestToken(adapter);
    accessToken =
      (tokenRow && (tokenRow.access_token || tokenRow.accessToken)) || null;
  }

  if (!accessToken) {
    throw new Error(
      'OAuth access token is required. ' +
        'Provide via options.token or ensure token exists in database'
    );
  }

  // Fetch and synchronize cities
  console.log('Fetching cities from Pathao API...');
  const citiesApiUrl = `${baseUrl}/aladdin/api/v1/city-list`;
  const citiesResponse = await fetchJson(citiesApiUrl, accessToken);
  const citiesList =
    (citiesResponse && citiesResponse.data && citiesResponse.data.data) || [];

  for (const city of citiesList) {
    await upsertCity(adapter, city);

    // Fetch zones for this city
    const zonesApiUrl = `${baseUrl}/aladdin/api/v1/cities/${city.city_id}/zone-list`;
    const zonesResponse = await fetchJson(zonesApiUrl, accessToken);
    const zonesList =
      (zonesResponse && zonesResponse.data && zonesResponse.data.data) || [];

    for (const zone of zonesList) {
      // Ensure city_id is set on zone
      if (!zone.city_id) {
        zone.city_id = city.city_id;
      }

      await upsertZone(adapter, zone);

      // Fetch areas for this zone
      const areasApiUrl = `${baseUrl}/aladdin/api/v1/zones/${zone.zone_id}/area-list`;
      const areasResponse = await fetchJson(areasApiUrl, accessToken);
      const areasList =
        (areasResponse && areasResponse.data && areasResponse.data.data) || [];

      for (const area of areasList) {
        // Ensure zone_id is set on area
        if (!area.zone_id) {
          area.zone_id = zone.zone_id;
        }

        await upsertArea(adapter, area);
      }
    }
  }

  console.log('Location sync completed successfully');
}

export { syncLocationsOnce };

/**
 * Start a background task that periodically synchronizes locations.
 *
 * Runs synchronization at regular intervals. If no adapter is provided,
 * creates one from environment variables on demand. Implements graceful
 * shutdown via stop() method.
 *
 * **Configuration Options:**
 * ```javascript
 * {
 *   baseUrl: 'https://platform.pathao.com',  // Pathao API base URL
 *   token: 'access_token_string',            // OAuth token (optional)
 *   intervalMs: 21600000                     // Sync interval (default: 6 hours)
 * }
 * ```
 *
 * **Return Value:**
 * ```javascript
 * const handle = triggerLocationSync(adapter, options);
 * // Later:
 * handle.stop(); // Gracefully stop syncing and close adapter
 * ```
 *
 * @param   {Object}  adapter - Database adapter (optional; creates from env if absent)
 * @param   {Object}  options - Configuration { baseUrl, token, intervalMs }
 * @returns {Object}          - Control handle with stop() method
 *
 * @example
 *   import { triggerLocationSync } from '/src/pathao/sync.js';
 *
 *   const syncHandle = triggerLocationSync(null, {
 *     baseUrl: 'https://platform.pathao.com',
 *     intervalMs: 3600000 // 1 hour
 *   });
 *
 *   // Stop syncing when ready
 *   syncHandle.stop();
 */
function triggerLocationSync(adapter, options = {}) {
  const syncIntervalMs = options.intervalMs || DEFAULT_SYNC_INTERVAL_MS;
  let shouldContinue = true;
  let adapterInstance = adapter || null;
  const createdAdapterInternally = !adapterInstance;

  /**
   * Main sync loop: run syncLocationsOnce at intervals, handle errors.
   * @private
   */
  async function syncLoop() {
    while (shouldContinue) {
      try {
        // Create adapter from environment if needed
        if (!adapterInstance) {
          try {
            adapterInstance = await createAdapterFromEnv({
              connect: true,
            });
          } catch (error) {
            const errorMessage =
              error && error.message ? error.message : String(error);

            console.error(
              `Failed to create database adapter from environment: ${errorMessage}`
            );

            if (shouldContinue) {
              await sleep(syncIntervalMs);
            }

            continue;
          }
        }

        await syncLocationsOnce(adapterInstance, options);
      } catch (error) {
        const errorMessage =
          error && error.message ? error.message : String(error);

        console.error(`Location synchronization failed: ${errorMessage}`);
      }

      if (shouldContinue) {
        await sleep(syncIntervalMs);
      }
    }
  }

  // Start sync loop in background (do not await)
  syncLoop();

  // Return control handle
  return {
    /**
     * Stop the background sync loop and close adapter if created internally.
     */
    stop() {
      shouldContinue = false;

      // Close adapter if we created it internally
      if (createdAdapterInternally && adapterInstance) {
        if (typeof adapterInstance.close === 'function') {
          try {
            adapterInstance.close();
          } catch (error) {
            // Suppress errors during cleanup
          }
        }
      }
    },
  };
}

export { triggerLocationSync };
