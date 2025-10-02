/**
 * Transaction Processing Pipeline
 * Handles complete processing of Helius transactions into DeFiActivity records
 * with swap classification, token-to-token splitting, and USD value calculation.
 */

import {
  DeFiActivity,
  HeliusTransaction,
  SwapClassification,
  TokenMetadata,
} from '@/types';
import {
  getBatchTokenMetadata,
  formatTokenAmount,
  isBaseCurrency,
} from './tokens';
// Prices removed - no longer fetching USD values
// import {
//   fetchBatchPrices,
//   calculateValueUSD,
// } from './prices';
import {
  fetchAllSwapTransactionsWithRetry,
  filterValidTransactions,
  extractUniqueMints,
} from './helius';
import {
  fetchTransactionsBatch,
  detectMissingSignatures,
} from './rpc-parser';
import {
  fetchAllSignatures,
  fetchSignaturesInRange,
} from './signatures';

// ============================================================================
// Transaction Merging
// ============================================================================

/**
 * Merge transactions from Enhanced API and RPC, removing duplicates
 *
 * @param enhancedTransactions - Transactions from Enhanced API
 * @param rpcTransactions - Transactions from RPC fallback
 * @returns Merged array with duplicates removed
 */
function mergeTransactions(
  enhancedTransactions: HeliusTransaction[],
  rpcTransactions: HeliusTransaction[]
): HeliusTransaction[] {
  // Create map of Enhanced API transactions by signature
  const transactionMap = new Map<string, HeliusTransaction>();

  // Add Enhanced API transactions first (they take priority)
  for (const tx of enhancedTransactions) {
    transactionMap.set(tx.signature, tx);
  }

  // Add RPC transactions only if signature doesn't exist
  for (const tx of rpcTransactions) {
    if (!transactionMap.has(tx.signature)) {
      transactionMap.set(tx.signature, tx);
    }
  }

  // Convert map back to array
  const mergedTransactions = Array.from(transactionMap.values());

  console.log(
    `[transactions] Merged transactions: ${mergedTransactions.length} total (${enhancedTransactions.length} Enhanced API + ${rpcTransactions.length} RPC, ${enhancedTransactions.length + rpcTransactions.length - mergedTransactions.length} duplicates removed)`
  );

  return mergedTransactions;
}

// ============================================================================
// Transaction Classification
// ============================================================================

/**
 * Reclassify transaction types based on token transfers
 *
 * Helius sometimes misclassifies transactions, so we re-analyze them:
 * - UNKNOWN/TRANSFER with 2+ token transfers → SWAP
 * - Transactions with same token in/out → SWAP (self-swaps)
 *
 * @param activities - Array of DeFiActivity objects
 * @returns Reclassified activities
 */
function reclassifyTransactionTypes(
  activities: DeFiActivity[]
): DeFiActivity[] {
  console.log('[transactions] Step 5: Reclassifying transaction types...');

  for (const activity of activities) {
    const originalType = activity.type;

    // If it has token in and token out, it's a swap
    if (activity.tokenIn && activity.tokenOut) {
      activity.type = 'SWAP';
    }
    // If it's marked as UNKNOWN/TRANSFER but has swapClassification
    else if (
      (activity.type === 'UNKNOWN' || activity.type === 'TRANSFER') &&
      activity.swapClassification
    ) {
      activity.type = 'SWAP';
    }

    if (activity.type !== originalType) {
      console.log(
        `[transactions] Reclassified ${activity.signature.slice(0, 8)}... from ${originalType} to ${activity.type}`
      );
    }
  }

  return activities;
}

// ============================================================================
// Swap Detection and Extraction
// ============================================================================

/**
 * Extract swap data from a Helius transaction
 *
 * Analyzes token transfers to identify swap patterns:
 * 1. Single swap: 1 token out, 1 token in
 * 2. Multi-hop swap: N tokens out, M tokens in (complex routing)
 * 3. Split into individual token-to-token swaps for clarity
 *
 * @param tx - Helius transaction to analyze
 * @param walletAddress - Wallet address to identify from/to
 * @param tokenMetadataMap - Map of token mints to metadata
 * @returns Array of DeFiActivity objects (one per token-to-token swap)
 */
