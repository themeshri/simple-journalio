/**
 * Price Fetching Utility
 * Handles token price fetching from Jupiter Price API v2
 * with stablecoin hardcoding and batch fetching support.
 */

import axios from 'axios';
import {
  STABLECOIN_MINTS,
} from '@/types';

// ============================================================================
// Constants
// ============================================================================

/**
 * Known stablecoin mint addresses
 * These always return $1.00 without API calls
 */
const KNOWN_STABLECOIN_MINTS: string[] = [
  STABLECOIN_MINTS.USDC, // EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  STABLECOIN_MINTS.USDT, // Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
];

// ============================================================================
// Individual Price Fetching
// ============================================================================

/**
 * Fetch price for a single token from Helius DAS API
 *
 * Hardcodes stablecoin prices to $1.00 (USDC, USDT)
 * Fetches from Helius getAsset API with price_info
 * Returns price as number (0 if not available)
 * Timeout: 10 seconds
 *
 * @param mintAddress - Token mint address
 * @returns Price in USD, or 0 if not available
 *
 * @example
 * const price = await fetchTokenPrice('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
 * console.log(price); // 0.000123
 */
export async function fetchTokenPrice(mintAddress: string): Promise<number> {
  // Hardcode stablecoin prices to $1.00
  if (KNOWN_STABLECOIN_MINTS.includes(mintAddress)) {
    return 1.0;
  }

  try {
    const { getHeliusApiKey } = await import('./config');
    const apiKey = getHeliusApiKey();

    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        jsonrpc: '2.0',
        id: 'get-token-price',
        method: 'getAsset',
        params: { id: mintAddress },
      },
      { timeout: 10000 }
    );

    const asset = response.data?.result;
    const price = asset?.token_info?.price_info?.price_per_token;

    if (price && typeof price === 'number') {
      return price;
    }

    console.warn(`[prices] Price not available for token: ${mintAddress}`);
    return 0;
  } catch (error) {
    console.error(`[prices] Failed to fetch price for ${mintAddress}:`, error);
    return 0;
  }
}

// ============================================================================
// Batch Price Fetching
// ============================================================================

/**
 * Fetch prices for multiple tokens in a single batch request
 * More efficient than calling fetchTokenPrice multiple times
 *
 * Accepts array of mint addresses
 * Returns Map<string, number> of mint → price
 * Handles stablecoins first (set to 1.0)
 * Batch fetches non-stablecoins: https://api.jup.ag/price/v2?ids={comma-separated-mints}
 * Timeout: 15 seconds
 * Sets price to 0 if not available
 *
 * @param mintAddresses - Array of token mint addresses
 * @returns Map of mint address to price in USD
 *
 * @example
 * const prices = await fetchBatchPrices([
 *   'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
 *   'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'  // WIF
 * ]);
 * console.log(prices.get('DezXAZ8z...')); // 0.000123
 */
export async function fetchBatchPrices(
  mintAddresses: string[]
): Promise<Map<string, number>> {
  const priceMap = new Map<string, number>();

  if (mintAddresses.length === 0) {
    return priceMap;
  }

  // Separate stablecoins from other tokens
  const stablecoins: string[] = [];
  const nonStablecoins: string[] = [];

  for (const mint of mintAddresses) {
    if (KNOWN_STABLECOIN_MINTS.includes(mint)) {
      stablecoins.push(mint);
    } else {
      nonStablecoins.push(mint);
    }
  }

  // Handle stablecoins first - set to 1.0
  for (const mint of stablecoins) {
    priceMap.set(mint, 1.0);
  }

  // Fetch non-stablecoins using Helius
  if (nonStablecoins.length > 0) {
    try {
      const { getHeliusApiKey } = await import('./config');
      const apiKey = getHeliusApiKey();

      // Fetch prices for each token (Helius doesn't have true batch endpoint for prices)
      const pricePromises = nonStablecoins.map(async (mint) => {
        try {
          const response = await axios.post(
            `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
            {
              jsonrpc: '2.0',
              id: `get-price-${mint}`,
              method: 'getAsset',
              params: { id: mint },
            },
            { timeout: 10000 }
          );

          const asset = response.data?.result;
          const price = asset?.token_info?.price_info?.price_per_token;

          return { mint, price: typeof price === 'number' ? price : 0 };
        } catch (error) {
          console.error(`[prices] Failed to fetch price for ${mint}:`, error);
          return { mint, price: 0 };
        }
      });

      const results = await Promise.all(pricePromises);

      // Process each token result
      for (const result of results) {
        priceMap.set(result.mint, result.price);
      }
    } catch (error) {
      console.error('Failed to fetch batch prices:', error);

      // Set all tokens in failed batch to 0
      for (const mint of nonStablecoins) {
        if (!priceMap.has(mint)) {
          priceMap.set(mint, 0);
        }
      }
    }
  }

  return priceMap;
}

// ============================================================================
// Price Calculation Utilities
// ============================================================================

/**
 * Calculate USD value from token amount and price
 *
 * @param amount - Token amount (decimal-adjusted)
 * @param price - Token price in USD
 * @returns USD value
 *
 * @example
 * calculateValueUSD(1000, 0.00015) // Returns 0.15
 */
export function calculateValueUSD(amount: number, price: number): number {
  return amount * price;
}

/**
 * Get price confidence level based on price availability
 *
 * @param price - Token price
 * @returns Price confidence level
 */
export function getPriceConfidence(price: number): 'high' | 'medium' | 'low' | 'none' {
  if (price > 0) {
    return 'medium';
  }
  return 'none';
}
