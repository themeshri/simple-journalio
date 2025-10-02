/**
 * Helius Swaps API Route
 * GET /api/helius-swaps?wallet=<address>
 *
 * Fetches and processes all swap transactions for a given Solana wallet address
 * using the Helius Enhanced API and Jupiter Price API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAllTransactions, processAllTransactionsRpcFirst, processAllTransactionsHybrid, processTransactionsProgressive } from '@/lib/transactions';
import { DeFiActivity } from '@/types';

// ============================================================================
// Response Cache (In-Memory LRU)
// ============================================================================

interface CachedResponse {
  data: any;
  cachedAt: number;
  ttl: number;
}

/**
 * Simple LRU cache for API responses
 */
class ResponseCache {
  private cache: Map<string, CachedResponse>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number, ttl: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  private generateKey(wallet: string, mode: string, detectGaps: boolean, rpcFirst: boolean, signatures?: string[]): string {
    const sigPart = signatures ? signatures.sort().join(',') : '';
    return `${wallet}:${mode}:${detectGaps}:${rpcFirst}:${sigPart}`;
  }

  get(wallet: string, mode: string, detectGaps: boolean, rpcFirst: boolean, signatures?: string[]): any | null {
    const key = this.generateKey(wallet, mode, detectGaps, rpcFirst, signatures);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.cachedAt;

    if (age > cached.ttl) {
      // Expired, remove it
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, cached);

    console.log(`[api/cache] Cache hit for wallet ${wallet.slice(0, 8)}...`);
    return cached.data;
  }

  set(wallet: string, mode: string, detectGaps: boolean, rpcFirst: boolean, data: any, signatures?: string[]): void {
    const key = this.generateKey(wallet, mode, detectGaps, rpcFirst, signatures);

    // Remove if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log('[api/cache] Evicted oldest entry (cache full)');
    }

    // Add new entry
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      ttl: this.ttl,
    });

    console.log(`[api/cache] Cached response for wallet ${wallet.slice(0, 8)}... (${this.cache.size}/${this.maxSize})`);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
    console.log('[api/cache] Cache cleared');
  }
}

// Cache for 5 minutes, max 100 wallets
const responseCache = new ResponseCache(100, 5 * 60 * 1000);

/**
 * Wallet address validation regex for Solana
 * Solana addresses are 32-44 characters, base58 encoded
 */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validate Solana wallet address format
 */
function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_REGEX.test(address);
}

/**
 * GET /api/helius-swaps
 *
 * Query Parameters:
 * - wallet (required): Solana wallet address to fetch transactions for
 * - mode (optional): Processing mode ('hybrid', 'rpc', 'enhanced', 'progressive', default: 'rpc')
 *   - 'hybrid': Fast hybrid mode (Enhanced API + 7-day RPC, ~15s, 98%+ coverage) ⚡ RECOMMENDED
 *   - 'rpc': RPC-first approach (complete history, slow but accurate)
 *   - 'enhanced': Enhanced API only (fast but may miss some swaps)
 *   - 'progressive': Progressive loading with cursor support
 * - batchSize (optional): Number of signatures per batch for progressive loading (default: 100, max: 500)
 * - cursor (optional): Continuation cursor from previous batch (for progressive loading)
 * - maxTransactions (optional): Maximum number of transactions to fetch via RPC (default: 200, max: 1000, only for 'rpc' mode)
 * - signatures (optional): Comma-separated transaction signatures to fetch via RPC fallback (only used in 'enhanced' mode)
 * - detectGaps (optional): Enable automatic gap detection ('true' or 'false', default: 'false', only used in 'enhanced' mode)
 *
 * Response Format (Progressive):
 * {
 *   success: true,
 *   data: DeFiActivity[],
 *   total: number,
 *   wallet: string,
 *   progress: {
 *     processedSignatures: number,
 *     totalSignatures: number,
 *     foundSwaps: number,
 *     percentComplete: number,
 *     hasMore: boolean,
 *     cursor?: string
 *   },
 *   metadata: { ... }
 * }
 *
 * Error Responses:
 * - 400: Missing or invalid wallet parameter
 * - 500: Transaction processing error
 */
