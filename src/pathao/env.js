/**
 * @file    env.js
 * @module  PathaoEnvironmentConfig
 * @desc    Environment variable loader and validator for Pathao API credentials.
 *
 * Handles:
 *  - Loading dotenv configuration (if available)
 *  - Reading Pathao API credentials from process.env
 *  - Validation of required environment variables
 *  - Fallback mechanisms for missing dotenv installations
 */

// ─── Constants ─────────────────────────────────────────────────────────────

const REQUIRED_PATHAO_ENV_VARS = [
  'PATHAO_BASE_URL',
  'PATHAO_CLIENT_ID',
  'PATHAO_CLIENT_SECRET',
  'PATHAO_USERNAME',
  'PATHAO_PASSWORD',
];

// ─── Environment Loading ───────────────────────────────────────────────────

/**
 * Attempt to load environment variables from .env file.
 *
 * First tries to use the dotenv package if installed. If dotenv is not
 * available, falls back to manual .env file parsing. This enables the
 * library to work without requiring dotenv as a dependency.
 *
 * Non-fatal: Silently ignores missing dotenv or file read errors.
 *
 * @returns {Promise<void>}
 * @private
 *
 * @example
 *   await maybeLoadDotenv();
 */
async function maybeLoadDotenv() {
  // Try using dotenv package if available
  try {
    const dotenvModule = await import('dotenv').catch(() => null);
    if (dotenvModule && typeof dotenvModule.config === 'function') {
      dotenvModule.config();
      return;
    }
  } catch (error) {
    // Ignore dotenv import errors; try fallback
  }

  // Fallback: Manual .env file parsing for environments without dotenv
  try {
    const fs = await import('fs');
    const path = await import('path');

    const envFilePath = path.join(process.cwd(), '.env');

    if (fs.existsSync(envFilePath)) {
      const fileContent = fs.readFileSync(envFilePath, { encoding: 'utf8' });
      parseAndMergeEnvFile(fileContent);
    }
  } catch (error) {
    // Ignore file read/parsing errors
  }
}

/**
 * Parse .env file content and merge into process.env.
 *
 * Handles:
 *  - Lines with KEY=VALUE format
 *  - Comments (lines starting with #)
 *  - Quoted string values
 *  - Preserves existing env variables (does not overwrite)
 *
 * @param  {string}  fileContent  - Raw .env file text
 * @returns {void}
 * @private
 *
 * @example
 *   parseAndMergeEnvFile('DATABASE_URL=postgres://localhost\nAPI_KEY=secret');
 */
function parseAndMergeEnvFile(fileContent) {
  const lines = fileContent.split(/\r?\n/);

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // Parse KEY=VALUE format
    const equalsIndex = trimmedLine.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const environmentKey = trimmedLine.slice(0, equalsIndex).trim();
    let environmentValue = trimmedLine.slice(equalsIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (environmentValue.startsWith('"') && environmentValue.endsWith('"')) ||
      (environmentValue.startsWith("'") && environmentValue.endsWith("'"))
    ) {
      environmentValue = environmentValue.slice(1, -1);
    }

    // Only set if not already defined in process.env
    if (typeof process.env[environmentKey] === 'undefined') {
      process.env[environmentKey] = environmentValue;
    }
  }
}

// ─── Configuration Getter ──────────────────────────────────────────────────

/**
 * Load and validate Pathao API credentials from environment variables.
 *
 * Reads configuration from process.env with support for multiple naming
 * conventions and environment variable alternatives.
 *
 * Requires:
 *  - PATHAO_BASE_URL (or PATHAO_BASEURL, PATHAO_API_BASE)
 *  - PATHAO_CLIENT_ID (or CLIENT_ID)
 *  - PATHAO_CLIENT_SECRET (or CLIENT_SECRET)
 *  - PATHAO_USERNAME (or PATHAO_USER)
 *  - PATHAO_PASSWORD (or PATHAO_PASS)
 *
 * @param  {Object}   options             - Configuration options
 * @param  {boolean}  options.allowMissing - Skip validation if true
 * @returns {Promise<Object>}              - Pathao configuration object
 * @throws  {Error}                       - If required variables are missing and allowMissing is false
 *
 * @example
 *   const config = await getPathaoConfigFromEnv();
 *   // { baseUrl, clientId, clientSecret, username, password }
 *
 * @example
 *   // Allow missing vars (for partial configuration)
 *   const config = await getPathaoConfigFromEnv({ allowMissing: true });
 */
async function getPathaoConfigFromEnv(options = {}) {
  await maybeLoadDotenv();

  const environmentVariables = process.env;

  const pathaoConfig = {
    baseUrl:
      environmentVariables.PATHAO_BASE_URL ||
      environmentVariables.PATHAO_BASEURL ||
      environmentVariables.PATHAO_API_BASE ||
      null,

    client_id:
      environmentVariables.PATHAO_CLIENT_ID ||
      environmentVariables.CLIENT_ID ||
      null,

    client_secret:
      environmentVariables.PATHAO_CLIENT_SECRET ||
      environmentVariables.CLIENT_SECRET ||
      null,

    username:
      environmentVariables.PATHAO_USERNAME ||
      environmentVariables.PATHAO_USER ||
      null,

    password:
      environmentVariables.PATHAO_PASSWORD ||
      environmentVariables.PATHAO_PASS ||
      null,
  };

  // Validate required variables unless explicitly skipped
  if (!options.allowMissing) {
    validateRequiredEnvironmentVariables(pathaoConfig);
  }

  return pathaoConfig;
}

/**
 * Validate that all required Pathao configuration variables are present.
 *
 * @param  {Object}  config  - Configuration object to validate
 * @returns {void}
 * @throws  {Error}          - If any required variables are missing
 * @private
 */
function validateRequiredEnvironmentVariables(config) {
  const missingVariables = [];

  if (!config.baseUrl) {
    missingVariables.push('PATHAO_BASE_URL');
  }

  if (!config.client_id) {
    missingVariables.push('PATHAO_CLIENT_ID');
  }

  if (!config.client_secret) {
    missingVariables.push('PATHAO_CLIENT_SECRET');
  }

  if (!config.username) {
    missingVariables.push('PATHAO_USERNAME');
  }

  if (!config.password) {
    missingVariables.push('PATHAO_PASSWORD');
  }

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required Pathao environment variables: ${missingVariables.join(', ')}. ` +
        'Please set these variables in process.env or a .env file.'
    );
  }
}

export { getPathaoConfigFromEnv };
