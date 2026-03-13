/**
 * @file    client.js
 * @module  PathaoClient
 * @desc    Pathao API client for OAuth authentication, pricing, and order management.
 *
 * Key responsibilities:
 *  - OAuth 2.0 token management (issue, refresh, store)
 *  - Pathao API error handling
 *  - Delivery price calculation
 *  - Order creation
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const PATHAO_TOKEN_ENDPOINT = 'aladdin/api/v1/issue-token';
const PATHAO_PRICE_ENDPOINT = 'aladdin/api/v1/merchant/price-plan';
const PATHAO_ORDERS_ENDPOINT = 'aladdin/api/v1/orders';
const TOKEN_TYPE_PASSWORD = 'password';
const TOKEN_TYPE_REFRESH = 'refresh_token';
const DEFAULT_BEARER_SCHEME = 'Bearer';
const DEFAULT_TOKEN_EXPIRY = 0;

// ─── OAuth Token Management ───────────────────────────────────────────────

/**
 * Ensure fetch is available globally (polyfill for Node < 18).
 *
 * @returns {Promise<void>}
 * @throws {Error} - If fetch unavailable and undici not installed
 * @private
 */
async function ensureFetchIsAvailable() {
  if (globalThis.fetch) return;
  try {
    const undici = await import('undici');
    globalThis.fetch = undici.fetch;
  } catch (err) {
    throw new Error(
      'fetch is not available. Install `undici` (npm install undici) or use Node.js >= 18'
    );
  }
}

/**
 * Request an OAuth token from the Pathao API.
 *
 * Supports both password grant (initial authentication) and refresh_token grant
 * (obtaining new access token). Normalizes response across API versions.
 *
 * @param  {string}   baseUrl      - Pathao API base URL (e.g., https://api.pathao.com)
 * @param  {Object}   credentials  - Authentication credentials
 * @param  {string}   credentials.client_id       - OAuth client ID
 * @param  {string}   credentials.client_secret   - OAuth client secret
 * @param  {string}   credentials.username        - Pathao username (for password grant)
 * @param  {string}   credentials.password        - Pathao password (for password grant)
 * @param  {string}   credentials.grant_type      - OAuth grant type (default: 'password')
 * @param  {string}   credentials.refresh_token   - Refresh token (for refresh_token grant)
 * @returns {Promise<Object>}                      - Normalized token response object
 * @returns {string}   .access_token              - Access token for authenticated requests
 * @returns {string}   .refresh_token             - Token to request new access token
 * @returns {string}   .token_type                - Token type (usually 'Bearer')
 * @returns {number}   .expires_in                - Token expiry in seconds
 * @throws  {Error}                               - If token request fails
 *
 * @example
 *   const token = await issueToken('https://api.pathao.com', {
 *     client_id: 'your-client-id',
 *     client_secret: 'your-secret',
 *     username: 'your-username',
 *     password: 'your-password'
 *   });
 */