function extractSwapData(
  tx: HeliusTransaction,
  walletAddress: string,
  tokenMetadataMap: Map<string, TokenMetadata>
): DeFiActivity[] {
  // Try extracting from accountData first (more reliable for complex swaps)
  const accountDataActivities = extractSwapDataFromAccountData(
    tx,
    walletAddress,
    tokenMetadataMap
  );

  if (accountDataActivities.length > 0) {
    console.log(
      `[transactions] Extracted ${accountDataActivities.length} swap(s) from accountData for ${tx.signature.slice(0, 8)}...`
    );
    return accountDataActivities;
  }

  // Fallback to tokenTransfers if accountData extraction failed
  console.log(
    `[transactions] AccountData extraction failed for ${tx.signature.slice(0, 8)}, trying tokenTransfers...`
  );
  return extractSwapDataFromTokenTransfers(tx, walletAddress, tokenMetadataMap);
}

/**
 * Extract swap data from accountData (token balance changes)
 *
 * This method is more reliable for multi-hop swaps and complex transactions
 * because it directly tracks balance changes rather than individual transfers.
 *
 * @param tx - Helius transaction
 * @param walletAddress - Wallet address
 * @param tokenMetadataMap - Token metadata map
 * @returns Array of DeFiActivity objects
 */
function extractSwapDataFromAccountData(
  tx: HeliusTransaction,
  walletAddress: string,
  tokenMetadataMap: Map<string, TokenMetadata>
): DeFiActivity[] {
  if (!tx.accountData || tx.accountData.length === 0) {
    return [];
  }

  // Find wallet's token balance changes
  const walletChanges = tx.accountData
    .filter((account) => {
      // Look for accounts belonging to the wallet
      return (
        account.account === walletAddress &&
        account.tokenBalanceChanges &&
        account.tokenBalanceChanges.length > 0
      );
    })
    .flatMap((account) => account.tokenBalanceChanges || []);

  if (walletChanges.length < 2) {
    console.log(
      `[transactions] AccountData extraction failed: ${walletChanges.length} balance changes (need >= 2)`
    );
    return [];
  }

  // Separate increases and decreases
  const increases = walletChanges.filter(
    (change) => parseFloat(change.rawTokenAmount.tokenAmount) > 0
  );
  const decreases = walletChanges.filter(
    (change) => parseFloat(change.rawTokenAmount.tokenAmount) < 0
  );

  console.log(
    `[transactions] AccountData: ${decreases.length} out, ${increases.length} in`
  );

  // Create activities for each combination of decrease → increase
  const activities: DeFiActivity[] = [];

  for (const decrease of decreases) {
    for (const increase of increases) {
      const tokenOut = tokenMetadataMap.get(decrease.mint);
      const tokenIn = tokenMetadataMap.get(increase.mint);

      if (!tokenOut || !tokenIn) {
        console.warn(
          `[transactions] Missing token metadata for ${decrease.mint} or ${increase.mint}`
        );
        continue;
      }

      const amountOut = Math.abs(
        parseFloat(decrease.rawTokenAmount.tokenAmount)
      );
      const amountIn = parseFloat(increase.rawTokenAmount.tokenAmount);

      const activity: DeFiActivity = {
        signature: tx.signature,
        type: tx.type,
        timestamp: tx.timestamp,
        feePayer: tx.feePayer,
        slot: tx.slot,
        tokenIn: {
          symbol: tokenIn.symbol,
          amount: formatTokenAmount(amountIn, tokenIn.decimals),
          decimals: tokenIn.decimals,
          mint: tokenIn.address,
          logoURI: tokenIn.logoURI,
        },
        tokenOut: {
          symbol: tokenOut.symbol,
          amount: formatTokenAmount(amountOut, tokenOut.decimals),
          decimals: tokenOut.decimals,
          mint: tokenOut.address,
          logoURI: tokenOut.logoURI,
        },
        swapClassification: classifySwap(tokenOut.symbol, tokenIn.symbol),
      };

      activities.push(activity);
    }
  }

  return activities;
}

/**
 * Extract swap data from tokenTransfers
 *
 * Fallback method when accountData is not available or insufficient.
 * Analyzes individual token transfers to identify swaps.
 *
 * @param tx - Helius transaction
 * @param walletAddress - Wallet address
 * @param tokenMetadataMap - Token metadata map
 * @returns Array of DeFiActivity objects
 */
