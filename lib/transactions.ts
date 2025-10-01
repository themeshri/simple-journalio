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
} from './rpc-parser';

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
  // Create a map of signatures to avoid duplicates
  const signatureMap = new Map<string, HeliusTransaction>();

  // Add Enhanced API transactions first (they have priority)
  for (const tx of enhancedTransactions) {
    signatureMap.set(tx.signature, tx);
  }

  // Add RPC transactions (only if not already present)
  for (const tx of rpcTransactions) {
    if (!signatureMap.has(tx.signature)) {
      signatureMap.set(tx.signature, tx);
    }
  }

  // Convert map back to array
  return Array.from(signatureMap.values());
}

// ============================================================================
// Swap Data Extraction
// ============================================================================

/**
 * Extracted swap data from a transaction
 */
interface ExtractedSwapData {
  fromMint: string;
  fromAmount: number;
  fromDecimals: number;
  toMint: string;
  toAmount: number;
  toDecimals: number;
  /**
   * Whether amounts need decimal adjustment
   * true = amounts are raw and need to be divided by 10^decimals
   * false = amounts are already decimal-adjusted
   */
  needsDecimalAdjustment?: boolean;
}

/**
 * Extract swap data from accountData.tokenBalanceChanges (more reliable)
 *
 * This method is preferred over tokenTransfers because:
 * - It shows the actual balance changes for the wallet
 * - It's more accurate for complex transactions
 * - It handles wrapped tokens correctly
 *
 * @param tx - Helius transaction
 * @param walletAddress - Wallet address to filter balance changes
 * @returns ExtractedSwapData or null if extraction fails
 */
export function extractSwapFromAccountData(
  tx: HeliusTransaction,
  walletAddress: string
): ExtractedSwapData | null {
  // Find the wallet's account data
  const walletAccount = tx.accountData?.find(
    (acc) => acc.account.toLowerCase() === walletAddress.toLowerCase()
  );

  if (!walletAccount?.tokenBalanceChanges || walletAccount.tokenBalanceChanges.length === 0) {
    return null;
  }

  const balanceChanges = walletAccount.tokenBalanceChanges;

  // Separate negative (spent/sold) and positive (received/bought) changes
  const negativeChanges = balanceChanges.filter(
    (bc) => parseFloat(bc.rawTokenAmount.tokenAmount) < 0
  );

  const positiveChanges = balanceChanges.filter(
    (bc) => parseFloat(bc.rawTokenAmount.tokenAmount) > 0
  );

  // A swap should have at least one negative and one positive change
  if (negativeChanges.length === 0 || positiveChanges.length === 0) {
    return null;
  }

  // Take the first negative (FROM token) and first positive (TO token)
  const fromChange = negativeChanges[0];
  const toChange = positiveChanges[0];

  return {
    fromMint: fromChange.mint,
    fromAmount: Math.abs(parseFloat(fromChange.rawTokenAmount.tokenAmount)),
    fromDecimals: fromChange.rawTokenAmount.decimals,
    toMint: toChange.mint,
    toAmount: parseFloat(toChange.rawTokenAmount.tokenAmount),
    toDecimals: toChange.rawTokenAmount.decimals,
    needsDecimalAdjustment: false, // Helius accountData amounts are already decimal-adjusted
  };
}

/**
 * Fallback: Extract swap data from tokenTransfers
 *
 * Strategy for complex swaps with multiple intermediate tokens:
 * 1. Calculate net balance change per token (incoming - outgoing)
 * 2. Find the token with largest positive net change (what user bought)
 * 3. Find the token with largest negative net change (what user sold)
 *
 * @param tx - Helius transaction
 * @param walletAddress - Wallet address
 * @returns ExtractedSwapData or null
 */
