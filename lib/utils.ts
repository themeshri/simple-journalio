/**
 * Utility Functions for Solana Wallet Transaction Viewer
 *
 * Provides formatting, calculation, and helper utilities for:
 * - Time formatting (relative and absolute)
 * - Number and currency formatting
 * - Duration formatting
 * - Trade cycle calculations and grouping
 * - CSS class merging
 */

import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DeFiActivity, TradeGroup, TokenTradeCycles, TradeSummaryTransaction, TradeCycleStatus } from "@/types";

// ============================================================================
// CSS Utilities
// ============================================================================

/**
 * Merges Tailwind CSS classes with clsx and tailwind-merge
 * Handles conditional classes and prevents style conflicts
 *
 * @param inputs - Class values to merge
 * @returns Merged class string
 *
 * @example
 * cn("px-4 py-2", "bg-blue-500", { "text-white": true })
 * // => "px-4 py-2 bg-blue-500 text-white"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format Unix timestamp to relative time or absolute date
 *
 * Rules:
 * - < 1 minute: "just now"
 * - < 1 hour: "Xm ago" (e.g., "45m ago")
 * - < 24 hours: "Xh ago" (e.g., "3h ago")
 * - < 7 days: "Xd ago" (e.g., "5d ago")
 * - >= 7 days: Absolute date (e.g., "Jan 15, 2025")
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Formatted time string
 *
 * @example
 * formatTime(Date.now() / 1000 - 30) // => "just now"
 * formatTime(Date.now() / 1000 - 3600) // => "1h ago"
 * formatTime(Date.now() / 1000 - 86400 * 3) // => "3d ago"
 * formatTime(Date.now() / 1000 - 86400 * 30) // => "Jan 1, 2025"
 */
export function formatTime(timestamp: number): string {
  const now = Date.now();
  const then = timestamp * 1000; // Convert to milliseconds
  const diffSeconds = Math.floor((now - then) / 1000);

  // Just now (< 1 minute)
  if (diffSeconds < 60) {
    return "just now";
  }

  // Minutes ago (< 1 hour)
  if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60);
    return `${minutes}m ago`;
  }

  // Hours ago (< 24 hours)
  if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600);
    return `${hours}h ago`;
  }

  // Days ago (< 7 days)
  if (diffSeconds < 604800) {
    const days = Math.floor(diffSeconds / 86400);
    return `${days}d ago`;
  }

  // Absolute date for older timestamps
  const date = new Date(then);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ============================================================================
// Number Formatting
// ============================================================================

/**
 * Format token amounts with proper decimals and commas
 *
 * @param amount - Token amount to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted amount string with commas
 *
 * @example
 * formatAmount(1234.567) // => "1,234.57"
 * formatAmount(1234.567, 4) // => "1,234.5670"
 * formatAmount(0.00001234, 8) // => "0.00001234"
 */
export function formatAmount(amount: number, decimals: number = 2): string {
  // Handle very small amounts (< 0.01) with higher precision
  if (Math.abs(amount) < 0.01 && Math.abs(amount) > 0) {
    // Find first significant digit
    const str = amount.toString();
    const match = str.match(/0\.0*[1-9]/);
    if (match) {
      const significantDecimals = match[0].length - 1 + 2; // Keep 2 more digits after first significant
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: significantDecimals,
        maximumFractionDigits: significantDecimals,
      }).format(amount);
    }
  }

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * Format USD values with $ symbol and commas
 * NOTE: Deprecated - USD values have been removed from the application
 *
 * @param value - USD value to format
 * @returns Formatted currency string
 *
 * @example
 * formatValue(1234.56) // => "$1,234.56"
 * formatValue(-100) // => "-$100.00"
 * formatValue(0.5) // => "$0.50"
 */
// export function formatValue(value: number): string {
//   const isNegative = value < 0;
//   const absoluteValue = Math.abs(value);

//   const formatted = new Intl.NumberFormat("en-US", {
//     style: "currency",
//     currency: "USD",
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 2,
//   }).format(absoluteValue);

//   return isNegative ? `-${formatted}` : formatted;
// }

/**
 * Format large numbers with K, M, B suffixes
 *
 * @param value - Number to format
 * @returns Formatted string with suffix
 *
 * @example
 * formatCompact(1234) // => "1.23K"
 * formatCompact(1234567) // => "1.23M"
 * formatCompact(1234567890) // => "1.23B"
 */
