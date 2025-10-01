/**
 * Server-side configuration utility
 * This file handles secure loading of environment variables for server-side use only.
 * Never import this file in client components.
 */

/**
 * Get the Helius API key from environment variables
 * @throws {Error} If HELIUS_API_KEY is not set
 * @returns {string} The Helius API key
 */
export function getHeliusApiKey(): string {
  const apiKey = process.env.HELIUS_API_KEY;

  if (!apiKey) {
    throw new Error(
      'HELIUS_API_KEY is not set in environment variables. ' +
      'Please add it to your .env.local file.'
    );
  }

  return apiKey;
}

/**
 * Get the Helius API URL with the API key
 * @returns {string} The complete Helius API URL
 */
export function getHeliusApiUrl(): string {
  const apiKey = getHeliusApiKey();
  return `https://api.helius.xyz/v0/${apiKey}`;
}

/**
 * Configuration object for server-side use
 */
export const config = {
  helius: {
    get apiKey() {
      return getHeliusApiKey();
    },
    get apiUrl() {
      return getHeliusApiUrl();
    },
  },
} as const;