export function extractSwapFromTokenTransfers(
  tx: HeliusTransaction,
  walletAddress: string
): ExtractedSwapData | null {
  if (!tx.tokenTransfers || tx.tokenTransfers.length < 2) {
    return null;
  }

  // Calculate net balance change per token
  const netChanges = new Map<string, number>();

  for (const transfer of tx.tokenTransfers) {
    const isOutgoing = transfer.fromUserAccount.toLowerCase() === walletAddress.toLowerCase();
    const isIncoming = transfer.toUserAccount.toLowerCase() === walletAddress.toLowerCase();

    if (isOutgoing) {
      const current = netChanges.get(transfer.mint) || 0;
      netChanges.set(transfer.mint, current - transfer.tokenAmount);
    }

    if (isIncoming) {
      const current = netChanges.get(transfer.mint) || 0;
      netChanges.set(transfer.mint, current + transfer.tokenAmount);
    }
  }

  // Find token with largest negative change (sold)
  let fromMint = '';
  let fromAmount = 0;
  let toMint = '';
  let toAmount = 0;

  for (const [mint, netChange] of netChanges.entries()) {
    if (netChange < 0 && Math.abs(netChange) > Math.abs(fromAmount)) {
      fromMint = mint;
      fromAmount = Math.abs(netChange);
    }
    if (netChange > 0 && netChange > toAmount) {
      toMint = mint;
      toAmount = netChange;
    }
  }

  if (!fromMint || !toMint || fromAmount === 0 || toAmount === 0) {
    return null;
  }

  // Note: Helius Enhanced API tokenTransfers already have decimal-adjusted amounts
  return {
    fromMint,
    fromAmount,
    fromDecimals: 0, // Will be resolved from metadata
    toMint,
    toAmount,
    toDecimals: 0, // Will be resolved from metadata
    needsDecimalAdjustment: false, // Helius Enhanced API amounts are already decimal-adjusted
  };
}

// ============================================================================
// Swap Classification
// ============================================================================

/**
 * Classify swap transaction as BUY, SELL, or SWAP (token-to-token)
 *
 * Classification logic:
 * - Base → Token = BUY
 * - Token → Base = SELL
 * - Token → Token = SWAP (needs splitting into SELL + BUY)
 * - Base → Base (e.g., SOL → USDC) = SELL
 *
 * @param fromMint - FROM token mint address
 * @param toMint - TO token mint address
 * @param fromSymbol - FROM token symbol
 * @param toSymbol - TO token symbol
 * @returns SwapClassification with type and traded coin info
 */
export function classifySwap(
  fromMint: string,
  toMint: string,
  fromSymbol: string,
  toSymbol: string
): SwapClassification {
  const fromIsBase = isBaseCurrency(fromSymbol, fromMint);
  const toIsBase = isBaseCurrency(toSymbol, toMint);

  // Base → Token = BUY
  if (fromIsBase && !toIsBase) {
    return {
      type: 'BUY',
      tradedCoin: toSymbol,
      tradedCoinMint: toMint,
      isBuy: true,
      isSell: false,
    };
  }

  // Token → Base = SELL
  if (!fromIsBase && toIsBase) {
    return {
      type: 'SELL',
      tradedCoin: fromSymbol,
      tradedCoinMint: fromMint,
      isBuy: false,
      isSell: true,
    };
  }

  // Token → Token = SWAP (needs splitting)
  if (!fromIsBase && !toIsBase) {
    return {
      type: 'SWAP',
      tradedCoin: '', // Will be set for each split record
      tradedCoinMint: '', // Will be set for each split record
      isBuy: false,
      isSell: false,
      needsSplitting: true,
      sellRecord: {
        type: 'SWAP',
        tradedCoin: fromSymbol,
        tradedCoinMint: fromMint,
        isBuy: false,
        isSell: true,
      },
      buyRecord: {
        type: 'SWAP',
        tradedCoin: toSymbol,
        tradedCoinMint: toMint,
        isBuy: true,
        isSell: false,
      },
    };
  }

  // Base → Base (e.g., SOL → USDC) = treat as SELL of FROM token
  return {
    type: 'SELL',
    tradedCoin: fromSymbol,
    tradedCoinMint: fromMint,
    isBuy: false,
    isSell: true,
  };
}

// ============================================================================
// Token-to-Token Swap Splitting
// ============================================================================

/**
 * Split a token-to-token swap into two DeFiActivity records:
 * 1. SELL record for the FROM token
 * 2. BUY record for the TO token
 *
 * Important: Both records share the same signature, but only the SELL record includes the fee
 *
 * @param tx - Helius transaction
 * @param swapData - Extracted swap data
 * @param fromMetadata - FROM token metadata
 * @param toMetadata - TO token metadata
 * @param fromPrice - FROM token price
 * @param toPrice - TO token price
 * @returns Array of two DeFiActivity records [SELL, BUY]
 */