export async function GET(request: NextRequest) {
  try {
    // Extract parameters from query
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');
    const modeParam = searchParams.get('mode');
    const progressiveParam = searchParams.get('progressive');
    const batchSizeParam = searchParams.get('batchSize');
    const cursorParam = searchParams.get('cursor');
    const rpcFirstParam = searchParams.get('rpcFirst');
    const maxTransactionsParam = searchParams.get('maxTransactions');
    const signaturesParam = searchParams.get('signatures');
    const detectGapsParam = searchParams.get('detectGaps');

    // Validate wallet parameter presence
    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: wallet',
          message: 'Please provide a wallet address as a query parameter',
        },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address',
          message: 'The provided wallet address is not a valid Solana address. Solana addresses are 32-44 characters long and base58 encoded.',
        },
        { status: 400 }
      );
    }

    console.log(`[api/helius-swaps] Processing request for wallet: ${walletAddress}`);

    // Determine processing mode (backward compatible with old params)
    let processingMode: 'hybrid' | 'rpc' | 'enhanced' | 'progressive';

    if (progressiveParam?.toLowerCase() === 'true') {
      processingMode = 'progressive';
    } else if (modeParam) {
      // New mode parameter takes precedence
      processingMode = modeParam.toLowerCase() as any;
      if (!['hybrid', 'rpc', 'enhanced', 'progressive'].includes(processingMode)) {
        processingMode = 'rpc'; // Default to rpc for invalid mode
      }
    } else if (rpcFirstParam === 'false') {
      // Backward compatibility: rpcFirst=false means Enhanced API
      processingMode = 'enhanced';
    } else {
      // Default to RPC for backward compatibility
      processingMode = 'rpc';
    }

    // Parse batch size for progressive loading (default: 100, max: 500)
    const batchSize = batchSizeParam
      ? Math.min(Math.max(parseInt(batchSizeParam), 1), 500)
      : 100;

    // Parse cursor for progressive loading continuation
    const cursor = cursorParam || undefined;

    // Parse max transactions limit (default: 200, max: 1000)
    const maxTransactions = maxTransactionsParam
      ? Math.min(Math.max(parseInt(maxTransactionsParam), 1), 1000)
      : 200;

    // Parse optional signatures for RPC fallback (only used in enhanced mode)
    const specificSignatures = signaturesParam
      ? signaturesParam.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : undefined;

    // Parse gap detection flag (only used in enhanced mode)
    const enableGapDetection = detectGapsParam?.toLowerCase() === 'true';

    // Log processing mode
    switch (processingMode) {
      case 'progressive':
        console.log(`[api/helius-swaps] Mode: PROGRESSIVE (batch size: ${batchSize}, cursor: ${cursor || 'none'})`);
        break;
      case 'hybrid':
        console.log(`[api/helius-swaps] Mode: HYBRID ⚡ (Enhanced API + 7-day RPC, ~15s, 98%+ coverage)`);
        break;
      case 'rpc':
        console.log(`[api/helius-swaps] Mode: RPC-FIRST (max ${maxTransactions} transactions)`);
        break;
      case 'enhanced':
        console.log(`[api/helius-swaps] Mode: ENHANCED API only`);
        if (specificSignatures && specificSignatures.length > 0) {
          console.log(`[api/helius-swaps] RPC fallback requested for ${specificSignatures.length} signatures`);
        }
        if (enableGapDetection) {
          console.log(`[api/helius-swaps] Gap detection enabled`);
        }
        break;
    }

    // Check cache first (skip cache for progressive loading batches)
    if (processingMode !== 'progressive') {
      const cachedResponse = responseCache.get(
        walletAddress,
        processingMode,
        enableGapDetection,
        processingMode === 'rpc',
        specificSignatures
      );
      if (cachedResponse) {
        return NextResponse.json(cachedResponse, {
          status: 200,
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            'X-Cache': 'HIT',
          },
        });
      }
    }

    // Process transactions using the selected mode
    let result;
    switch (processingMode) {
      case 'progressive':
        result = await processTransactionsProgressive(walletAddress, batchSize, cursor);
        break;
      case 'hybrid':
        result = await processAllTransactionsHybrid(walletAddress);
        break;
      case 'rpc':
        result = await processAllTransactionsRpcFirst(walletAddress, maxTransactions);
        break;
      case 'enhanced':
        result = await processAllTransactions(walletAddress, {
          specificSignatures,
          enableGapDetection,
        });
        break;
    }

    console.log(`[api/helius-swaps] Successfully processed ${result.activities.length} activities`);

    // Prepare response data
    const responseData: any = {
      success: true,
      data: result.activities,
      total: result.activities.length,
      wallet: walletAddress,
      metadata: {
        enhancedApiCount: result.metadata.enhancedApiCount,
        rpcFallbackCount: result.metadata.rpcFallbackCount,
        totalCount: result.metadata.totalCount,
      },
      message: result.activities.length === 0
        ? 'No swap transactions found for this wallet'
        : `Successfully processed ${result.activities.length} swap transactions`,
    };

    // Add progress metadata for progressive loading
    if (processingMode === 'progressive' && 'progress' in result) {
      responseData.progress = result.progress;
    }

    // Cache the response (skip cache for progressive loading)
    if (processingMode !== 'progressive') {
      responseCache.set(
        walletAddress,
        processingMode,
        enableGapDetection,
        processingMode === 'rpc',
        responseData,
        specificSignatures
      );
    }

    // Return successful response
    return NextResponse.json(responseData, {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        'X-Cache': 'MISS',
      },
    });

  } catch (error) {
    console.error('[api/helius-swaps] Error processing transactions:', error);

    // Determine error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unknown error occurred while processing transactions';

    // Return error response
    return NextResponse.json(
      {
        success: false,
        error: 'Transaction processing failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
