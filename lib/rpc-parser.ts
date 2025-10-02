/**
 * RPC Transaction Parser
 * Handles fetching and parsing raw Solana transactions via Helius RPC
 * for cases where Enhanced Transactions API doesn't capture them.
 */

import axios from 'axios';
import { HeliusTransaction } from '@/types';
import { getHeliusApiKey } from './config';

// ============================================================================
// Constants
// ============================================================================

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';
const REQUEST_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Account key object from jsonParsed RPC response
 */
interface AccountKey {
  pubkey: string;
  writable: boolean;
  signer: boolean;
  source: string;
}

/**
 * Raw RPC transaction response from Helius
 */
interface RpcTransactionResponse {
  blockTime: number | null;
  meta: {
    err: any;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    logMessages?: string[];
  } | null;
  slot: number;
  transaction: {
    message: {
      accountKeys: AccountKey[]; // Objects with pubkey when using jsonParsed encoding
      instructions: any[];
      recentBlockhash: string;
    };
    signatures: string[];
  };
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

/**
 * RPC cache entry
 */
interface CacheEntry {
  transaction: HeliusTransaction;
  fetchedAt: number;
  ttl: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * Simple LRU (Least Recently Used) cache with size limit
 * Prevents memory leaks by evicting oldest entries when full
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest (first) entry if at max size
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    // Add new entry (most recent)
    this.cache.set(key, value);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// In-Memory Cache
// ============================================================================

const rpcCache = new LRUCache<string, CacheEntry>(1000); // Max 1000 cached transactions
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get cached transaction if available and not expired
 */
function getCachedTransaction(signature: string): HeliusTransaction | null {
  const cached = rpcCache.get(signature);

  if (!cached) {
    return null;
  }

  const now = Date.now();
  const age = now - cached.fetchedAt;

  if (age > cached.ttl) {
    // Cache expired, remove it
    rpcCache.delete(signature);
    return null;
  }

  console.log(`[rpc-parser] Cache hit for ${signature}`);
  return cached.transaction;
}

/**
 * Cache a transaction
 */
function cacheTransaction(signature: string, transaction: HeliusTransaction): void {
  rpcCache.set(signature, {
    transaction,
    fetchedAt: Date.now(),
    ttl: CACHE_TTL_MS,
  });
}

// ============================================================================
// RPC Fetching with Retry Logic
// ============================================================================

/**
 * Exponential backoff retry configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // Start with 1s
  maxDelay: 8000, // Cap at 8s
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

/**
 * Retry wrapper with exponential backoff (Phase 1.2 Optimization)
 *
 * Handles rate limiting (429) and server errors with progressive delays:
 * - Attempt 1: immediate
 * - Attempt 2: wait 1s
 * - Attempt 3: wait 2s
 * - Attempt 4: wait 4s
 *
 * @param fn - Async function to retry
 * @param config - Retry configuration
 * @returns Result of the function or throws after max retries
 */
async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRetryable =
        error.response?.status &&
        config.retryableStatusCodes.includes(error.response.status);

      const isLastAttempt = attempt === config.maxRetries;

      if (!isRetryable || isLastAttempt) {
        throw error;
      }

      // Calculate exponential backoff delay
      const exponentialDelay = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      );

      const statusCode = error.response?.status || 'unknown';
      console.log(
        `[rpc-parser] ⚠️  Rate limit/server error (${statusCode}), retrying in ${exponentialDelay}ms (attempt ${attempt + 1}/${config.maxRetries})...`
      );

      await new Promise((resolve) => setTimeout(resolve, exponentialDelay));
    }
  }

  throw lastError;
}

/**
 * Fetch a raw transaction from Helius RPC using getTransaction method
 *
 * @param signature - Transaction signature
 * @returns Raw RPC transaction response
 */