export function splitTokenToTokenSwap(
  tx: HeliusTransaction,
  swapData: ExtractedSwapData,
  fromMetadata: TokenMetadata,
  toMetadata: TokenMetadata
): DeFiActivity[] {
  const activities: DeFiActivity[] = [];

  // Apply decimal adjustment only if needed (for tokenTransfers data)
  const fromAmount = swapData.needsDecimalAdjustment
    ? formatTokenAmount(swapData.fromAmount, swapData.fromDecimals)
    : swapData.fromAmount;
  const toAmount = swapData.needsDecimalAdjustment
    ? formatTokenAmount(swapData.toAmount, swapData.toDecimals)
    : swapData.toAmount;

  // SELL record for FROM token
  activities.push({
    signature: tx.signature,
    timestamp: tx.timestamp,
    type: 'SWAP',
    status: 'Success',
    fee: tx.fee || 0,
    fromSymbol: fromMetadata.symbol,
    fromAmount,
    toSymbol: toMetadata.symbol,
    toAmount,
    tradedCoin: fromMetadata.symbol,
    tradedCoinMint: fromMetadata.address,
    transactionType: 'sell',
    isBuy: false,
    isSell: true,
    source: (tx.source as 'JUPITER' | 'RAYDIUM' | 'ORCA' | 'UNKNOWN') || 'UNKNOWN',
  });

  // BUY record for TO token
  activities.push({
    signature: tx.signature, // SAME signature!
    timestamp: tx.timestamp,
    type: 'SWAP',
    status: 'Success',
    fee: 0, // Don't double-count fee
    fromSymbol: fromMetadata.symbol,
    fromAmount,
    toSymbol: toMetadata.symbol,
    toAmount,
    tradedCoin: toMetadata.symbol,
    tradedCoinMint: toMetadata.address,
    transactionType: 'first buy', // Will be reclassified later based on history
    isBuy: true,
    isSell: false,
    source: (tx.source as 'JUPITER' | 'RAYDIUM' | 'ORCA' | 'UNKNOWN') || 'UNKNOWN',
  });

  return activities;
}

// ============================================================================
// Single Transaction Processing
// ============================================================================

/**
 * Process a single Helius transaction into DeFiActivity record(s)
 *
 * @param tx - Helius transaction
 * @param walletAddress - Wallet address
 * @param tokenMetadataMap - Map of token mints to metadata
 * @param priceMap - Map of token mints to prices
 * @returns Array of DeFiActivity records (1 for simple swap, 2 for token-to-token)
 */
export function processHeliusTransaction(
  tx: HeliusTransaction,
  walletAddress: string,
  tokenMetadataMap: Map<string, TokenMetadata>
): DeFiActivity[] {
  // Extract swap data from accountData (preferred method)
  let swapData = extractSwapFromAccountData(tx, walletAddress);

  // Fallback to tokenTransfers if accountData extraction fails
  if (!swapData) {
    swapData = extractSwapFromTokenTransfers(tx, walletAddress);
  }

  if (!swapData) {
    console.warn(`[transactions] Failed to extract swap data for ${tx.signature}`);
    return [];
  }

  // Get token metadata
  const fromMetadata = tokenMetadataMap.get(swapData.fromMint);
  const toMetadata = tokenMetadataMap.get(swapData.toMint);

  if (!fromMetadata || !toMetadata) {
    console.warn(
      `[transactions] Missing metadata for ${tx.signature}: from=${!fromMetadata}, to=${!toMetadata}`
    );
    return [];
  }

  // If decimals weren't in swap data, use metadata decimals
  if (swapData.fromDecimals === 0) {
    swapData.fromDecimals = fromMetadata.decimals;
  }
  if (swapData.toDecimals === 0) {
    swapData.toDecimals = toMetadata.decimals;
  }

  // Classify the swap
  const classification = classifySwap(
    swapData.fromMint,
    swapData.toMint,
    fromMetadata.symbol,
    toMetadata.symbol
  );

  // Handle token-to-token swap splitting
  if (classification.needsSplitting) {
    return splitTokenToTokenSwap(
      tx,
      swapData,
      fromMetadata,
      toMetadata
    );
  }

  // Simple swap (BUY or SELL)
  // Apply decimal adjustment only if needed (for tokenTransfers data)
  const fromAmount = swapData.needsDecimalAdjustment
    ? formatTokenAmount(swapData.fromAmount, swapData.fromDecimals)
    : swapData.fromAmount;
  const toAmount = swapData.needsDecimalAdjustment
    ? formatTokenAmount(swapData.toAmount, swapData.toDecimals)
    : swapData.toAmount;

  const activity: DeFiActivity = {
    signature: tx.signature,
    timestamp: tx.timestamp,
    type: 'SWAP',
    status: 'Success',
    fee: tx.fee || 0,
    fromSymbol: fromMetadata.symbol,
    fromAmount,
    toSymbol: toMetadata.symbol,
    toAmount,
    tradedCoin: classification.tradedCoin,
    tradedCoinMint: classification.tradedCoinMint,
    transactionType: classification.isBuy ? 'first buy' : 'sell', // Will be reclassified
    isBuy: classification.isBuy,
    isSell: classification.isSell,
    source: (tx.source as 'JUPITER' | 'RAYDIUM' | 'ORCA' | 'UNKNOWN') || 'UNKNOWN',
  };

  return [activity];
}