function extractSwapDataFromTokenTransfers(
  tx: HeliusTransaction,
  walletAddress: string,
  tokenMetadataMap: Map<string, TokenMetadata>
): DeFiActivity[] {
  if (!tx.tokenTransfers || tx.tokenTransfers.length < 2) {
    console.log(
      `[transactions] TokenTransfers extraction failed: ${tx.tokenTransfers?.length || 0} transfers (need >= 2)`
    );
    return [];
  }

  // Identify transfers involving the wallet
  const outgoingTransfers = tx.tokenTransfers.filter(
    (transfer) => transfer.fromUserAccount === walletAddress
  );
  const incomingTransfers = tx.tokenTransfers.filter(
    (transfer) => transfer.toUserAccount === walletAddress
  );

  console.log(
    `[transactions] Analyzing ${tx.tokenTransfers.length} token transfers for ${tx.signature.slice(0, 8)}... (wallet involved in ${outgoingTransfers.length + incomingTransfers.length} transfers, ${new Set([...outgoingTransfers.map(t => t.mint), ...incomingTransfers.map(t => t.mint)]).size} unique tokens)`
  );

  // Need at least one incoming and one outgoing transfer
  if (outgoingTransfers.length === 0 || incomingTransfers.length === 0) {
    console.log(
      `[transactions] TokenTransfers extraction failed: ${outgoingTransfers.length} out, ${incomingTransfers.length} in (need >= 1 each)`
    );
    return [];
  }

  // Create activities for each combination of outgoing → incoming
  const activities: DeFiActivity[] = [];

  for (const outgoing of outgoingTransfers) {
    for (const incoming of incomingTransfers) {
      const tokenOut = tokenMetadataMap.get(outgoing.mint);
      const tokenIn = tokenMetadataMap.get(incoming.mint);

      if (!tokenOut || !tokenIn) {
        console.warn(
          `[transactions] Missing token metadata for ${outgoing.mint} or ${incoming.mint}`
        );
        continue;
      }

      const activity: DeFiActivity = {
        signature: tx.signature,
        type: tx.type,
        timestamp: tx.timestamp,
        feePayer: tx.feePayer,
        slot: tx.slot,
        tokenIn: {
          symbol: tokenIn.symbol,
          amount: formatTokenAmount(incoming.tokenAmount, tokenIn.decimals),
          decimals: tokenIn.decimals,
          mint: tokenIn.address,
          logoURI: tokenIn.logoURI,
        },
        tokenOut: {
          symbol: tokenOut.symbol,
          amount: formatTokenAmount(outgoing.tokenAmount, tokenOut.decimals),
          decimals: tokenOut.decimals,
          mint: tokenOut.address,
          logoURI: tokenOut.logoURI,
        },
        swapClassification: classifySwap(tokenOut.symbol, tokenIn.symbol),
      };

      activities.push(activity);
    }
  }

  return activities;
}

/**
 * Classify a swap as BUY or SELL based on tokens involved
 *
 * Rules:
 * - Base currency (SOL, USDC, etc.) → Token = BUY
 * - Token → Base currency = SELL
 * - Token ↔ Token = SWAP
 *
 * @param tokenOutSymbol - Symbol of token being sold
 * @param tokenInSymbol - Symbol of token being bought
 * @returns Swap classification
 */
function classifySwap(
  tokenOutSymbol: string,
  tokenInSymbol: string
): SwapClassification {
  const isTokenOutBase = isBaseCurrency(tokenOutSymbol);
  const isTokenInBase = isBaseCurrency(tokenInSymbol);

  if (isTokenOutBase && !isTokenInBase) {
    return 'BUY'; // Spending base currency to buy token
  } else if (!isTokenOutBase && isTokenInBase) {
    return 'SELL'; // Selling token for base currency
  } else {
    return 'SWAP'; // Token-to-token or base-to-base
  }
}

// ============================================================================
// Main Processing Functions
// ============================================================================

/**
 * Processing result metadata
 */
export interface ProcessingResult {
  activities: DeFiActivity[];
  metadata: {
    enhancedApiCount: number;
    rpcFallbackCount: number;
    totalCount: number;
  };
}

/**
 * Progressive loading result with progress tracking
 */
export interface ProgressiveLoadingResult {
  activities: DeFiActivity[];
  progress: {
    processedSignatures: number;
    totalSignatures: number;
    foundSwaps: number;
    percentComplete: number;
    hasMore: boolean;
    cursor?: string; // Last signature processed (for continuation)
  };
  metadata: {
    enhancedApiCount: number;
    rpcFallbackCount: number;
    totalCount: number;
  };
}

