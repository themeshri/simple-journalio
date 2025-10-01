/**
 * Token Metadata Resolution Utility
 * Handles token metadata fetching from Jupiter Token List API
 * with essential tokens cache for common Solana tokens.
 */

import axios from 'axios';
import {
  TokenMetadata,
  WSOL_MINT,
  STABLECOIN_MINTS,
} from '@/types';

// ============================================================================
// Essential Tokens Cache
// ============================================================================

/**
 * Essential tokens cache - common Solana tokens with hardcoded metadata
 * This avoids API calls for frequently traded tokens
 */
export const ESSENTIAL_TOKENS: Record<string, TokenMetadata> = {
  // Wrapped SOL
  [WSOL_MINT]: {
    address: WSOL_MINT,
    symbol: 'SOL',
    name: 'Wrapped SOL',
    decimals: 9,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    tags: ['wrapped', 'base-currency'],
  },

  // USDC
  [STABLECOIN_MINTS.USDC]: {
    address: STABLECOIN_MINTS.USDC,
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    tags: ['stablecoin', 'base-currency'],
  },

  // USDT
  [STABLECOIN_MINTS.USDT]: {
    address: STABLECOIN_MINTS.USDT,
    symbol: 'USDT',
    name: 'USDT',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
    tags: ['stablecoin', 'base-currency'],
  },

  // DAI (common stablecoin)
  'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o': {
    address: 'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o',
    symbol: 'DAI',
    name: 'DAI Stablecoin',
    decimals: 8,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o/logo.png',
    tags: ['stablecoin', 'base-currency'],
  },

  // BONK (popular meme coin)
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': {
    address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    symbol: 'BONK',
    name: 'Bonk',
    decimals: 5,
    logoURI: 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    tags: ['community', 'meme'],
  },

  // WIF (popular meme coin)
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': {
    address: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    symbol: 'WIF',
    name: 'dogwifhat',
    decimals: 6,
    logoURI: 'https://bafkreidlxu75b4vh5spkouko7kucuezo3g5mqpfvn24tjjvvmh7tlzk5yy.ipfs.nftstorage.link',
    tags: ['community', 'meme'],
  },

  // JUP (Jupiter token)
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': {
    address: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    symbol: 'JUP',
    name: 'Jupiter',
    decimals: 6,
    logoURI: 'https://static.jup.ag/jup/icon.png',
    tags: ['defi', 'dex'],
  },

  // PYTH (Pyth Network token)
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': {
    address: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    symbol: 'PYTH',
    name: 'Pyth Network',
    decimals: 6,
    logoURI: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3/logo.png',
    tags: ['defi', 'oracle'],
  },
};

// ============================================================================
// Jupiter Token List Cache
// ============================================================================

/**
 * In-memory cache for Jupiter token list
 * Cached for 1 hour to avoid repeated API calls
 * NOTE: Deprecated - now using Helius DAS API
 */
// let jupiterTokenListCache: JupiterToken[] | null = null;
// let jupiterTokenListCacheTime: number = 0;
// const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch the complete Jupiter Token List
 * Cached for performance
 * NOTE: Deprecated - now using Helius DAS API for token metadata
 */
// async function fetchJupiterTokenList(): Promise<JupiterToken[]> {
//   const now = Date.now();

//   // Return cached data if still valid
//   if (jupiterTokenListCache && (now - jupiterTokenListCacheTime) < CACHE_DURATION_MS) {
//     return jupiterTokenListCache;
//   }

//   try {
//     console.log('[tokens] Fetching Jupiter token list...');
//     const response = await axios.get<JupiterToken[]>(
//       'https://token.jup.ag/strict',
//       { timeout: 15000 }
//     );

//     jupiterTokenListCache = response.data;
//     jupiterTokenListCacheTime = now;

//     console.log(`[tokens] Fetched ${response.data.length} tokens from Jupiter`);
//     return response.data;
//   } catch (error) {
//     console.error('[tokens] Failed to fetch Jupiter token list:', error);

//     // Return cached data even if expired, better than nothing
//     if (jupiterTokenListCache) {
//       console.log('[tokens] Using expired cache due to fetch failure');
//       return jupiterTokenListCache;
//     }

//     // Return empty array instead of throwing - we'll fall back to essential tokens
//     console.warn('[tokens] No cache available, returning empty token list');
//     return [];
//   }
// }

// ============================================================================
// Token Metadata Resolution
// ============================================================================

/**
 * Get token metadata for a given mint address using Helius DAS API
 *
 * Resolution order:
 * 1. Check essential tokens cache (instant)
 * 2. Fetch from Helius getAsset API
 * 3. Fallback to default metadata with 9 decimals
 *
 * @param mintAddress - Token mint address
 * @returns TokenMetadata with symbol, name, decimals, etc.
 *
 * @example
 * const metadata = await getTokenMetadata('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
 * console.log(metadata.symbol); // "BONK"
 * console.log(metadata.decimals); // 5
 */