export function formatCompact(value: number): string {
  const isNegative = value < 0;
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000_000) {
    const formatted = (absoluteValue / 1_000_000_000).toFixed(2) + "B";
    return isNegative ? `-${formatted}` : formatted;
  }

  if (absoluteValue >= 1_000_000) {
    const formatted = (absoluteValue / 1_000_000).toFixed(2) + "M";
    return isNegative ? `-${formatted}` : formatted;
  }

  if (absoluteValue >= 1_000) {
    const formatted = (absoluteValue / 1_000).toFixed(2) + "K";
    return isNegative ? `-${formatted}` : formatted;
  }

  return formatAmount(value, 2);
}

// ============================================================================
// Duration Formatting
// ============================================================================

/**
 * Format duration in seconds to human-readable format
 *
 * Rules:
 * - Shows only non-zero units
 * - Format: "Xd Yh Zm" (days, hours, minutes)
 * - Omits seconds for cleaner display
 *
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 *
 * @example
 * formatDuration(90) // => "1m"
 * formatDuration(3665) // => "1h 1m"
 * formatDuration(90000) // => "1d 1h"
 * formatDuration(86400) // => "1d"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(" ") || "0m";
}

// ============================================================================
// Trade Cycle Calculations
// ============================================================================

/**
 * Calculate trade cycles from DeFi activities
 *
 * Algorithm:
 * 1. Group activities by tradedCoinMint
 * 2. Sort each group chronologically
 * 3. Track running balance (buys add, sells subtract)
 * 4. When balance reaches 0, complete current cycle and start new one
 * 5. Calculate P/L, duration, avg prices for each cycle
 *
 * @param activities - Array of DeFi activities
 * @returns TokenTradeCycles map (mint -> TradeGroup[])
 *
 * @example
 * const activities = [
 *   { tradedCoinMint: "ABC...", isBuy: true, toAmount: 100, ... },
 *   { tradedCoinMint: "ABC...", isSell: true, fromAmount: 100, ... }
 * ];
 * const cycles = calculateTradeCycles(activities);
 * // cycles["ABC..."][0].status === "Completed"
 * // cycles["ABC..."][0].profitLoss === calculated P/L
 */
export function calculateTradeCycles(activities: DeFiActivity[]): TokenTradeCycles {
  const cycles: TokenTradeCycles = {};

  // Group activities by token mint
  const groupedActivities: { [mint: string]: DeFiActivity[] } = {};

  for (const activity of activities) {
    const mint = activity.tradedCoinMint;
    if (!groupedActivities[mint]) {
      groupedActivities[mint] = [];
    }
    groupedActivities[mint].push(activity);
  }

  // Process each token's activities
  for (const [mint, tokenActivities] of Object.entries(groupedActivities)) {
    // Sort by timestamp (oldest first)
    const sorted = tokenActivities.sort((a, b) => a.timestamp - b.timestamp);

    const tokenCycles: TradeGroup[] = [];
    let currentCycle: TradeGroup | null = null;
    let cycleNumber = 0;

    for (const activity of sorted) {
      // Initialize new cycle if needed
      if (!currentCycle) {
        cycleNumber++;
        currentCycle = createNewTradeGroup(activity, cycleNumber);
      }

      // Add activity to current cycle
      if (activity.isBuy) {
        addBuyToTradeGroup(currentCycle, activity);
      } else if (activity.isSell) {
        addSellToTradeGroup(currentCycle, activity);
      }

      // Check if cycle is completed (balance returned to 0)
      if (currentCycle.currentBalance === 0 && currentCycle.buys.length > 0 && currentCycle.sells.length > 0) {
        // Finalize completed cycle
        finalizeTradeGroup(currentCycle);
        tokenCycles.push(currentCycle);
        currentCycle = null; // Start fresh for next cycle
      }
    }

    // Add active (incomplete) cycle if exists
    if (currentCycle && currentCycle.buys.length > 0) {
      currentCycle.status = "Active";
      currentCycle.endTimestamp = null;
      currentCycle.duration = null;
      tokenCycles.push(currentCycle);
    }

    cycles[mint] = tokenCycles;
  }

  return cycles;
}

/**
 * Create a new trade group from first activity
 */
function createNewTradeGroup(activity: DeFiActivity, cycleNumber: number): TradeGroup {
  return {
    tokenSymbol: activity.tradedCoin,
    tokenMint: activity.tradedCoinMint,
    cycleNumber,
    buys: [],
    sells: [],
    buyCount: 0,
    sellCount: 0,
    totalBuyAmount: 0,
    totalSellAmount: 0,
    totalBuyValue: 0,
    totalSellValue: 0,
    averageBuyPrice: 0,
    averageSellPrice: 0,
    currentBalance: 0,
    finalBalance: 0,
    profitLoss: 0,
    profitLossPercentage: 0,
    startTimestamp: activity.timestamp,
    endTimestamp: null,
    duration: null,
    status: "Active" as TradeCycleStatus,
    priceWarnings: [],
  };
}

