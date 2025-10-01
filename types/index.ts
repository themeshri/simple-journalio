/**
 * Type definitions for Solana Wallet Transaction Viewer
 * Comprehensive TypeScript interfaces for DeFi transaction tracking and analysis
 */

// ============================================================================
// Core Transaction Types
// ============================================================================

/**
 * Transaction type classification
 */
export type TransactionType = 'sell' | 'sell all' | 'first buy' | 'buy more';

/**
 * Transaction status
 */
export type TransactionStatus = 'Success' | 'Failed' | 'Pending';

/**
 * Price confidence level based on data source quality
 */
export type PriceConfidence = 'high' | 'medium' | 'low' | 'none';

/**
 * Price data source
 */
export type PriceSource = 'jupiter' | 'birdeye' | 'helius' | 'fallback' | 'hardcoded';

/**
 * DEX/Source platform for the swap
 */
export type SwapSource =
  | 'JUPITER'
  | 'RAYDIUM'
  | 'ORCA'
  | 'SERUM'
  | 'SABER'
  | 'UNKNOWN';

/**
 * Trade cycle status
 */
export type TradeCycleStatus = 'Active' | 'Completed';

// ============================================================================
// Core DeFi Activity Interface
// ============================================================================

/**
 * DeFiActivity - Core transaction interface representing a single swap/trade activity
 *
 * This is the primary data structure for representing processed Solana swap transactions.
 * Each activity represents either a buy, sell, or one side of a token-to-token swap.
 *
 * @example
 * // Buy transaction (SOL -> TOKEN)
 * {
 *   signature: "5xY7...",
 *   timestamp: 1704067200,
 *   type: "SWAP",
 *   status: "Success",
 *   fee: 5000,
 *   fromSymbol: "SOL",
 *   toSymbol: "BONK",
 *   fromAmount: 1.5,
 *   toAmount: 1000000,
 *   fromValueUSD: 150,
 *   toValueUSD: 150,
 *   tradedCoin: "BONK",
 *   tradedCoinMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
 *   transactionType: "first buy",
 *   isBuy: true,
 *   isSell: false,
 *   priceConfidence: "high",
 *   priceSource: "jupiter",
 *   source: "JUPITER"
 * }
 */
export interface DeFiActivity {
  /**
   * Transaction signature (unique identifier on Solana blockchain)
   * Can be used to construct Solscan/Explorer links
   */
  signature: string;

  /**
   * Unix timestamp (seconds since epoch)
   * When the transaction was confirmed on-chain
   */
  timestamp: number;

  /**
   * Transaction type from Helius API
   * Typically "SWAP" for DEX transactions
   */
  type: string;

  /**
   * Transaction execution status
   */
  status: TransactionStatus;

  /**
   * Transaction fee in lamports (1 SOL = 1,000,000,000 lamports)
   * For token-to-token swaps, only count fee once
   */
  fee: number;

  /**
   * Symbol of token being sent/sold
   * e.g., "SOL", "USDC", "BONK"
   */
  fromSymbol: string;

  /**
   * Symbol of token being received/bought
   * e.g., "SOL", "USDC", "BONK"
   */
  toSymbol: string;

  /**
   * Amount of fromSymbol token (decimal-adjusted)
   * Already divided by token decimals
   */
  fromAmount: number;

  /**
   * Amount of toSymbol token (decimal-adjusted)
   * Already divided by token decimals
   */
  toAmount: number;

  /**
   * USD value of fromAmount at time of transaction
   * Used for P/L calculations (OPTIONAL - may be removed)
   */
  fromValueUSD?: number;

  /**
   * USD value of toAmount at time of transaction
   * Used for P/L calculations (OPTIONAL - may be removed)
   */
  toValueUSD?: number;

  /**
   * The actual token being traded (not base currency)
   * For BUY: same as toSymbol
   * For SELL: same as fromSymbol
   */
  tradedCoin: string;

  /**
   * Mint address of the traded token
   * Used for grouping trades by token
   */
  tradedCoinMint: string;

  /**
   * Classified transaction type for trade tracking
   * - 'first buy': Initial purchase of a token
   * - 'buy more': Additional purchase of existing position
   * - 'sell': Partial or full sell
   * - 'sell all': Complete position exit (optional)
   */
  transactionType: TransactionType;