export async function getTokenMetadata(mintAddress: string): Promise<TokenMetadata> {
  // Step 1: Check essential tokens cache
  if (ESSENTIAL_TOKENS[mintAddress]) {
    return ESSENTIAL_TOKENS[mintAddress];
  }

  try {
    // Step 2: Fetch from Helius DAS API
    const { getHeliusApiKey } = await import('./config');
    const apiKey = getHeliusApiKey();

    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
      {
        jsonrpc: '2.0',
        id: 'get-token-metadata',
        method: 'getAsset',
        params: { id: mintAddress },
      },
      { timeout: 10000 }
    );

    const asset = response.data?.result;

    if (asset?.content?.metadata) {
      const metadata: TokenMetadata = {
        address: mintAddress,
        symbol: asset.content.metadata.symbol || 'UNKNOWN',
        name: asset.content.metadata.name || 'Unknown Token',
        decimals: asset.token_info?.decimals || 9,
        logoURI: asset.content?.links?.image,
      };

      return metadata;
    }

    // Step 3: Token not found, return fallback
    console.warn(`[tokens] Token not found via Helius: ${mintAddress}`);
    return {
      address: mintAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9, // Most Solana tokens use 9 decimals
    };
  } catch (error) {
    console.error(`[tokens] Failed to get metadata for ${mintAddress}:`, error);

    // Return fallback on error
    return {
      address: mintAddress,
      symbol: 'UNKNOWN',
      name: 'Unknown Token',
      decimals: 9,
    };
  }
}

/**
 * Get metadata for multiple tokens in batch
 * More efficient than calling getTokenMetadata multiple times
 *
 * @param mintAddresses - Array of token mint addresses
 * @returns Map of mint address to TokenMetadata
 *
 * @example
 * const metadata = await getBatchTokenMetadata([
 *   'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
 *   'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
 * ]);
 * console.log(metadata.get('DezXAZ8z...')?.symbol); // "BONK"
 */
export async function getBatchTokenMetadata(
  mintAddresses: string[]
): Promise<Map<string, TokenMetadata>> {
  const metadataMap = new Map<string, TokenMetadata>();

  // Process each mint address using Helius
  for (const mintAddress of mintAddresses) {
    // Check essential tokens cache first
    if (ESSENTIAL_TOKENS[mintAddress]) {
      metadataMap.set(mintAddress, ESSENTIAL_TOKENS[mintAddress]);
      continue;
    }

    // Fetch from Helius for non-cached tokens
    const metadata = await getTokenMetadata(mintAddress);
    metadataMap.set(mintAddress, metadata);
  }

  return metadataMap;
}

/**
 * Format raw token amount by dividing by token decimals
 *
 * @param rawAmount - Raw token amount (e.g., 1000000)
 * @param decimals - Token decimals (e.g., 6 for USDC)
 * @returns Decimal-adjusted amount (e.g., 1.0 USDC)
 *
 * @example
 * formatTokenAmount(1000000, 6) // Returns 1.0 (USDC)
 * formatTokenAmount(1000000000, 9) // Returns 1.0 (SOL)
 * formatTokenAmount(100000, 5) // Returns 1.0 (BONK)
 */
export function formatTokenAmount(rawAmount: number, decimals: number): number {
  return rawAmount / Math.pow(10, decimals);
}

/**
 * Check if a token is a base currency (SOL, USDC, USDT, DAI)
 *
 * @param symbol - Token symbol
 * @param mintAddress - Token mint address
 * @returns true if token is a base currency
 */
export function isBaseCurrency(symbol: string, mintAddress: string): boolean {
  const baseCurrencySymbols = ['SOL', 'USDC', 'USDT', 'DAI'];
  const baseCurrencyMints = [
    WSOL_MINT,
    STABLECOIN_MINTS.USDC,
    STABLECOIN_MINTS.USDT,
    'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
  ];

  return (
    baseCurrencySymbols.includes(symbol.toUpperCase()) ||
    baseCurrencyMints.includes(mintAddress)
  );
}

/**
 * Check if a token is a stablecoin
 *
 * @param symbol - Token symbol
 * @param mintAddress - Token mint address
 * @returns true if token is a stablecoin
 */
export function isStablecoin(symbol: string, mintAddress: string): boolean {
  const stablecoinSymbols = ['USDC', 'USDT', 'DAI', 'BUSD'];
  const stablecoinMints = [
    STABLECOIN_MINTS.USDC,
    STABLECOIN_MINTS.USDT,
    'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o', // DAI
  ];

  return (
    stablecoinSymbols.includes(symbol.toUpperCase()) ||
    stablecoinMints.includes(mintAddress)
  );
}