/**
 * Add buy transaction to trade group
 */
function addBuyToTradeGroup(group: TradeGroup, activity: DeFiActivity): void {
  const amount = activity.toAmount;
  const valueUSD = activity.toValueUSD ?? 0; // Use 0 if USD value not available
  const pricePerToken = amount > 0 ? valueUSD / amount : 0;

  const transaction: TradeSummaryTransaction = {
    signature: activity.signature,
    timestamp: activity.timestamp,
    amount,
    valueUSD,
    pricePerToken,
    priceConfidence: activity.priceConfidence,
  };

  group.buys.push(transaction);
  group.buyCount++;
  group.totalBuyAmount += amount;
  group.totalBuyValue = (group.totalBuyValue ?? 0) + valueUSD;
  group.currentBalance += amount;

  // Recalculate average buy price
  group.averageBuyPrice = group.totalBuyAmount > 0
    ? (group.totalBuyValue ?? 0) / group.totalBuyAmount
    : 0;

  // Add price warning if confidence is low
  if (activity.priceConfidence === "low" || activity.priceConfidence === "none") {
    group.priceWarnings?.push(
      `Low price confidence for buy at ${formatTime(activity.timestamp)}`
    );
  }
}

/**
 * Add sell transaction to trade group
 */
function addSellToTradeGroup(group: TradeGroup, activity: DeFiActivity): void {
  const amount = activity.fromAmount;
  const valueUSD = activity.fromValueUSD ?? 0; // Use 0 if USD value not available
  const pricePerToken = amount > 0 ? valueUSD / amount : 0;

  const transaction: TradeSummaryTransaction = {
    signature: activity.signature,
    timestamp: activity.timestamp,
    amount,
    valueUSD,
    pricePerToken,
    priceConfidence: activity.priceConfidence,
  };

  group.sells.push(transaction);
  group.sellCount++;
  group.totalSellAmount += amount;
  group.totalSellValue = (group.totalSellValue ?? 0) + valueUSD;
  group.currentBalance -= amount;

  // Recalculate average sell price
  group.averageSellPrice = group.totalSellAmount > 0
    ? (group.totalSellValue ?? 0) / group.totalSellAmount
    : 0;

  // Update end timestamp (last sell)
  group.endTimestamp = activity.timestamp;

  // Add price warning if confidence is low
  if (activity.priceConfidence === "low" || activity.priceConfidence === "none") {
    group.priceWarnings?.push(
      `Low price confidence for sell at ${formatTime(activity.timestamp)}`
    );
  }
}

/**
 * Finalize completed trade group (calculate P/L, duration)
 */
function finalizeTradeGroup(group: TradeGroup): void {
  group.status = "Completed";
  group.finalBalance = group.currentBalance;

  // Calculate P/L (using 0 if USD values not available)
  const sellValue = group.totalSellValue ?? 0;
  const buyValue = group.totalBuyValue ?? 0;
  group.profitLoss = sellValue - buyValue;
  group.profitLossPercentage = buyValue > 0
    ? ((group.profitLoss ?? 0) / buyValue) * 100
    : 0;

  // Calculate duration
  if (group.endTimestamp) {
    group.duration = group.endTimestamp - group.startTimestamp;
  }
}

// ============================================================================
// Transaction Utilities
// ============================================================================

/**
 * Get Solscan URL for transaction signature
 *
 * @param signature - Transaction signature
 * @param cluster - Solana cluster (default: mainnet)
 * @returns Solscan URL
 *
 * @example
 * getSolscanUrl("5xY7...")
 * // => "https://solscan.io/tx/5xY7..."
 */
export function getSolscanUrl(signature: string, cluster: "mainnet" | "devnet" = "mainnet"): string {
  const baseUrl = "https://solscan.io/tx";
  const clusterParam = cluster === "devnet" ? "?cluster=devnet" : "";
  return `${baseUrl}/${signature}${clusterParam}`;
}

/**
 * Truncate wallet address for display
 *
 * @param address - Wallet address
 * @param chars - Number of characters to show on each end (default: 4)
 * @returns Truncated address
 *
 * @example
 * truncateAddress("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263")
 * // => "DezX...B263"
 */
export function truncateAddress(address: string, chars: number = 4): string {
  if (address.length <= chars * 2) {
    return address;
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Copy text to clipboard
 *
 * @param text - Text to copy
 * @returns Promise that resolves when copy is complete
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate Solana address format
 *
 * @param address - Address to validate
 * @returns True if valid Solana address
 */
export function isValidSolanaAddress(address: string): boolean {
  // Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Debounce function for input handlers
 *
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return function (this: unknown, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this as T, args), delay);
  };
}