  /**
   * Flag indicating if this is a buy transaction
   * true when base currency -> token
   */
  isBuy: boolean;

  /**
   * Flag indicating if this is a sell transaction
   * true when token -> base currency
   */
  isSell: boolean;

  /**
   * Confidence level of price data
   * Affects reliability of P/L calculations
   */
  priceConfidence?: PriceConfidence;

  /**
   * Source of price data
   */
  priceSource?: PriceSource;

  /**
   * DEX/Platform that executed the swap
   * e.g., "JUPITER", "RAYDIUM", "ORCA"
   */
  source?: SwapSource;
}

// ============================================================================
// Trade Grouping & P/L Tracking
// ============================================================================

/**
 * TradeGroup - Represents a complete trade cycle for a specific token
 *
 * Tracks all buys and sells for a single token, calculates running balance,
 * and determines when a trade cycle is complete (balance returns to 0).
 *
 * @example
 * {
 *   tokenSymbol: "BONK",
 *   tokenMint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
 *   cycleNumber: 1,
 *   buys: [
 *     { signature: "...", timestamp: 1704067200, amount: 1000000, valueUSD: 150 }
 *   ],
 *   sells: [
 *     { signature: "...", timestamp: 1704153600, amount: 1000000, valueUSD: 200 }
 *   ],
 *   buyCount: 1,
 *   sellCount: 1,
 *   totalBuyAmount: 1000000,
 *   totalSellAmount: 1000000,
 *   totalBuyValue: 150,
 *   totalSellValue: 200,
 *   averageBuyPrice: 0.00015,
 *   averageSellPrice: 0.0002,
 *   currentBalance: 0,
 *   finalBalance: 0,
 *   profitLoss: 50,
 *   profitLossPercentage: 33.33,
 *   startTimestamp: 1704067200,
 *   endTimestamp: 1704153600,
 *   duration: 86400,
 *   status: "Completed"
 * }
 */
export interface TradeGroup {
  /**
   * Token symbol (e.g., "BONK", "WIF")
   */
  tokenSymbol: string;

  /**
   * Token mint address
   */
  tokenMint: string;

  /**
   * Cycle number for this token (1st cycle, 2nd cycle, etc.)
   * Increments each time balance returns to 0 and new position opens
   */
  cycleNumber: number;

  /**
   * Array of all buy transactions in this cycle
   */
  buys: TradeSummaryTransaction[];

  /**
   * Array of all sell transactions in this cycle
   */
  sells: TradeSummaryTransaction[];

  /**
   * Total number of buy transactions
   */
  buyCount: number;

  /**
   * Total number of sell transactions
   */
  sellCount: number;

  /**
   * Total amount of tokens purchased (sum of all buy amounts)
   */
  totalBuyAmount: number;

  /**
   * Total amount of tokens sold (sum of all sell amounts)
   */
  totalSellAmount: number;

  /**
   * Total USD value spent on buys (OPTIONAL - may not be available without pricing)
   */
  totalBuyValue?: number;

  /**
   * Total USD value received from sells (OPTIONAL - may not be available without pricing)
   */
  totalSellValue?: number;

  /**
   * Average buy price per token (totalBuyValue / totalBuyAmount) (OPTIONAL)
   */
  averageBuyPrice?: number;

  /**
   * Average sell price per token (totalSellValue / totalSellAmount) (OPTIONAL)
   */
  averageSellPrice?: number;

  /**
   * Current token balance (totalBuyAmount - totalSellAmount)
   * 0 means position is fully closed
   */
  currentBalance: number;

  /**
   * Final token balance (same as currentBalance for completed cycles)
   */
  finalBalance: number;

  /**
   * Profit/Loss in USD (OPTIONAL - requires pricing data)
   * For completed cycles: totalSellValue - totalBuyValue
   * For active cycles: (currentBalance * currentPrice + totalSellValue) - totalBuyValue
   */
  profitLoss?: number;

  /**
   * Profit/Loss percentage (OPTIONAL - requires pricing data)
   * (profitLoss / totalBuyValue) * 100
   */
  profitLossPercentage?: number;

  /**
   * Timestamp of first buy in this cycle
   */
  startTimestamp: number;

  /**
   * Timestamp of last sell in this cycle
   * null if position is still active
   */
  endTimestamp: number | null;

  /**
   * Duration of trade cycle in seconds
   * endTimestamp - startTimestamp
   */
  duration: number | null;

