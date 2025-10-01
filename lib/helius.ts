/**
 * Helius API Integration
 * Handles transaction fetching from Helius Enhanced Transactions API
 * with pagination, rate limiting, and error handling.
 */

import axios, { AxiosError } from 'axios';
import { HeliusTransaction } from '@/types';
import { getHeliusApiKey } from './config';

// ============================================================================
// Constants
// ============================================================================

const HELIUS_BASE_URL = 'https://api.helius.xyz/v0';
const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RESULTS_PER_PAGE = 100; // Helius max limit
const MAX_TOTAL_TRANSACTIONS = 10000; // Safety limit to avoid infinite loops

/**
 * Rate limiting configuration
 * Free tier: 150 requests/minute
 * Pro tier: Higher limits
 */
const RATE_LIMIT_DELAY_MS = 400; // ~150 requests/minute
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// ============================================================================
// Rate Limiting
// ============================================================================

let lastRequestTime = 0;

/**
 * Sleep to respect rate limits
 */
async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    const delay = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

// ============================================================================
// Transaction Fetching
// ============================================================================

/**
 * Fetch a single page of swap transactions for a wallet
 *
 * Note: Fetches both SWAP and UNKNOWN types because Helius sometimes
 * misclassifies legitimate swaps as UNKNOWN
 *
 * @param walletAddress - Solana wallet address
 * @param beforeSignature - Pagination cursor (optional)
 * @returns Array of HeliusTransaction objects
 */
async function fetchSwapTransactionsPage(
  walletAddress: string,
  beforeSignature?: string
): Promise<HeliusTransaction[]> {
  await respectRateLimit();

  const apiKey = getHeliusApiKey();

  // Fetch without type filter to get all transactions
  // We'll filter for swaps manually to catch both SWAP and UNKNOWN types
  const params = new URLSearchParams({
    'api-key': apiKey,
    limit: MAX_RESULTS_PER_PAGE.toString(),
  });

  if (beforeSignature) {
    params.append('before', beforeSignature);
  }

  const url = `${HELIUS_BASE_URL}/addresses/${walletAddress}/transactions?${params.toString()}`;

  try {
    const response = await axios.get<HeliusTransaction[]>(url, {
      timeout: REQUEST_TIMEOUT,
    });

    // Filter for transactions that are swaps (type=SWAP) or have token swaps (type=UNKNOWN with 2+ token transfers)
    const allTransactions = response.data || [];
    const swapTransactions = allTransactions.filter(tx => {
      // Include explicit SWAP types
      if (tx.type === 'SWAP') {
        return true;
      }

      // Include UNKNOWN types that have token transfers (likely misclassified swaps)
      if (tx.type === 'UNKNOWN' && tx.tokenTransfers && tx.tokenTransfers.length >= 2) {
        return true;
      }

      return false;
    });

    return swapTransactions;
  } catch (error) {
    const axiosError = error as AxiosError;

    if (axiosError.response?.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    if (axiosError.response?.status === 401) {
      throw new Error('Invalid Helius API key. Check your .env.local file.');
    }

    if (axiosError.response?.status === 404) {
      throw new Error('Wallet address not found or has no transactions.');
    }

    throw new Error(
      `Failed to fetch transactions: ${axiosError.message || 'Unknown error'}`
    );
  }
}

/**
 * Fetch all swap transactions for a wallet with pagination
 *
 * This function handles:
 * - Pagination using the 'before' cursor
 * - Rate limiting to avoid API throttling
 * - Error handling and retries
 * - Safety limits to prevent infinite loops
 *
 * @param walletAddress - Solana wallet address
 * @param maxTransactions - Maximum number of transactions to fetch (default: 10000)
 * @returns Array of all swap transactions
 *
 * @example
 * const transactions = await fetchAllSwapTransactions('4NuB8ZFSjEVWE1nJTJ5RBCRmw9VHUE2g8Q5vFza4L8wm');
 * console.log(`Fetched ${transactions.length} transactions`);
 */
export async function fetchAllSwapTransactions(
  walletAddress: string,
  maxTransactions: number = MAX_TOTAL_TRANSACTIONS
): Promise<HeliusTransaction[]> {
  console.log(`[helius] Fetching swap transactions for ${walletAddress}...`);

  const allTransactions: HeliusTransaction[] = [];
  let beforeSignature: string | undefined = undefined;
  let hasMore = true;
  let pageNumber = 0;

  while (hasMore) {
    try {
      pageNumber++;
      console.log(
        `[helius] Fetching page ${pageNumber} (before: ${beforeSignature || 'none'})...`
      );

      const transactions = await fetchSwapTransactionsPage(
        walletAddress,
        beforeSignature
      );

      if (!transactions || transactions.length === 0) {
        console.log('[helius] No more transactions found');
        hasMore = false;
        break;
      }

      console.log(`[helius] Received ${transactions.length} transactions`);
      allTransactions.push(...transactions);

      // Use last transaction signature as cursor for next page
      beforeSignature = transactions[transactions.length - 1].signature;

      // Check if we've reached the maximum limit
      if (allTransactions.length >= maxTransactions) {
        console.log(
          `[helius] Reached maximum transaction limit (${maxTransactions})`
        );
        hasMore = false;
        break;
      }

      // If we got fewer transactions than the page size, we've reached the end
      if (transactions.length < MAX_RESULTS_PER_PAGE) {
        console.log('[helius] Reached end of transactions');
        hasMore = false;
        break;
      }
    } catch (error) {
      console.error(`[helius] Error fetching page ${pageNumber}:`, error);
      throw error;
    }
  }

  console.log(
    `[helius] Fetched total of ${allTransactions.length} swap transactions`
  );
  return allTransactions;
}

/**
 * Fetch swap transactions with retry logic
 *
 * @param walletAddress - Solana wallet address
 * @param maxTransactions - Maximum number of transactions to fetch
 * @param maxRetries - Maximum number of retry attempts
 * @returns Array of all swap transactions
 */
export async function fetchAllSwapTransactionsWithRetry(
  walletAddress: string,
  maxTransactions: number = MAX_TOTAL_TRANSACTIONS,
  maxRetries: number = MAX_RETRIES
): Promise<HeliusTransaction[]> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAllSwapTransactions(walletAddress, maxTransactions);
    } catch (error) {
      lastError = error as Error;

      // Don't retry for invalid API key or wallet not found
      if (
        lastError.message.includes('Invalid Helius API key') ||
        lastError.message.includes('Wallet address not found')
      ) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(
          `[helius] Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to fetch transactions after retries');
}

// ============================================================================
// Transaction Validation
// ============================================================================

/**
 * Validate a Helius transaction has required fields
 *
 * @param tx - HeliusTransaction to validate
 * @returns true if transaction is valid
 */
export function isValidHeliusTransaction(tx: HeliusTransaction): boolean {
  if (!tx.signature || !tx.timestamp) {
    return false;
  }

  if (tx.type !== 'SWAP') {
    return false;
  }

  // Check if transaction has either tokenTransfers or accountData
  const hasTokenTransfers = tx.tokenTransfers && tx.tokenTransfers.length > 0;
  const hasAccountData = tx.accountData && tx.accountData.length > 0;

  if (!hasTokenTransfers && !hasAccountData) {
    return false;
  }

  return true;
}

/**
 * Filter out invalid transactions
 *
 * @param transactions - Array of HeliusTransaction objects
 * @returns Filtered array of valid transactions
 */
export function filterValidTransactions(
  transactions: HeliusTransaction[]
): HeliusTransaction[] {
  const validTransactions = transactions.filter(isValidHeliusTransaction);

  const invalidCount = transactions.length - validTransactions.length;
  if (invalidCount > 0) {
    console.warn(
      `[helius] Filtered out ${invalidCount} invalid transactions`
    );
  }

  return validTransactions;
}

// ============================================================================
// Wallet Validation
// ============================================================================

/**
 * Validate a Solana wallet address format
 *
 * @param walletAddress - Wallet address to validate
 * @returns true if address format is valid
 */
export function isValidSolanaAddress(walletAddress: string): boolean {
  // Solana addresses are base58 encoded and typically 32-44 characters
  if (!walletAddress || walletAddress.length < 32 || walletAddress.length > 44) {
    return false;
  }

  // Check if it contains only valid base58 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(walletAddress);
}

/**
 * Validate wallet address and throw error if invalid
 *
 * @param walletAddress - Wallet address to validate
 * @throws Error if address is invalid
 */
export function validateWalletAddress(walletAddress: string): void {
  if (!isValidSolanaAddress(walletAddress)) {
    throw new Error(
      'Invalid Solana wallet address. Please check the address and try again.'
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Solscan URL for a transaction signature
 *
 * @param signature - Transaction signature
 * @param cluster - Solana cluster (default: 'mainnet-beta')
 * @returns Solscan URL
 */
export function getSolscanUrl(
  signature: string,
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'
): string {
  if (cluster === 'mainnet-beta') {
    return `https://solscan.io/tx/${signature}`;
  }
  return `https://solscan.io/tx/${signature}?cluster=${cluster}`;
}

