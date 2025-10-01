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
      accountKeys: string[];
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
// In-Memory Cache
// ============================================================================

const rpcCache = new Map<string, CacheEntry>();
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
// RPC Fetching
// ============================================================================

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

    const response = await axios.post(
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

    if (response.data.error) {
      console.error(`[rpc-parser] RPC error:`, response.data.error);
      return null;
    }

    return response.data.result;
  } catch (error) {
    console.error(`[rpc-parser] Failed to fetch transaction:`, error);
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

  // Create HeliusTransaction object
  const heliusTransaction: HeliusTransaction = {
    signature,
    timestamp: rawTx.blockTime || 0,
    slot: rawTx.slot,
    type: 'UNKNOWN', // We don't have type classification from raw RPC
    fee: meta.fee,
    feePayer: rawTx.transaction.message.accountKeys[0] || '',

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
 * @param walletAddress - Optional wallet address to identify from/to properly
 */
function extractTokenTransfers(
  accountKeys: string[],
  preBalances: TokenBalance[],
  postBalances: TokenBalance[],
  walletAddress?: string
): any[] {
  const transfers: any[] = [];

  // Create map of account index to pre-balance
  const preBalanceMap = new Map<number, TokenBalance>();
  for (const balance of preBalances) {
    preBalanceMap.set(balance.accountIndex, balance);
  }

  // Compare post balances with pre balances to find transfers
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

    const accountKey = accountKeys[postBalance.accountIndex];
    const owner = postBalance.owner || accountKey;

    // Determine if this is the wallet's account
    const isWalletAccount = walletAddress && owner.toLowerCase() === walletAddress.toLowerCase();

    if (change > 0) {
      // Incoming transfer (already decimal-adjusted)
      transfers.push({
        mint: postBalance.mint,
        tokenAmount: Math.abs(change),
        tokenStandard: 'Fungible',
        fromUserAccount: isWalletAccount ? '' : owner, // Empty if it's the wallet receiving
        toUserAccount: owner,
        decimals: postBalance.uiTokenAmount.decimals,
      });
    } else {
      // Outgoing transfer (already decimal-adjusted)
      transfers.push({
        mint: postBalance.mint,
        tokenAmount: Math.abs(change),
        tokenStandard: 'Fungible',
        fromUserAccount: owner,
        toUserAccount: isWalletAccount ? '' : owner, // Empty if it's the wallet sending
        decimals: postBalance.uiTokenAmount.decimals,
      });
    }
  }

  return transfers;
}

/**
 * Extract account data with token balance changes
 */
function extractAccountData(
  accountKeys: string[],
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

    const accountKey = accountKeys[postBalance.accountIndex];

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
  accountKeys: string[],
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
        account: accountKeys[i],
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
 * @param limit - Maximum signatures to fetch (default: 1000)
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
 * @param maxToCheck - Maximum signatures to check from RPC (default: 1000)
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
 * Fetch multiple transactions in batch
 *
 * @param signatures - Array of transaction signatures
 * @param walletAddress - Optional wallet address for proper from/to identification
 * @returns Array of HeliusTransaction objects (nulls filtered out)
 */
export async function fetchTransactionsBatch(
  signatures: string[],
  walletAddress?: string
): Promise<HeliusTransaction[]> {
  console.log(`[rpc-parser] Fetching ${signatures.length} transactions in batch...`);

  const promises = signatures.map((sig) => fetchTransactionBySignature(sig, walletAddress));
  const results = await Promise.all(promises);

  // Filter out nulls
  const transactions = results.filter((tx): tx is HeliusTransaction => tx !== null);

  console.log(
    `[rpc-parser] Successfully fetched ${transactions.length}/${signatures.length} transactions`
  );

  return transactions;
}

/**
 * Clear the RPC cache
 */
export function clearRpcCache(): void {
  rpcCache.clear();
  console.log('[rpc-parser] Cache cleared');
}
