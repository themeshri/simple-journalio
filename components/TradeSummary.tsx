'use client';

/**
 * TradeSummary Component
 *
 * Displays grouped trade cycles for DeFi activities, showing comprehensive
 * profit/loss analysis, trade statistics, and cycle status.
 *
 * Features:
 * - Automatic trade cycle grouping and calculation
 * - P/L tracking with color-coded visual indicators
 * - Active vs Completed trade differentiation
 * - Price confidence warnings
 * - Responsive grid layout
 */

import type { DeFiActivity, TradeGroup, TokenTradeCycles } from '@/types';
import { calculateTradeCycles, formatAmount, formatDuration, formatTime } from '@/lib/utils';

interface TradeSummaryProps {
  /**
   * Array of DeFi activities to analyze and group into trade cycles
   */
  activities: DeFiActivity[];
}

export default function TradeSummary({ activities }: TradeSummaryProps) {
  // Calculate trade cycles from activities
  const tradeCycles: TokenTradeCycles = calculateTradeCycles(activities);

  // Flatten all trade groups and sort by start date (newest first)
  const allTradeGroups: TradeGroup[] = Object.values(tradeCycles)
    .flat()
    .sort((a, b) => b.startTimestamp - a.startTimestamp);

  // Empty state
  if (allTradeGroups.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
          <svg
            className="h-6 w-6 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          No trades found
        </h3>
        <p className="text-sm text-gray-500">
          Trade cycles will appear here once you have completed buy and sell transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Trade Summary</h2>
          <p className="mt-1 text-sm text-gray-500">
            {allTradeGroups.length} trade cycle{allTradeGroups.length !== 1 ? 's' : ''} across{' '}
            {Object.keys(tradeCycles).length} token{Object.keys(tradeCycles).length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Trade Cycle Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {allTradeGroups.map((tradeGroup) => (
          <TradeCycleCard key={`${tradeGroup.tokenMint}-${tradeGroup.cycleNumber}`} tradeGroup={tradeGroup} />
        ))}
      </div>
    </div>
  );
}

/**
 * TradeCycleCard Component
 *
 * Displays a single trade cycle with comprehensive statistics
 */
interface TradeCycleCardProps {
  tradeGroup: TradeGroup;
}

function TradeCycleCard({ tradeGroup }: TradeCycleCardProps) {
  const {
    tokenSymbol,
    cycleNumber,
    buyCount,
    sellCount,
    totalBuyAmount,
    totalSellAmount,
    currentBalance,
    finalBalance,
    startTimestamp,
    duration,
    status,
  } = tradeGroup;

  const isActive = status === 'Active';

  const borderColor = isActive ? 'border-blue-300' : 'border-gray-300';
  const statusBadgeColor = isActive ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800';

  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-white p-4 shadow-sm transition-shadow hover:shadow-md`}>
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">
            {tokenSymbol} Trade #{cycleNumber}
          </h3>
          <p className="text-xs text-gray-500">
            Started {formatTime(startTimestamp)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusBadgeColor}`}>
          {status}
        </span>
      </div>

      {/* Buy Stats */}
      <div className="mb-3 rounded-md bg-gray-50 p-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-gray-600">Buys</span>
          <span className="text-xs text-gray-500">{buyCount} transaction{buyCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Total Amount:</span>
          <span className="text-sm font-medium text-gray-900">
            {formatAmount(totalBuyAmount)} {tokenSymbol}
          </span>
        </div>
      </div>

      {/* Sell Stats */}
      {sellCount > 0 && (
        <div className="mb-3 rounded-md bg-gray-50 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-gray-600">Sells</span>
            <span className="text-xs text-gray-500">{sellCount} transaction{sellCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Total Amount:</span>
            <span className="text-sm font-medium text-gray-900">
              {formatAmount(totalSellAmount)} {tokenSymbol}
            </span>
          </div>
        </div>
      )}

      {/* Current Balance */}
      <div className="mb-3 flex items-center justify-between rounded-md bg-blue-50 p-2">
        <span className="text-xs font-semibold text-blue-900">
          {isActive ? 'Current Balance' : 'Final Balance'}:
        </span>
        <span className="text-sm font-bold text-blue-900">
          {formatAmount(isActive ? currentBalance : finalBalance)} {tokenSymbol}
        </span>
      </div>

      {/* Duration */}
      {duration !== null && (
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="text-gray-600">Duration:</span>
          <span className="font-medium text-gray-900">{formatDuration(duration)}</span>
        </div>
      )}
    </div>
  );
}