// ============================================================================
// Transaction Type Reclassification
// ============================================================================

/**
 * Reclassify transaction types based on trading history
 * - 'first buy': First purchase of a token
 * - 'buy more': Additional purchase of existing token
 * - 'sell': Sell transaction
 * - 'sell all': Complete position exit (optional detection)
 *
 * @param activities - Array of DeFiActivity records sorted by timestamp (oldest first)
 * @returns Updated activities with correct transactionType
 */
export function reclassifyTransactionTypes(activities: DeFiActivity[]): DeFiActivity[] {
  // Track seen tokens to differentiate 'first buy' vs 'buy more'
  const seenTokens = new Set<string>();

  // Process in chronological order (oldest first)
  const sortedActivities = [...activities].sort((a, b) => a.timestamp - b.timestamp);

  for (const activity of sortedActivities) {
    if (activity.isBuy) {
      // Check if this is the first time buying this token
      if (seenTokens.has(activity.tradedCoinMint)) {
        activity.transactionType = 'buy more';
      } else {
        activity.transactionType = 'first buy';
        seenTokens.add(activity.tradedCoinMint);
      }
    } else if (activity.isSell) {
      activity.transactionType = 'sell';
      // Could add 'sell all' detection here if needed
    }
  }

  return activities;
}

// ============================================================================
// Complete Processing Pipeline
// ============================================================================

/**
 * Process all transactions for a wallet address
 *
 * This is the main entry point for the complete processing pipeline:
 * 1. Fetch all swap transactions from Helius
 * 2. Extract unique token mints
 * 3. Fetch token metadata from Jupiter Token List
 * 4. Fetch token prices from Jupiter Price API
 * 5. Process each transaction into DeFiActivity records
 * 6. Handle token-to-token swap splitting
 * 7. Reclassify transaction types based on history
 * 8. Sort by timestamp (newest first)
 *
 * @param walletAddress - Solana wallet address
 * @returns Array of processed DeFiActivity records
 *
 * @example
 * const activities = await processAllTransactions('4NuB8ZFSjEVWE1nJTJ5RBCRmw9VHUE2g8Q5vFza4L8wm');
 * console.log(`Processed ${activities.length} activities`);
 */
/**
 * RPC fallback configuration options
 */
interface RpcFallbackOptions {
  specificSignatures?: string[];  // User-provided signatures to fetch via RPC
  enableGapDetection?: boolean;   // Enable automatic gap detection (future)
}

/**
 * Transaction processing result with metadata
 */
interface ProcessingResult {
  activities: DeFiActivity[];
  metadata: {
    enhancedApiCount: number;
    rpcFallbackCount: number;
    totalCount: number;
  };
}