  /**
   * Trade cycle status
   * "Active": Position still open (currentBalance > 0)
   * "Completed": Position fully closed (currentBalance = 0)
   */
  status: TradeCycleStatus;

  /**
   * Price confidence warnings
   * Array of warnings if any transactions have low price confidence
   */
  priceWarnings?: string[];
}

/**
 * Simplified transaction summary for trade groups
 */
export interface TradeSummaryTransaction {
  /**
   * Transaction signature
   */
  signature: string;

  /**
   * Unix timestamp
   */
  timestamp: number;

  /**
   * Token amount (decimal-adjusted)
   */
  amount: number;

  /**
   * USD value at time of transaction
   */
  valueUSD: number;

  /**
   * Price per token
   */
  pricePerToken: number;

  /**
   * Price confidence level
   */
  priceConfidence?: PriceConfidence;
}

// ============================================================================
// Token Trade Cycles Mapping
// ============================================================================

/**
 * TokenTradeCycles - Maps token mints to their trade groups
 *
 * Organizes all trades by token, with multiple cycles per token.
 *
 * @example
 * {
 *   "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": [ // BONK mint
 *     { cycleNumber: 1, status: "Completed", ... },
 *     { cycleNumber: 2, status: "Active", ... }
 *   ],
 *   "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": [ // WIF mint
 *     { cycleNumber: 1, status: "Completed", ... }
 *   ]
 * }
 */
export type TokenTradeCycles = {
  [tokenMint: string]: TradeGroup[];
};

// ============================================================================
// Token Metadata
// ============================================================================

/**
 * TokenMetadata - Information about a Solana token
 */
export interface TokenMetadata {
  /**
   * Token mint address
   */
  address: string;

  /**
   * Token symbol (e.g., "SOL", "USDC", "BONK")
   */
  symbol: string;

  /**
   * Full token name (e.g., "Wrapped SOL", "USD Coin")
   */
  name: string;

  /**
   * Token decimals (typically 6 or 9 on Solana)
   */
  decimals: number;

  /**
   * Token logo URI (optional)
   */
  logoURI?: string;

  /**
   * Additional tags (e.g., ["stablecoin"], ["community"])
   */
  tags?: string[];
}

// ============================================================================
// Helius API Types
// ============================================================================

/**
 * HeliusTransaction - Raw transaction data from Helius Enhanced API
 */
export interface HeliusTransaction {
  /**
   * Transaction signature
   */
  signature: string;

  /**
   * Unix timestamp
   */
  timestamp: number;

  /**
   * Transaction type (e.g., "SWAP", "TRANSFER")
   */
  type: string;

  /**
   * Source platform (e.g., "JUPITER", "RAYDIUM")
   */
  source: string;

  /**
   * Transaction fee in lamports
   */
  fee: number;

  /**
   * Account that paid the fee
   */
  feePayer: string;

  /**
   * Native SOL transfers
   */
  nativeTransfers?: HeliusNativeTransfer[];

  /**
   * SPL token transfers
   */
  tokenTransfers?: HeliusTokenTransfer[];

  /**
   * Account data with balance changes
   */
  accountData?: HeliusAccountData[];

  /**
   * Transaction description from Helius
   */
  description?: string;

  /**
   * Events (swap details, etc.)
   */
  events?: any;
}

/**
 * Native SOL transfer within a transaction
 */
export interface HeliusNativeTransfer {
  /**
   * Sender account
   */
  fromUserAccount: string;

  /**
   * Receiver account
   */
  toUserAccount: string;

  /**
   * Amount in lamports
   */
  amount: number;
}

/**
 * SPL token transfer within a transaction
 */
export interface HeliusTokenTransfer {
  /**
   * Sender account
   */
  fromUserAccount: string;

  /**
   * Receiver account
   */
  toUserAccount: string;

  /**
   * Sender token account
   */
  fromTokenAccount: string;

  /**
   * Receiver token account
   */
  toTokenAccount: string;

  /**
   * Token amount (raw, not decimal-adjusted)
   */
  tokenAmount: number;

  /**
   * Token mint address
   */
  mint: string;

  /**
   * Token standard (e.g., "Fungible")
   */
  tokenStandard: string;
}

/**
 * Account data with balance changes
 */
export interface HeliusAccountData {
  /**
   * Account address
   */
  account: string;