/**
 * RPC fallback options
 */
interface RpcFallbackOptions {
  specificSignatures?: string[]; // Specific signatures to fetch
  enableGapDetection?: boolean; // Auto-detect missing signatures
}

/**
 * Process all transactions for a wallet using Enhanced API + RPC fallback
 *
 * This is the main processing function that combines multiple data sources:
 * 1. Helius Enhanced Transactions API (fast, but may miss some swaps)
 * 2. RPC fallback for specific signatures or gap detection
 *
 * @param walletAddress - Solana wallet address
 * @param options - RPC fallback options
 * @returns ProcessingResult with activities and metadata
 *
 * @example
 * // Fetch with specific signatures
 * const result = await processAllTransactions(wallet, {
 *   specificSignatures: ['sig1', 'sig2']
 * });
 *
 * // Fetch with gap detection
 * const result = await processAllTransactions(wallet, {
 *   enableGapDetection: true
 * });
 */
export async function processAllTransactions(
  walletAddress: string,
  options: RpcFallbackOptions = {}
): Promise<ProcessingResult> {
  try {
    console.log(
      `[transactions] Starting transaction processing for ${walletAddress}`
    );

    // Step 1: Fetch swap transactions from Helius Enhanced API
    console.log(
      '[transactions] Step 1: Fetching swap transactions from Helius Enhanced API...'
    );
    const enhancedTransactions =
      await fetchAllSwapTransactionsWithRetry(walletAddress);
    console.log(
      `[transactions] Fetched ${enhancedTransactions.length} transactions from Enhanced API`
    );

    // Step 2: RPC fallback (if requested)
    let rpcTransactions: HeliusTransaction[] = [];

    if (options.specificSignatures && options.specificSignatures.length > 0) {
      console.log(
        `[transactions] Step 2: Fetching ${options.specificSignatures.length} specific signatures via RPC fallback...`
      );
      rpcTransactions = await fetchTransactionsBatch(
        options.specificSignatures,
        walletAddress
      );
      console.log(
        `[transactions] Fetched ${rpcTransactions.length} transactions via RPC`
      );
    } else if (options.enableGapDetection) {
      console.log('[transactions] Step 2a: Detecting missing signatures...');
      const enhancedSignatures = enhancedTransactions.map((tx) => tx.signature);
      const missingSignatures = await detectMissingSignatures(
        walletAddress,
        enhancedSignatures
      );
      console.log(
        `[transactions] Detected ${missingSignatures.length} potentially missing signatures`
      );

      if (missingSignatures.length > 0) {
        // Limit to 50 to avoid excessive RPC calls
        const limitedSignatures = missingSignatures.slice(0, 50);
        console.log(
          `[transactions] Step 2b: Fetching ${limitedSignatures.length} signatures via RPC fallback...`
        );

        if (limitedSignatures.length < missingSignatures.length) {
          console.log(
            `[transactions] Limited RPC batch to ${limitedSignatures.length} signatures (${missingSignatures.length} detected)`
          );
        }

        rpcTransactions = await fetchTransactionsBatch(
          limitedSignatures,
          walletAddress
        );
        console.log(
          `[transactions] Fetched ${rpcTransactions.length} transactions via RPC`
        );
      }
    }

    // Merge transactions from both sources
    const allTransactions = mergeTransactions(
      enhancedTransactions,
      rpcTransactions
    );

    // Filter for valid transactions
    const validTransactions = filterValidTransactions(allTransactions);
    console.log(
      `[transactions] Filtered to ${validTransactions.length} valid transactions (${allTransactions.length - validTransactions.length} filtered out)`
    );

    // Step 2: Extract unique token mints
    console.log('[transactions] Step 2: Extracting unique token mints...');
    const uniqueMints = extractUniqueMints(validTransactions);
    const mintArray = Array.from(uniqueMints);
    console.log(`[transactions] Found ${mintArray.length} unique tokens`);

    // Step 3: Fetch token metadata from Helius
    console.log(
      '[transactions] Step 3: Fetching token metadata from Helius...'
    );
    const tokenMetadataList = await getBatchTokenMetadata(mintArray);

    // Create a map for quick lookups
    const tokenMetadataMap = new Map<string, TokenMetadata>();
    for (const metadata of tokenMetadataList) {
      tokenMetadataMap.set(metadata.address, metadata);
    }
    console.log(
      `[transactions] Retrieved metadata for ${tokenMetadataList.length} tokens`
    );

    // Step 4: Process each transaction into DeFiActivity records
    console.log('[transactions] Step 4: Processing transactions...');
    const activities: DeFiActivity[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const tx of validTransactions) {
      try {
        const swapActivities = extractSwapData(
          tx,
          walletAddress,
          tokenMetadataMap
        );

        if (swapActivities.length > 0) {
          activities.push(...swapActivities);
          successCount++;
        } else {
          console.log(
            `[transactions] Failed to extract swap data for ${tx.signature} (type: ${tx.type}, tokenTransfers: ${tx.tokenTransfers?.length || 0}, accountData: ${tx.accountData?.length || 0})`
          );
          failCount++;
        }
      } catch (error) {
        console.error(
          `[transactions] Error processing transaction ${tx.signature}:`,
          error
        );
        failCount++;
      }
    }

    console.log(
      `[transactions] Processed ${validTransactions.length} activities from ${validTransactions.length} transactions (${successCount} succeeded, ${failCount} failed)`
    );

    // Step 5: Reclassify transaction types
    const reclassifiedActivities = reclassifyTransactionTypes(activities);

    // Step 6: Sort by timestamp (newest first)
    console.log('[transactions] Step 6: Sorting by timestamp...');
    reclassifiedActivities.sort((a, b) => b.timestamp - a.timestamp);

    console.log(
      `[transactions] Processing complete: ${reclassifiedActivities.length} activities`
    );

    return {
      activities: reclassifiedActivities,
      metadata: {
        enhancedApiCount: enhancedTransactions.length,
        rpcFallbackCount: rpcTransactions.length,
        totalCount: allTransactions.length,
      },
    };
  } catch (error) {
    console.error('[transactions] Error processing transactions:', error);
    throw error;
  }
}

