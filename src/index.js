/**
 * @file    index.js
 * @module  PathaoUnofficial
 * @desc    Main entry point for the Pathao unofficial client library.
 *
 * This module provides the core PathaoClient class for delivery estimation
 * and exports database adapters, authentication, location sync, and order
 * management functionality.
 *
 * Dependencies: db adapters, pathao client utilities
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const PACKAGE_VERSION = '0.1.0';
const BASE_DELIVERY_CHARGE = 30; // Currency units
const DISTANCE_RATE = 20; // Currency units per km
const WEIGHT_RATE = 15; // Currency units per kg

// ─── Pathao Client Class ───────────────────────────────────────────────────

/**
 * Main Pathao client class for delivery and order management.
 *
 * Provides utilities for estimating delivery costs, managing authentication,
 * and interfacing with the Pathao delivery API.
 *
 * @class
 * @param  {Object}  options  - Client configuration options
 */
class PathaoClient {
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Get the current version of the client library.
   *
   * @returns {string} - Semantic version string
   *
   * @example
   *   const client = new PathaoClient();
   *   console.log(client.version()); // '0.1.0'
   */
  version() {
    return PACKAGE_VERSION;
  }

  /**
   * Estimate delivery cost for a shipment based on distance and weight.
   *
   * This is a deterministic calculation stub that applies distance and weight rates
   * to a base delivery charge. Useful for quick price estimates before creating
   * actual orders through the Pathao API.
   *
   * @param  {Object}   params            - Estimation parameters
   * @param  {number}   params.distanceKm - Distance in kilometers (default: 1)
   * @param  {number}   params.weightKg   - Weight in kilograms (default: 1)
   * @returns {Object}                     - Estimated delivery details
   * @returns {number}   .distanceKm      - Input distance
   * @returns {number}   .weightKg        - Input weight
   * @returns {number}   .estimatedPrice  - Calculated delivery cost
   *
   * @example
   *   const estimate = client.estimateDelivery({ distanceKm: 5, weightKg: 2 });
   *   // { distanceKm: 5, weightKg: 2, estimatedPrice: 130 }
   */
  estimateDelivery({ distanceKm = 1, weightKg = 1 } = {}) {
    const estimatedPrice = Math.round(
      BASE_DELIVERY_CHARGE + distanceKm * DISTANCE_RATE + weightKg * WEIGHT_RATE
    );

    return {
      distanceKm,
      weightKg,
      estimatedPrice,
    };
  }

  /**
   * Get the library name and identifier.
   *
   * @static
   * @returns {string} - Library identifier
   *
   * @example
   *   console.log(PathaoClient.hello()); // 'pathao-unofficial'
   */
  static hello() {
    return 'pathao-unofficial';
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

export { PathaoClient };

// Database adapter factory
export { createAdapter, SUPPORTED as SUPPORTED_DB_TYPES } from './db/index.js';
export { createAdapterFromEnv } from './db/index.js';

// Authentication and token management
export { issueToken, saveToken, getLatestToken, getAndSaveTokenFromEnv, refreshToken, refreshAndSaveTokenFromDb } from './pathao/client.js';

// Location synchronization
export { syncLocationsOnce, triggerLocationSync } from './pathao/sync.js';

// Order and pricing management
export { calculatePrice, createOrder } from './pathao/client.js';

// Location data access
export { getCities, getZones, getAreas, getLocationHierarchy, seedLocationData } from './api/location.js';