/**
 * Get Solana Explorer URL for a transaction signature
 *
 * @param signature - Transaction signature
 * @param cluster - Solana cluster (default: 'mainnet-beta')
 * @returns Solana Explorer URL
 */
export function getSolanaExplorerUrl(
  signature: string,
  cluster: 'mainnet-beta' | 'devnet' | 'testnet' = 'mainnet-beta'
): string {
  if (cluster === 'mainnet-beta') {
    return `https://explorer.solana.com/tx/${signature}`;
  }
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Extract unique token mints from transactions
 *
 * @param transactions - Array of HeliusTransaction objects
 * @returns Set of unique token mint addresses
 */
export function extractUniqueMints(
  transactions: HeliusTransaction[]
): Set<string> {
  const mints = new Set<string>();

  for (const tx of transactions) {
    // Extract from tokenTransfers
    if (tx.tokenTransfers) {
      for (const transfer of tx.tokenTransfers) {
        if (transfer.mint) {
          mints.add(transfer.mint);
        }
      }
    }

    // Extract from accountData tokenBalanceChanges
    if (tx.accountData) {
      for (const account of tx.accountData) {
        if (account.tokenBalanceChanges) {
          for (const change of account.tokenBalanceChanges) {
            if (change.mint) {
              mints.add(change.mint);
            }
          }
        }
      }
    }
  }

  return mints;
}

/**
 * Calculate estimated API cost for a wallet
 *
 * @param transactionCount - Number of transactions
 * @returns Estimated number of API requests
 */
export function estimateApiCost(transactionCount: number): number {
  const pages = Math.ceil(transactionCount / MAX_RESULTS_PER_PAGE);
  // Add 1 for token list fetch, 1 for price batch fetch
  return pages + 2;
}

/**
 * Format transaction count for display
 *
 * @param count - Number of transactions
 * @returns Formatted string
 */
export function formatTransactionCount(count: number): string {
  if (count === 0) {
    return 'No transactions';
  }
  if (count === 1) {
    return '1 transaction';
  }
  return `${count.toLocaleString()} transactions`;
}