/**
 * Process transactions using RPC-first approach for complete history
 *
 * This approach fetches ALL transaction signatures first, then parses them.
 * Slower but more complete than Enhanced API approach.
 *
 * @param walletAddress - Solana wallet address
 * @param maxTransactions - Maximum number of transactions to fetch (default: 200)
 * @returns ProcessingResult with activities and metadata
 */
export async function processAllTransactionsRpcFirst(
  walletAddress: string,
  maxTransactions: number = 200
): Promise<ProcessingResult> {
  try {
    console.log(
      `[transactions] Starting RPC-first processing for ${walletAddress} (max: ${maxTransactions})`
    );

    // Step 1: Fetch ALL transaction signatures
    console.log('[transactions] Step 1: Fetching all signatures via RPC...');
    const allSignatures = await fetchAllSignatures(
      walletAddress,
      maxTransactions
    );
    console.log(`[transactions] Found ${allSignatures.length} total signatures`);

    // Step 2: Parse transactions in batches
    console.log(`[transactions] Step 2: Parsing ${allSignatures.length} transactions...`);
    const transactions = await fetchTransactionsBatch(
      allSignatures,
      walletAddress
    );
    console.log(
      `[transactions] Successfully fetched ${transactions.length}/${allSignatures.length} transactions`
    );

    // Filter for valid transactions
    const validTransactions = filterValidTransactions(transactions);
    console.log(
      `[transactions] Filtered to ${validTransactions.length} valid transactions`
    );

    // Step 3: Extract unique token mints
    console.log('[transactions] Step 3: Extracting unique token mints...');
    const uniqueMints = extractUniqueMints(validTransactions);
    const mintArray = Array.from(uniqueMints);
    console.log(`[transactions] Found ${mintArray.length} unique tokens`);

    // Step 4: Fetch token metadata
    console.log('[transactions] Step 4: Fetching token metadata...');
    const tokenMetadataList = await getBatchTokenMetadata(mintArray);
    const tokenMetadataMap = new Map<string, TokenMetadata>();
    for (const metadata of tokenMetadataList) {
      tokenMetadataMap.set(metadata.address, metadata);
    }
    console.log(
      `[transactions] Retrieved metadata for ${tokenMetadataList.length} tokens`
    );

    // Step 5: Process transactions into activities
    console.log('[transactions] Step 5: Processing transactions...');
    const activities: DeFiActivity[] = [];

    for (const tx of validTransactions) {
      try {
        const swapActivities = extractSwapData(
          tx,
          walletAddress,
          tokenMetadataMap
        );
        activities.push(...swapActivities);
      } catch (error) {
        console.error(
          `[transactions] Error processing transaction ${tx.signature}:`,
          error
        );
      }
    }

    // Step 6: Reclassify and sort
    const reclassifiedActivities = reclassifyTransactionTypes(activities);
    reclassifiedActivities.sort((a, b) => b.timestamp - a.timestamp);

    console.log(
      `[transactions] RPC-first processing complete: ${reclassifiedActivities.length} activities`
    );

    return {
      activities: reclassifiedActivities,
      metadata: {
        enhancedApiCount: 0,
        rpcFallbackCount: transactions.length,
        totalCount: transactions.length,
      },
    };
  } catch (error) {
    console.error('[transactions] Error in RPC-first processing:', error);
    throw error;
  }
}