async function issueToken(baseUrl, { client_id, client_secret, username, password, grant_type = TOKEN_TYPE_PASSWORD, refresh_token }) {
  await ensureFetchIsAvailable();

  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const tokenRequestUrl = `${normalizedBaseUrl}/${PATHAO_TOKEN_ENDPOINT}`;

  const requestBody = { client_id, client_secret, grant_type };

  if (grant_type === TOKEN_TYPE_REFRESH) {
    requestBody.refresh_token = refresh_token;
  } else {
    requestBody.username = username;
    requestBody.password = password;
  }

  const response = await fetch(tokenRequestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to obtain OAuth token from Pathao API. ` +
        `Status: ${response.status} ${response.statusText}. ` +
        `Response: ${errorText}`
    );
  }

  const tokenData = await response.json();

  // Normalize response format (handles different Pathao API versions)
  return {
    access_token: tokenData.access_token || tokenData.accessToken || tokenData.token,
    refresh_token: tokenData.refresh_token || tokenData.refreshToken,
    token_type: tokenData.token_type || tokenData.tokenType || DEFAULT_BEARER_SCHEME,
    expires_in: tokenData.expires_in || tokenData.expiresIn || DEFAULT_TOKEN_EXPIRY,
  };
}

export { issueToken };

/**
 * Persist an OAuth token to the database.
 *
 * Stores the token for later retrieval and refresh. Only tokens and expiry
 * are saved—client credentials are NEVER persisted to the database.
 *
 * @param  {Object}  adapter    - Connected database adapter instance
 * @param  {Object}  tokenData  - Token object from issueToken()
 * @param  {string}  tokenData.access_token   - Access token
 * @param  {string}  tokenData.refresh_token  - Refresh token
 * @param  {string}  tokenData.token_type     - Token type (e.g., 'Bearer')
 * @param  {number}  tokenData.expires_in     - Expiry in seconds
 * @returns {Promise<Object>}                  - Result from database adapter
 * @throws  {Error}                           - If database operation fails
 *
 * @example
 *   const token = await issueToken(baseUrl, credentials);
 *   await saveToken(adapter, token);
 */
async function saveToken(adapter, tokenData) {
  // Calculate absolute expiry timestamp (milliseconds since epoch)
  const expiryTimestamp = tokenData.expires_in
    ? Date.now() + tokenData.expires_in * 1000
    : null;

  const isPostgresAdapter = adapter.type === 'postgres';

  if (isPostgresAdapter) {
    // PostgreSQL: Use $1, $2 placeholders and RETURNING clause
    const postgresQuery =
      'INSERT INTO oauth_tokens (access_token, refresh_token, token_type, expires_at) ' +
      'VALUES ($1, $2, $3, $4) RETURNING *';

    const result = await adapter.run(postgresQuery, [
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.token_type,
      expiryTimestamp,
    ]);

    return (result.rows && result.rows[0]) || result;
  }

  // SQLite/MySQL: Use ? placeholders
  const sqliteOrMysqlQuery =
    'INSERT INTO oauth_tokens (access_token, refresh_token, token_type, expires_at) ' +
    'VALUES (?, ?, ?, ?)';

  const result = await adapter.run(sqliteOrMysqlQuery, [
    tokenData.access_token,
    tokenData.refresh_token,
    tokenData.token_type,
    expiryTimestamp,
  ]);

  return result;
}

export { saveToken };

/**
 * Retrieve the most recently stored OAuth token from the database.
 *
 * Returns the latest token record by insertion order. Useful for checking
 * expiry and refreshing access tokens. Returns null if no token exists.
 *
 * @param  {Object}  adapter    - Connected database adapter instance
 * @returns {Promise<Object|null>} - Latest token record or null if none
 * @throws  {Error}                - If database query fails
 *
 * @example
 *   const token = await getLatestToken(adapter);
 *   if (token && token.expires_at && token.expires_at < Date.now()) {
 *     // Token expired, refresh it
 *   }
 */
async function getLatestToken(adapter) {
  const query = 'SELECT * FROM oauth_tokens ORDER BY id DESC LIMIT 1';

  if (typeof adapter.get === 'function') {
    return adapter.get(query);
  }

  const result = await adapter.run(query);

  if (Array.isArray(result) && result.length > 0) {
    return result[0];
  }

  if (result && result.rows && result.rows.length > 0) {
    return result.rows[0];
  }

  return null;
}

export { getLatestToken };

import { getPathaoConfigFromEnv } from './env.js';

/**
 * Issue and persist a token using Pathao credentials from environment variables.
 *
 * Convenience function that combines configuration loading with token issuance
 * and database persistence.
 *
 * @param  {Object}   adapter   - Connected database adapter instance
 * @param  {Object}   options   - Configuration options
 * @param  {boolean}  options.allowMissingEnv - Allow partial env configuration
 * @returns {Promise<Object>}    - Issued token object
 * @throws  {Error}             - If config missing or token request fails
 *
 * @example
 *   const token = await getAndSaveTokenFromEnv(adapter);
 */
async function getAndSaveTokenFromEnv(adapter, options = {}) {
  const pathaoConfig = await getPathaoConfigFromEnv({
    allowMissing: !!options.allowMissingEnv,
  });

  if (!pathaoConfig.baseUrl) {
    throw new Error('PATHAO_BASE_URL is required via environment or options');
  }

  const newToken = await issueToken(pathaoConfig.baseUrl, {
    client_id: pathaoConfig.client_id,
    client_secret: pathaoConfig.client_secret,
    username: pathaoConfig.username,
    password: pathaoConfig.password,
  });

  await saveToken(adapter, newToken);
  return newToken;
}

export { getAndSaveTokenFromEnv };

/**
 * Refresh an access token using a refresh token.
 *
 * Requests a new access token from Pathao using the refresh_token grant type.
 * Does not update the database; use refreshAndSaveTokenFromDb() for that.
 *
 * @param  {string}   baseUrl   - Pathao API base URL
 * @param  {Object}   options   - Refresh credentials
 * @param  {string}   options.client_id      - OAuth client ID
 * @param  {string}   options.client_secret  - OAuth client secret
 * @param  {string}   options.refresh_token  - Refresh token
 * @returns {Promise<Object>}    - New token object
 * @throws  {Error}             - If refresh_token is missing or request fails
 *
 * @example
 *   const newToken = await refreshToken('https://api.pathao.com', {
 *     client_id: 'id',
 *     client_secret: 'secret',
 *     refresh_token: 'old-token'
 *   });
 */
async function refreshToken(baseUrl, { client_id, client_secret, refresh_token: refreshToken }) {
  if (!refreshToken) {
    throw new Error('refresh_token is required to refresh an access token');
  }

  return issueToken(baseUrl, {
    client_id,
    client_secret,
    grant_type: TOKEN_TYPE_REFRESH,
    refresh_token: refreshToken,
  });
}

export { refreshToken };

/**
 * Refresh the access token and save the new token to the database.
 *
 * Retrieves the latest stored refresh_token, uses it to obtain a new access token,
 * then persists the new token. This is the typical token refresh flow for applications.
 *
 * Requires Pathao credentials in environment variables (client_id, client_secret).
 *
 * @param  {Object}   adapter   - Connected database adapter instance
 * @param  {Object}   options   - Configuration options
 * @param  {string}   options.baseUrl            - Pathao API base URL (default: env var)
 * @param  {boolean}  options.allowMissingEnv    - Allow partial env config
 * @returns {Promise<Object>}    - New token object (now in database)
 * @throws  {Error}             - If no refresh_token in DB, missing env vars, or API fails
 *
 * @example
 *   const newToken = await refreshAndSaveTokenFromDb(adapter);
 */
async function refreshAndSaveTokenFromDb(adapter, options = {}) {
  const baseUrl = options.baseUrl || process.env.PATHAO_BASE_URL || null;

  if (!baseUrl) {
    throw new Error(
      'PATHAO_BASE_URL is required via environment variable or options.baseUrl'
    );
  }

  // Retrieve stored token
  const storedTokenRecord = await getLatestToken(adapter);

  if (!storedTokenRecord || !storedTokenRecord.refresh_token) {
    throw new Error(
      'No stored refresh_token found in database. ' +
        'Issue a new token first using issueToken() or getAndSaveTokenFromEnv().'
    );
  }

  // Load client credentials from environment
  const pathaoConfig = await getPathaoConfigFromEnv({
    allowMissing: !!options.allowMissingEnv,
  });

  if (!pathaoConfig.client_id || !pathaoConfig.client_secret) {
    throw new Error(
      'PATHAO_CLIENT_ID and PATHAO_CLIENT_SECRET are required in environment variables'
    );
  }

  // Request new token using refresh_token
  const newToken = await refreshToken(baseUrl, {
    client_id: pathaoConfig.client_id,
    client_secret: pathaoConfig.client_secret,
    refresh_token: storedTokenRecord.refresh_token,
  });

  // Save new token to database
  await saveToken(adapter, newToken);
  return newToken;
}

export { refreshAndSaveTokenFromDb };

// ─── Shared API Request Helper ────────────────────────────────────────────

/**
 * Make an authenticated POST request to a Pathao API endpoint.
 *
 * Shared helper used by calculatePrice() and createOrder() to avoid
 * duplicating URL resolution, token retrieval, and response parsing.
 *
 * @param  {Object}   adapter        - Optional connected database adapter for token retrieval
 * @param  {string}   endpointPath   - API path relative to base URL (no leading slash)
 * @param  {Object}   payload        - JSON body to send
 * @param  {Object}   options        - Configuration options
 * @param  {string}   options.baseUrl - Pathao API base URL (default: env var)
 * @param  {string}   options.token   - Access token (default: from adapter)
 * @param  {string}   errorLabel     - Human-readable label for error messages
 * @returns {Promise<Object>}         - Parsed JSON response
 * @throws  {Error}                  - If token missing or API call fails
 * @private
 */
async function makeAuthenticatedPost(adapter, endpointPath, payload, options, errorLabel) {
  await ensureFetchIsAvailable();

  const normalizedBaseUrl = (options.baseUrl || process.env.PATHAO_BASE_URL || '').replace(/\/$/, '');

  if (!normalizedBaseUrl) {
    throw new Error(
      'PATHAO_BASE_URL is required via environment variables or options.baseUrl'
    );
  }

  let accessToken = options.token || null;

  if (!accessToken && adapter) {
    const storedToken = await getLatestToken(adapter);
    accessToken = (storedToken && (storedToken.access_token || storedToken.accessToken)) || null;
  }

  if (!accessToken) {
    throw new Error(
      'Access token is required. Provide via options.token or have token stored in database adapter'
    );
  }

  const endpointUrl = `${normalizedBaseUrl}/${endpointPath}`;

  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new Error(
      `${errorLabel} API failed. ` +
        `Status: ${response.status} ${response.statusText}. ` +
        `Response: ${responseText}`
    );
  }

  try {
    return JSON.parse(responseText || '{}');
  } catch (parseError) {
    return { data: responseText };
  }
}

// ─── Price and Order APIs ─────────────────────────────────────────────────

/**
 * Calculate delivery price using Pathao's price-plan API.
 *
 * Determines the delivery cost for a shipment based on origin, destination,
 * and shipment characteristics.
 *
 * Token can be provided directly or retrieved from the database adapter.
 *
 * @param  {Object}   adapter      - Optional connected database adapter for token retrieval
 * @param  {Object}   payload      - Price calculation parameters
 * @param  {number}   payload.store_id          - Pathao store ID
 * @param  {number}   payload.item_type         - Type of item being shipped
 * @param  {string}   payload.delivery_type     - 'home_delivery' or 'pickup'
 * @param  {number}   payload.item_weight       - Weight in kg
 * @param  {number}   payload.recipient_city    - Destination city ID
 * @param  {number}   payload.recipient_zone    - Destination zone ID
 * @param  {Object}   options                   - API configuration options
 * @param  {string}   options.baseUrl           - Pathao API URL (default: env var)
 * @param  {string}   options.token             - Access token (default: from adapter)
 * @returns {Promise<Object>}                    - Price calculation response from API
 * @throws  {Error}                             - If token missing, API fails, or parsing fails
 *
 * @example
 *   const priceEstimate = await calculatePrice(adapter, {
 *     store_id: 123,
 *     item_type: 1,
 *     delivery_type: 'home_delivery',
 *     item_weight: 2.5,
 *     recipient_city: 1,
 *     recipient_zone: 1
 *   });
 */
async function calculatePrice(adapter, payload = {}, options = {}) {
  return makeAuthenticatedPost(
    adapter,
    PATHAO_PRICE_ENDPOINT,
    payload,
    options,
    'Pathao price calculation'
  );
}

export { calculatePrice };

/**
 * Create a new delivery order in Pathao.
 *
 * Submits a new order to Pathao for processing. Returns order ID and status
 * upon successful creation.
 *
 * Token can be provided directly or retrieved from the database adapter.
 *
 * @param  {Object}   adapter      - Optional connected database adapter for token retrieval
 * @param  {Object}   payload      - Order creation parameters
 * @param  {number}   payload.store_id          - Pathao store ID  
 * @param  {string}   payload.recipient_name    - Customer name
 * @param  {string}   payload.recipient_phone   - Customer phone number
 * @param  {number}   payload.recipient_city    - Destination city ID
 * @param  {number}   payload.recipient_zone    - Destination zone ID  
 * @param  {number}   payload.recipient_area    - Destination area ID
 * @param  {string}   payload.delivery_type     - 'home_delivery' or 'pickup'
 * @param  {number}   payload.item_weight       - Package weight in kg
 * @param  {Object}   options                   - API configuration options
 * @param  {string}   options.baseUrl           - Pathao API URL (default: env var)
 * @param  {string}   options.token             - Access token (default: from adapter)
 * @returns {Promise<Object>}                    - Order creation response with order_id
 * @throws  {Error}                             - If token missing, API fails, or order already exists
 *
 * @example
 *   const order = await createOrder(adapter, {
 *     store_id: 123,
 *     recipient_name: 'John Doe',
 *     recipient_phone: '01712345678',
 *     recipient_city: 1,
 *     recipient_zone: 2,
 *     recipient_area: 15,
 *     delivery_type: 'home_delivery',
 *     item_weight: 5
 *   });
 *   console.log(order.order_id); // New order ID
 */
async function createOrder(adapter, payload = {}, options = {}) {
  return makeAuthenticatedPost(
    adapter,
    PATHAO_ORDERS_ENDPOINT,
    payload,
    options,
    'Pathao order creation'
  );
}

export { createOrder };