export async function processAllTransactions(
  walletAddress: string,
  options?: RpcFallbackOptions
): Promise<ProcessingResult> {
  console.log(`[transactions] Starting transaction processing for ${walletAddress}`);

  // Step 1: Fetch all swap transactions from Enhanced API
  console.log('[transactions] Step 1: Fetching swap transactions from Helius Enhanced API...');
  const enhancedTransactions = await fetchAllSwapTransactionsWithRetry(walletAddress);
  console.log(`[transactions] Fetched ${enhancedTransactions.length} transactions from Enhanced API`);

  // Step 2: Fetch additional transactions via RPC if requested
  let rpcTransactions: HeliusTransaction[] = [];
  if (options?.specificSignatures && options.specificSignatures.length > 0) {
    console.log(`[transactions] Step 2: Fetching ${options.specificSignatures.length} specific signatures via RPC fallback...`);
    rpcTransactions = await fetchTransactionsBatch(options.specificSignatures, walletAddress);
    console.log(`[transactions] Fetched ${rpcTransactions.length} transactions via RPC`);
  }

  // Step 3: Merge transactions (avoiding duplicates)
  const mergedTransactions = mergeTransactions(enhancedTransactions, rpcTransactions);
  const enhancedCount = enhancedTransactions.length;
  const rpcCount = rpcTransactions.length;
  const totalCount = mergedTransactions.length;

  console.log(`[transactions] Merged transactions: ${totalCount} total (${enhancedCount} Enhanced API + ${rpcCount} RPC, ${enhancedCount + rpcCount - totalCount} duplicates removed)`);

  if (mergedTransactions.length === 0) {
    console.log('[transactions] No swap transactions found');
    return {
      activities: [],
      metadata: {
        enhancedApiCount: 0,
        rpcFallbackCount: 0,
        totalCount: 0,
      },
    };
  }

  // Filter out invalid transactions
  const validTransactions = filterValidTransactions(mergedTransactions);
  console.log(
    `[transactions] Filtered to ${validTransactions.length} valid transactions`
  );

  // Step 2: Extract unique token mints
  console.log('[transactions] Step 2: Extracting unique token mints...');
  const uniqueMints = extractUniqueMints(validTransactions);
  console.log(`[transactions] Found ${uniqueMints.size} unique tokens`);

  // Step 3: Fetch metadata for all tokens
  console.log('[transactions] Step 3: Fetching token metadata from Helius...');
  const tokenMetadataMap = await getBatchTokenMetadata(Array.from(uniqueMints));
  console.log(`[transactions] Retrieved metadata for ${tokenMetadataMap.size} tokens`);

  // Step 4: Process each transaction (no price fetching)
  console.log('[transactions] Step 4: Processing transactions...');
  const activities: DeFiActivity[] = [];

  for (const tx of validTransactions) {
    const processedActivities = processHeliusTransaction(
      tx,
      walletAddress,
      tokenMetadataMap
    );

    activities.push(...processedActivities);
  }

  console.log(
    `[transactions] Processed ${activities.length} activities from ${validTransactions.length} transactions`
  );

  // Step 5: Reclassify transaction types based on history
  console.log('[transactions] Step 5: Reclassifying transaction types...');
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
      enhancedApiCount: enhancedCount,
      rpcFallbackCount: rpcCount,
      totalCount: totalCount,
    },
  };
}

/**
 * Process transactions with error handling and progress reporting
 *
 * @param walletAddress - Solana wallet address
 * @param onProgress - Optional callback for progress updates
 * @returns Array of processed DeFiActivity records
 */
export async function processAllTransactionsWithProgress(
  walletAddress: string,
  onProgress?: (step: string, current: number, total: number) => void
): Promise<DeFiActivity[]> {
  try {
    const reportProgress = (step: string, current: number, total: number) => {
      console.log(`[transactions] ${step}: ${current}/${total}`);
      if (onProgress) {
        onProgress(step, current, total);
      }
    };

    reportProgress('Initializing', 0, 6);

    // Step 1: Fetch transactions
    reportProgress('Fetching transactions', 1, 6);
    const rawTransactions = await fetchAllSwapTransactionsWithRetry(walletAddress);

    if (rawTransactions.length === 0) {
      return [];
    }

    const validTransactions = filterValidTransactions(rawTransactions);

    // Step 2: Extract mints
    reportProgress('Extracting token mints', 2, 6);
    const uniqueMints = extractUniqueMints(validTransactions);

    // Step 3: Fetch metadata
    reportProgress('Fetching token metadata', 3, 6);
    const tokenMetadataMap = await getBatchTokenMetadata(Array.from(uniqueMints));

    // Step 4: Process transactions
    reportProgress('Processing transactions', 4, 6);
    const activities: DeFiActivity[] = [];

    for (let i = 0; i < validTransactions.length; i++) {
      const tx = validTransactions[i];
      const processedActivities = processHeliusTransaction(
        tx,
        walletAddress,
        tokenMetadataMap
      );
      activities.push(...processedActivities);

      // Report progress every 10 transactions
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