/**
 * Process transactions progressively with cursor-based pagination
 *
 * @param walletAddress - Solana wallet address
 * @param batchSize - Number of signatures to process per batch
 * @param cursor - Cursor for pagination (signature to start after)
 * @returns ProgressiveLoadingResult with activities and progress info
 */
export async function processTransactionsProgressive(
  walletAddress: string,
  batchSize: number = 100,
  cursor?: string
): Promise<ProgressiveLoadingResult> {
  try {
    console.log(
      `[transactions] Starting progressive processing for ${walletAddress} (batch: ${batchSize}, cursor: ${cursor || 'none'})`
    );

    // Step 1: Fetch ALL signatures first (to know total count)
    console.log('[transactions] Step 1: Fetching all signatures...');
    const allSignatures = await fetchAllSignatures(walletAddress, 50000);
    const totalSignatures = allSignatures.length;
    console.log(`[transactions] Found ${totalSignatures} total signatures`);

    // Step 2: Determine which batch to process
    let startIndex = 0;
    if (cursor) {
      startIndex = allSignatures.findIndex((sig) => sig === cursor) + 1;
      if (startIndex === 0) {
        // Cursor not found, start from beginning
        console.warn('[transactions] Cursor not found, starting from beginning');
      }
    }

    const endIndex = Math.min(startIndex + batchSize, totalSignatures);
    const batchSignatures = allSignatures.slice(startIndex, endIndex);
    console.log(
      `[transactions] Processing batch: signatures ${startIndex}-${endIndex} of ${totalSignatures}`
    );

    // Step 3: Parse this batch
    console.log(`[transactions] Step 3: Parsing ${batchSignatures.length} signatures...`);
    const rpcTransactions = await fetchTransactionsBatch(
      batchSignatures,
      walletAddress
    );
    console.log(`[transactions] Fetched ${rpcTransactions.length} transactions`);

    // Step 4: Filter valid transactions
    const validTransactions = filterValidTransactions(rpcTransactions);
    console.log(
      `[transactions] Filtered to ${validTransactions.length} valid transactions`
    );

    // Step 5: Extract mints and fetch metadata
    const uniqueMints = extractUniqueMints(validTransactions);
    const mintArray = Array.from(uniqueMints);
    console.log(`[transactions] Found ${mintArray.length} unique tokens`);

    const tokenMetadataList = await getBatchTokenMetadata(mintArray);
    const tokenMetadataMap = new Map<string, TokenMetadata>();
    for (const metadata of tokenMetadataList) {
      tokenMetadataMap.set(metadata.address, metadata);
    }

    // Step 6: Process transactions
    const activities: DeFiActivity[] = [];
    for (const tx of validTransactions) {
      try {
        const swapActivities = extractSwapData(
          tx,
          walletAddress,
          tokenMetadataMap
        );
        activities.push(...swapActivities);
      } catch (error) {
        console.error(
          `[transactions] Error processing transaction ${tx.signature}:`,
          error
        );
      }
    }

    // Step 7: Reclassify and sort
    const reclassifiedActivities = reclassifyTransactionTypes(activities);
    reclassifiedActivities.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate progress
    const percentComplete = Math.round((endIndex / totalSignatures) * 100);
    const hasMore = endIndex < totalSignatures;
    const nextCursor = hasMore ? allSignatures[endIndex - 1] : undefined;

    console.log(
      `[transactions] Progressive batch complete: ${reclassifiedActivities.length} activities (${percentComplete}% complete)`
    );

    return {
      activities: reclassifiedActivities,
      progress: {
        processedSignatures: endIndex,
        totalSignatures,
        foundSwaps: reclassifiedActivities.length,
        percentComplete,
        hasMore,
        cursor: nextCursor,
      },
      metadata: {
        enhancedApiCount: 0,
        rpcFallbackCount: rpcTransactions.length,
        totalCount: rpcTransactions.length,
      },
    };
  } catch (error) {
    console.error('[transactions] Error in progressive processing:', error);
    throw error;
  }
}