  /**
   * Native SOL balance change
   */
  nativeBalanceChange: number;

  /**
   * Token balance changes for this account
   */
  tokenBalanceChanges?: HeliusTokenBalanceChange[];
}

/**
 * Token balance change for an account
 */
export interface HeliusTokenBalanceChange {
  /**
   * Token mint address
   */
  mint: string;

  /**
   * Raw token amount with decimals
   */
  rawTokenAmount: {
    /**
     * Token amount as string (can be negative)
     */
    tokenAmount: string;

    /**
     * Token decimals
     */
    decimals: number;
  };

  /**
   * User account that owns the token account
   */
  userAccount: string;
}

// ============================================================================
// Jupiter API Types
// ============================================================================

/**
 * Jupiter Price API v2 Response
 */
export interface JupiterPriceResponse {
  data: {
    [mintAddress: string]: JupiterPriceData;
  };
  timeTaken: number;
}

/**
 * Price data for a single token from Jupiter
 */
export interface JupiterPriceData {
  /**
   * Token mint address
   */
  id: string;

  /**
   * Price in USD
   */
  price: number;

  /**
   * Additional price data (optional)
   */
  extraInfo?: {
    lastSwappedPrice?: number;
    quotedPrice?: number;
    confidenceLevel?: string;
  };
}

/**
 * Jupiter Token List API Response
 */
export interface JupiterToken {
  /**
   * Token mint address
   */
  address: string;

  /**
   * Token symbol
   */
  symbol: string;

  /**
   * Token name
   */
  name: string;

  /**
   * Token decimals
   */
  decimals: number;

  /**
   * Logo URI
   */
  logoURI?: string;

  /**
   * Tags
   */
  tags?: string[];

  /**
   * Daily volume (if available)
   */
  daily_volume?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  /**
   * Success status
   */
  success: boolean;

  /**
   * Response data
   */
  data?: T;

  /**
   * Error message (if success = false)
   */
  error?: string;

  /**
   * Metadata about the response
   */
  metadata?: {
    /**
     * Total count of items
     */
    total?: number;

    /**
     * Data source
     */
    source?: string;

    /**
     * Timestamp when data was fetched
     */
    fetchedAt?: number;

    /**
     * Pagination cursor (if applicable)
     */
    cursor?: string;
  };
}

/**
 * Response from /api/helius-swaps endpoint
 */
export interface HeliusSwapsResponse {
  /**
   * Array of processed DeFi activities
   */
  activities: DeFiActivity[];

  /**
   * Total count
   */
  total: number;

  /**
   * Wallet address that was queried
   */
  walletAddress: string;

  /**
   * Timestamp when data was fetched
   */
  fetchedAt: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Base currencies (used for buy/sell classification)
 */
export const BASE_CURRENCIES = ['SOL', 'USDC', 'USDT', 'DAI'] as const;
export type BaseCurrency = typeof BASE_CURRENCIES[number];

/**
 * Well-known stablecoins
 */
export const STABLECOINS = ['USDC', 'USDT', 'DAI', 'BUSD'] as const;
export type Stablecoin = typeof STABLECOINS[number];

/**
 * Stablecoin mint addresses
 */
export const STABLECOIN_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
} as const;

/**
 * Wrapped SOL mint address
 */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

/**
 * Essential tokens cache
 */
export interface EssentialTokensCache {
  [mintAddress: string]: TokenMetadata;
}

/**
 * Swap classification result
 */
export interface SwapClassification {
  /**
   * Transaction type classification
   */
  type: 'BUY' | 'SELL' | 'SWAP';

  /**
   * Traded coin symbol
   */
  tradedCoin: string;

  /**
   * Traded coin mint
   */
  tradedCoinMint: string;

  /**
   * Is buy flag
   */
  isBuy: boolean;

  /**
   * Is sell flag
   */
  isSell: boolean;

  /**
   * Needs splitting flag (for token-to-token swaps)
   */
  needsSplitting?: boolean;

  /**
   * Sell record data (for splits)
   */
  sellRecord?: Partial<DeFiActivity>;

  /**
   * Buy record data (for splits)
   */
  buyRecord?: Partial<DeFiActivity>;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error for API failures
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Custom error for transaction processing failures
 */
export class TransactionProcessingError extends Error {
  constructor(
    message: string,
    public signature: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TransactionProcessingError';
  }
}
