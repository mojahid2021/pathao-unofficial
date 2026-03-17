/**
 * @file    utils.js
 * @module  Utils
 * @desc    Shared utility functions used across the library.
 */

// ─── Fetch Polyfill ───────────────────────────────────────────────────────

/**
 * Ensure fetch is available globally (polyfill for Node < 18).
 *
 * Modern Node.js (≥18) ships with native `globalThis.fetch`. For older
 * runtimes the `undici` package is used as a drop-in polyfill.
 *
 * @returns {Promise<void>}
 * @throws  {Error} - If fetch is unavailable and undici is not installed
 */
async function ensureFetch() {
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

export { ensureFetch };