// ============================================================================
// Progress Reporting (for CLI/debugging)
// ============================================================================

/**
 * Process all transactions with progress reporting
 *
 * @param walletAddress - Solana wallet address
 * @param progressCallback - Callback function for progress updates
 * @returns Array of DeFiActivity objects
 */
export async function processAllTransactionsWithProgress(
  walletAddress: string,
  progressCallback?: (message: string, current: number, total: number) => void
): Promise<DeFiActivity[]> {
  const reportProgress = (message: string, current: number, total: number) => {
    console.log(`[transactions] Progress: ${message} (${current}/${total})`);
    if (progressCallback) {
      progressCallback(message, current, total);
    }
  };

  try {
    // Step 1: Fetch transactions
    reportProgress('Fetching transactions from Helius', 1, 6);
    const enhancedTransactions =
      await fetchAllSwapTransactionsWithRetry(walletAddress);

    // Step 2: Extract mints
    reportProgress('Extracting token information', 2, 6);
    const uniqueMints = extractUniqueMints(enhancedTransactions);
    const mintArray = Array.from(uniqueMints);

    // Step 3: Fetch metadata
    reportProgress('Fetching token metadata', 3, 6);
    const tokenMetadataList = await getBatchTokenMetadata(mintArray);
    const tokenMetadataMap = new Map<string, TokenMetadata>();
    for (const metadata of tokenMetadataList) {
      tokenMetadataMap.set(metadata.address, metadata);
    }

    // Step 4: Process transactions
    reportProgress('Processing transactions', 4, 6);
    const activities: DeFiActivity[] = [];

    for (let i = 0; i < enhancedTransactions.length; i++) {
      const tx = enhancedTransactions[i];
      try {
        const swapActivities = extractSwapData(
          tx,
          walletAddress,
          tokenMetadataMap
        );
        activities.push(...swapActivities);
      } catch (error) {
        console.error(
          `[transactions] Error processing transaction ${tx.signature}:`,
          error
        );
      }

      if (i % 10 === 0) {
        reportProgress('Processing transactions', 4, 6);
      }
    }

    // Step 5: Reclassify
    reportProgress('Reclassifying transaction types', 5, 6);
    const reclassifiedActivities = reclassifyTransactionTypes(activities);

    // Step 6: Sort
    reportProgress('Finalizing', 6, 6);
    reclassifiedActivities.sort((a, b) => b.timestamp - a.timestamp);

    return reclassifiedActivities;
  } catch (error) {
    console.error('[transactions] Error processing transactions:', error);
    throw error;
  }
}

// ============================================================================
// Phase 3: Hybrid Mode (Enhanced API + Recent RPC)
// ============================================================================

/**
 * Process transactions using hybrid mode for optimal speed and coverage
 *
 * **Hybrid Strategy:**
 * 1. Enhanced API (fast) → 90-95% coverage in 5-10s
 * 2. RPC for last 7 days → +3-5% coverage in +5s
 * 3. Parse only gaps → +0-2% coverage in +2s
 * **Total: ~15s for 98%+ coverage**
 *
 * This is the recommended mode for most use cases as it balances speed and completeness.
 *
 * @param walletAddress - Solana wallet address
 * @returns ProcessingResult with activities and metadata
 *
 * @example
 * const result = await processAllTransactionsHybrid('wallet123');
 * // Returns 98%+ of swaps in ~15 seconds vs 2-5 minutes for full scan
 */