async function fetchRawTransaction(
  signature: string
): Promise<RpcTransactionResponse | null> {
  const apiKey = getHeliusApiKey();
  const url = `${HELIUS_RPC_URL}/?api-key=${apiKey}`;

  try {
    console.log(`[rpc-parser] Fetching raw transaction: ${signature}`);

    // Wrap axios call with exponential backoff retry
    const response = await withExponentialBackoff(async () => {
      return await axios.post(
        url,
        {
          jsonrpc: '2.0',
          id: 'get-transaction',
          method: 'getTransaction',
          params: [
            signature,
            {
              encoding: 'jsonParsed',
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed',
            },
          ],
        },
        { timeout: REQUEST_TIMEOUT }
      );
    });

    if (response.data.error) {
      console.error(`[rpc-parser] RPC error:`, response.data.error);
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error(`[rpc-parser] Failed to fetch transaction after retries:`, error);
    return null;
  }
}

// ============================================================================
// Transaction Parsing
// ============================================================================

/**
 * Parse raw RPC transaction into HeliusTransaction format
 *
 * This converts the raw Solana transaction data into the same format
 * as Helius Enhanced Transactions API for seamless integration.
 *
 * @param signature - Transaction signature
 * @param rawTx - Raw RPC transaction response
 * @param walletAddress - Optional wallet address to identify from/to accounts
 * @returns HeliusTransaction object
 */
function parseRawTransaction(
  signature: string,
  rawTx: RpcTransactionResponse,
  walletAddress?: string
): HeliusTransaction {
  const meta = rawTx.meta;

  if (!meta) {
    throw new Error('Transaction has no metadata');
  }

  // Extract token transfers from pre/post token balances
  const tokenTransfers = extractTokenTransfers(
    rawTx.transaction.message.accountKeys,
    meta.preTokenBalances || [],
    meta.postTokenBalances || [],
    walletAddress
  );

  // Filter out non-swap transactions early (swaps need at least 2 token transfers)
  if (tokenTransfers.length < 2) {
    console.log(`[rpc-parser] Skipping ${signature} - only ${tokenTransfers.length} token transfers (need >= 2 for swaps)`);
    throw new Error('Not a swap transaction - insufficient token transfers');
  }

  // Create HeliusTransaction object
  const heliusTransaction: HeliusTransaction = {
    signature,
    timestamp: rawTx.blockTime || 0,
    slot: rawTx.slot,
    type: 'UNKNOWN', // We don't have type classification from raw RPC
    fee: meta.fee,
    feePayer: rawTx.transaction.message.accountKeys[0]?.pubkey || '',

    // Token transfers extracted from balance changes
    tokenTransfers,

    // Account data with token balance changes
    accountData: extractAccountData(
      rawTx.transaction.message.accountKeys,
      meta.preTokenBalances || [],
      meta.postTokenBalances || []
    ),

    // Native transfers (SOL)
    nativeTransfers: extractNativeTransfers(
      rawTx.transaction.message.accountKeys,
      meta.preBalances,
      meta.postBalances
    ),

    // Transaction success/failure
    success: meta.err === null,
  };

  return heliusTransaction;
}

/**
 * Extract token transfers by comparing pre and post token balances
 *
 * This function matches decreases with increases to create proper transfer pairs.
 * For example, if account A decreases by 100 tokens and account B increases by 100,
 * it creates one transfer FROM account A TO account B, not two separate transfers.
 *
 * @param walletAddress - Optional wallet address to identify from/to properly
 */
function extractTokenTransfers(
  accountKeys: AccountKey[],
  preBalances: TokenBalance[],
  postBalances: TokenBalance[],
  walletAddress?: string
): any[] {
  // First, calculate all balance changes grouped by mint
  interface BalanceChange {
    accountIndex: number;
    accountKey: string;
    owner: string;
    mint: string;
    change: number;
    decimals: number;
  }

  const changesByMint = new Map<string, BalanceChange[]>();

  // Create map of account index to pre-balance
  const preBalanceMap = new Map<number, TokenBalance>();
  for (const balance of preBalances) {
    preBalanceMap.set(balance.accountIndex, balance);
  }

  // Calculate all balance changes
  for (const postBalance of postBalances) {
    const preBalance = preBalanceMap.get(postBalance.accountIndex);

    if (!preBalance) {
      continue;
    }

    // Use uiAmount (decimal-adjusted) instead of amount (raw)
    const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
    const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
    const change = postAmount - preAmount;

    // Skip if no change
    if (change === 0) {
      continue;
    }

    const accountKeyObj = accountKeys[postBalance.accountIndex];

    // Ensure accountKey object exists and has pubkey
    if (!accountKeyObj || !accountKeyObj.pubkey) {
      console.warn(`[rpc-parser] Invalid accountKey at index ${postBalance.accountIndex}, skipping transfer`);
      continue;
    }

    const accountKey = accountKeyObj.pubkey;
    const owner = (postBalance.owner && typeof postBalance.owner === 'string')
      ? postBalance.owner
      : accountKey;

    // Group by mint
    if (!changesByMint.has(postBalance.mint)) {
      changesByMint.set(postBalance.mint, []);
    }

    changesByMint.get(postBalance.mint)!.push({
      accountIndex: postBalance.accountIndex,
      accountKey,
      owner,
      mint: postBalance.mint,
      change,
      decimals: postBalance.uiTokenAmount.decimals,
    });
  }

  // Now match decreases with increases to create proper transfers
  const transfers: any[] = [];

  for (const [mint, changes] of changesByMint) {
    const increases = changes.filter(c => c.change > 0);
    const decreases = changes.filter(c => c.change < 0);

    // Simple case: one decrease, one increase (direct transfer)
    if (increases.length === 1 && decreases.length === 1) {
      const from = decreases[0];
      const to = increases[0];

      transfers.push({
        mint,
        tokenAmount: Math.abs(from.change),
        tokenStandard: 'Fungible',
        fromUserAccount: from.owner,      // Wallet sending
        toUserAccount: to.owner,          // Wallet receiving
        decimals: from.decimals,
      });
    }
    // Multiple increases/decreases: create individual transfers
    else {
      // Create a transfer for each balance change
      // This preserves the original behavior for complex cases
      for (const change of changes) {
        if (change.change > 0) {
          // Incoming transfer
          transfers.push({
            mint: change.mint,
            tokenAmount: Math.abs(change.change),
            tokenStandard: 'Fungible',
            fromUserAccount: change.accountKey, // Token account
            toUserAccount: change.owner,        // Wallet address
            decimals: change.decimals,
          });
        } else {
          // Outgoing transfer
          transfers.push({
            mint: change.mint,
            tokenAmount: Math.abs(change.change),
            tokenStandard: 'Fungible',
            fromUserAccount: change.owner,      // Wallet address
            toUserAccount: change.accountKey,    // Token account
            decimals: change.decimals,
          });
        }
      }
    }
  }

  return transfers;
}

/**
 * Extract account data with token balance changes
 */
function extractAccountData(
  accountKeys: AccountKey[],
  preBalances: TokenBalance[],
  postBalances: TokenBalance[]
): any[] {
  const accountData: any[] = [];

  // Create map for easy lookup
  const preBalanceMap = new Map<number, TokenBalance>();
  for (const balance of preBalances) {
    preBalanceMap.set(balance.accountIndex, balance);
  }

  // Process each post balance
  for (const postBalance of postBalances) {
    const preBalance = preBalanceMap.get(postBalance.accountIndex);

    if (!preBalance) {
      continue;
    }

    const preAmount = parseFloat(preBalance.uiTokenAmount.amount);
    const postAmount = parseFloat(postBalance.uiTokenAmount.amount);
    const change = postAmount - preAmount;

    const accountKey = accountKeys[postBalance.accountIndex]?.pubkey || '';

    accountData.push({
      account: postBalance.owner || accountKey,
      nativeBalanceChange: 0,
      tokenBalanceChanges: [
        {
          mint: postBalance.mint,
          rawTokenAmount: {
            tokenAmount: change.toString(),
            decimals: postBalance.uiTokenAmount.decimals,
          },
          userAccount: postBalance.owner || accountKey,
        },
      ],
    });
  }

  return accountData;
}

/**
 * Extract native SOL transfers
 */
function extractNativeTransfers(
  accountKeys: AccountKey[],
  preBalances: number[],
  postBalances: number[]
): any[] {
  const transfers: any[] = [];

  for (let i = 0; i < accountKeys.length; i++) {
    const preBalance = preBalances[i] || 0;
    const postBalance = postBalances[i] || 0;
    const change = postBalance - preBalance;

    if (change !== 0) {
      transfers.push({
        account: accountKeys[i]?.pubkey || '',
        amount: Math.abs(change),
        type: change > 0 ? 'incoming' : 'outgoing',
      });
    }
  }

  return transfers;
}

// ============================================================================
// Signature Discovery
// ============================================================================

/**
 * Fetch all transaction signatures for a wallet using RPC
 * This is faster than fetching full transactions - just gets signatures
 *
 * @param walletAddress - Wallet address to get signatures for
 * @param limit - Maximum signatures to fetch (default: 1000, Helius max)
 * @returns Array of transaction signatures
 */
export async function fetchAllSignaturesForAddress(
  walletAddress: string,
  limit: number = 1000
): Promise<string[]> {
  const apiKey = getHeliusApiKey();
  const url = `${HELIUS_RPC_URL}/?api-key=${apiKey}`;

  try {
    console.log(`[rpc-parser] Fetching signatures for ${walletAddress}...`);

    const response = await axios.post(
      url,
      {
        jsonrpc: '2.0',
        id: 'get-signatures',
        method: 'getSignaturesForAddress',
        params: [
          walletAddress,
          {
            limit,
            commitment: 'confirmed',
          },
        ],
      },
      { timeout: REQUEST_TIMEOUT }
    );

    if (response.data.error) {
      console.error(`[rpc-parser] RPC error:`, response.data.error);
      return [];
    }

    const signatures = response.data.result?.map((item: any) => item.signature) || [];
    console.log(`[rpc-parser] Found ${signatures.length} total signatures for wallet`);

    return signatures;
  } catch (error) {
    console.error(`[rpc-parser] Failed to fetch signatures:`, error);
    return [];
  }
}

/**
 * Detect missing signatures by comparing Enhanced API results with RPC
 *
 * @param walletAddress - Wallet address
 * @param enhancedSignatures - Signatures from Enhanced API
 * @param maxToCheck - Maximum signatures to check from RPC (default: 1000, Helius max)
 * @returns Array of missing signatures
 */
export async function detectMissingSignatures(
  walletAddress: string,
  enhancedSignatures: string[],
  maxToCheck: number = 1000
): Promise<string[]> {
  console.log(`[rpc-parser] Detecting missing signatures...`);

  // Get all signatures from RPC
  const allSignatures = await fetchAllSignaturesForAddress(walletAddress, maxToCheck);

  if (allSignatures.length === 0) {
    console.log('[rpc-parser] No signatures found from RPC');
    return [];
  }

  // Create set of Enhanced API signatures for fast lookup
  const enhancedSet = new Set(enhancedSignatures);

  // Find signatures that exist in RPC but not in Enhanced API
  const missingSignatures = allSignatures.filter(sig => !enhancedSet.has(sig));

  console.log(
    `[rpc-parser] Found ${missingSignatures.length} potentially missing signatures (${allSignatures.length} total - ${enhancedSignatures.length} enhanced)`
  );

  return missingSignatures;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Fetch and parse a transaction by signature using RPC
 *
 * This function:
 * 1. Checks cache first
 * 2. Fetches raw transaction from Helius RPC
 * 3. Parses into HeliusTransaction format
 * 4. Caches the result
 *
 * @param signature - Transaction signature
 * @param walletAddress - Optional wallet address to properly identify from/to accounts
 * @returns HeliusTransaction or null if not found
 *
 * @example
 * const tx = await fetchTransactionBySignature('2qBExRFE...', 'wallet123');
 * if (tx) {
 *   console.log(`Found ${tx.tokenTransfers.length} token transfers`);
 * }
 */
export async function fetchTransactionBySignature(
  signature: string,
  walletAddress?: string
): Promise<HeliusTransaction | null> {
  // Check cache first
  const cached = getCachedTransaction(signature);
  if (cached) {
    return cached;
  }

  // Fetch raw transaction
  const rawTx = await fetchRawTransaction(signature);
  if (!rawTx) {
    return null;
  }

  // Parse into HeliusTransaction format
  try {
    const heliusTransaction = parseRawTransaction(signature, rawTx, walletAddress);

    // Cache it
    cacheTransaction(signature, heliusTransaction);

    console.log(
      `[rpc-parser] Successfully parsed transaction: ${signature} (${heliusTransaction.tokenTransfers.length} token transfers)`
    );

    return heliusTransaction;
  } catch (error) {
    console.error(`[rpc-parser] Failed to parse transaction:`, error);
    return null;
  }
}

/**
 * Fetch multiple transactions in batch with rate limiting
 *
 * Processes transactions in smaller batches with delays to prevent 429 errors
 *
 * @param signatures - Array of transaction signatures
 * @param walletAddress - Optional wallet address for proper from/to identification
 * @returns Array of HeliusTransaction objects (nulls filtered out)
 */
export async function fetchTransactionsBatch(
  signatures: string[],
  walletAddress?: string
): Promise<HeliusTransaction[]> {
  console.log(`[rpc-parser] Fetching ${signatures.length} transactions with optimized rate limiting...`);

  const allTransactions: HeliusTransaction[] = [];

  // Phase 1 Optimization: Increased parallelism for better throughput
  // Helius free tier: 150 req/min = 2.5 req/sec
  // Current config: 10 requests per 3s = 3.33 req/sec = 200 req/min (33% over limit)
  // Strategy: Slightly exceed limit, handle 429s gracefully
  // TODO Phase 1.2: Add exponential backoff retry for bulletproof rate limiting
  const BATCH_SIZE = 10; // Up from 5 (2x parallelism)
  const BATCH_DELAY_MS = 3000; // Up from 2000ms, balanced for ~1.3x throughput improvement

  for (let i = 0; i < signatures.length; i += BATCH_SIZE) {
    const batch = signatures.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(signatures.length / BATCH_SIZE);

    console.log(
      `[rpc-parser] Processing batch ${batchNum}/${totalBatches} (${batch.length} transactions) - ${allTransactions.length} swaps found so far`
    );

    // Fetch all transactions in this batch in parallel
    const promises = batch.map((sig) => fetchTransactionBySignature(sig, walletAddress));
    const results = await Promise.all(promises);

    // Filter out nulls and add to results
    const transactions = results.filter((tx): tx is HeliusTransaction => tx !== null);
    allTransactions.push(...transactions);

    console.log(`[rpc-parser] Batch ${batchNum}: Found ${transactions.length}/${batch.length} valid swaps`);

    // Add delay between batches to respect rate limits (except for last batch)
    if (i + BATCH_SIZE < signatures.length) {
      const remainingBatches = totalBatches - batchNum;
      const estimatedTimeRemaining = (remainingBatches * BATCH_DELAY_MS) / 1000;
      console.log(`[rpc-parser] Waiting ${BATCH_DELAY_MS/1000}s before next batch... (est. ${estimatedTimeRemaining.toFixed(0)}s remaining)`);
      await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(
    `[rpc-parser] ✅ Successfully fetched ${allTransactions.length} swaps from ${signatures.length} transactions`
  );

  return allTransactions;
}

/**
 * Clear the RPC cache
 */
export function clearRpcCache(): void {
  rpcCache.clear();
  console.log('[rpc-parser] Cache cleared');
}