export async function processAllTransactionsHybrid(
  walletAddress: string
): Promise<ProcessingResult> {
  try {
    console.log(
      `[transactions] 🚀 Starting HYBRID mode processing for ${walletAddress}`
    );
    console.log('[transactions] Strategy: Enhanced API + Recent RPC (7 days)');

    // Step 1: Enhanced API (fast, 90-95% coverage)
    console.log(
      '[transactions] Step 1: Fetching from Enhanced API (fast path)...'
    );
    const startEnhanced = Date.now();
    const enhancedTransactions =
      await fetchAllSwapTransactionsWithRetry(walletAddress);
    const enhancedTime = Date.now() - startEnhanced;
    console.log(
      `[transactions] ✅ Enhanced API: ${enhancedTransactions.length} swaps in ${enhancedTime}ms`
    );

    // Step 2: RPC for last 7 days (catch recent bot swaps)
    console.log(
      '[transactions] Step 2: Fetching recent signatures (last 7 days) via RPC...'
    );
    const startRpc = Date.now();

    // Calculate timestamp for 7 days ago
    const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;

    const recentSignatures = await fetchSignaturesInRange(walletAddress, {
      startTime: sevenDaysAgo,
      maxSignatures: 1000, // Limit to avoid excessive processing
    });
    console.log(
      `[transactions] Found ${recentSignatures.length} signatures in last 7 days`
    );

    // Step 3: Filter out signatures already in Enhanced API
    const enhancedSignatures = new Set(
      enhancedTransactions.map((tx) => tx.signature)
    );
    const missingSignatures = recentSignatures.filter(
      (sig) => !enhancedSignatures.has(sig)
    );

    console.log(
      `[transactions] Found ${missingSignatures.length} potentially missing signatures (${recentSignatures.length} total - ${enhancedSignatures.size} in Enhanced API)`
    );

    // Step 4: Parse only missing signatures
    let rpcTransactions: HeliusTransaction[] = [];
    if (missingSignatures.length > 0) {
      console.log(
        `[transactions] Step 3: Parsing ${missingSignatures.length} missing signatures...`
      );
      rpcTransactions = await fetchTransactionsBatch(
        missingSignatures,
        walletAddress
      );
      const rpcTime = Date.now() - startRpc;
      console.log(
        `[transactions] ✅ RPC fallback: ${rpcTransactions.length} swaps in ${rpcTime}ms`
      );
    } else {
      console.log('[transactions] ✅ No missing signatures, skipping RPC parsing');
    }

    // Step 5: Merge results
    const allTransactions = mergeTransactions(
      enhancedTransactions,
      rpcTransactions
    );
    const validTransactions = filterValidTransactions(allTransactions);

    console.log(
      `[transactions] Total: ${validTransactions.length} transactions (${enhancedTransactions.length} Enhanced + ${rpcTransactions.length} RPC)`
    );

    // Step 6-9: Standard processing pipeline
    console.log('[transactions] Step 4: Extracting token mints...');
    const uniqueMints = extractUniqueMints(validTransactions);
    const mintArray = Array.from(uniqueMints);
    console.log(`[transactions] Found ${mintArray.length} unique tokens`);

    console.log('[transactions] Step 5: Fetching token metadata...');
    const tokenMetadataList = await getBatchTokenMetadata(mintArray);
    const tokenMetadataMap = new Map<string, TokenMetadata>();
    for (const metadata of tokenMetadataList) {
      tokenMetadataMap.set(metadata.address, metadata);
    }

    console.log('[transactions] Step 6: Processing transactions...');
    const activities: DeFiActivity[] = [];
    for (const tx of validTransactions) {
      try {
        const swapActivities = extractSwapData(
          tx,
          walletAddress,
          tokenMetadataMap
        );
        activities.push(...swapActivities);
      } catch (error) {
        console.error(
          `[transactions] Error processing transaction ${tx.signature}:`,
          error
        );
      }
    }

    console.log('[transactions] Step 7: Reclassifying and sorting...');
    const reclassifiedActivities = reclassifyTransactionTypes(activities);
    reclassifiedActivities.sort((a, b) => b.timestamp - a.timestamp);

    const totalTime = Date.now() - startEnhanced;
    console.log(
      `[transactions] 🎉 HYBRID mode complete: ${reclassifiedActivities.length} activities in ${totalTime}ms (~${Math.round(totalTime / 1000)}s)`
    );
    console.log(
      `[transactions] Coverage: ${enhancedTransactions.length} from Enhanced API + ${rpcTransactions.length} from RPC = ${reclassifiedActivities.length} total swaps`
    );

    return {
      activities: reclassifiedActivities,
      metadata: {
        enhancedApiCount: enhancedTransactions.length,
        rpcFallbackCount: rpcTransactions.length,
        totalCount: allTransactions.length,
      },
    };
  } catch (error) {
    console.error('[transactions] Error in hybrid processing:', error);
    throw error;
  }
}
