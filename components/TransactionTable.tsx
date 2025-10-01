'use client';

/**
 * TransactionTable Component
 *
 * Displays a comprehensive table of DeFi swap transactions with the following features:
 * - Transaction signature links to Solscan
 * - Formatted relative time
 * - Color-coded buy/sell badges
 * - Token amounts (no USD values)
 * - Platform/source information
 * - Responsive design with mobile card layout
 * - Empty state handling
 */

import type { DeFiActivity } from '@/types';
import { formatTime, formatAmount, getSolscanUrl } from '@/lib/utils';

interface TransactionTableProps {
  activities: DeFiActivity[];
}

export default function TransactionTable({ activities }: TransactionTableProps) {
  // Handle empty state
  if (!activities || activities.length === 0) {
    return (
      <div className="w-full rounded-lg border border-gray-200 bg-gray-50 p-12 text-center">
        <div className="mx-auto max-w-sm">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
            />
          </svg>
          <h3 className="mt-2 text-sm font-semibold text-gray-900">No transactions</h3>
          <p className="mt-1 text-sm text-gray-500">
            No swap transactions found for this wallet address.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Signature
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Time
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Type
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Coin
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  From
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  To
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Platform
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {activities.map((activity) => (
                <tr key={activity.signature} className="hover:bg-gray-50 transition-colors">
                  {/* Signature */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <a
                      href={getSolscanUrl(activity.signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      {activity.signature.slice(0, 8)}...{activity.signature.slice(-8)}
                    </a>
                  </td>

                  {/* Time */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    {formatTime(activity.timestamp)}
                  </td>

                  {/* Transaction Type */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    {activity.isBuy ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        Buy
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        Sell
                      </span>
                    )}
                  </td>

                  {/* Coin Badge */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        activity.isBuy
                          ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                          : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
                      }`}
                    >
                      {activity.tradedCoin}
                    </span>
                  </td>

                  {/* From Amount */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    <span className="font-medium">
                      {formatAmount(activity.fromAmount, 4)} {activity.fromSymbol}
                    </span>
                  </td>

                  {/* To Amount */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    <span className="font-medium">
                      {formatAmount(activity.toAmount, 4)} {activity.toSymbol}
                    </span>
                  </td>

                  {/* Platform/Source */}
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                    <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      {activity.source || 'UNKNOWN'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-4 lg:hidden">
        {activities.map((activity) => (
          <div
            key={activity.signature}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            {/* Header: Type Badge and Time */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                {activity.isBuy ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                    Buy
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                    Sell
                  </span>
                )}
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    activity.isBuy
                      ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/20'
                      : 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20'
                  }`}
                >
                  {activity.tradedCoin}
                </span>
              </div>
              <span className="text-xs text-gray-500">{formatTime(activity.timestamp)}</span>
            </div>

            {/* Trade Details */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">From</span>
                <div className="text-sm font-medium text-gray-900">
                  {formatAmount(activity.fromAmount, 4)} {activity.fromSymbol}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">To</span>
                <div className="text-sm font-medium text-gray-900">
                  {formatAmount(activity.toAmount, 4)} {activity.toSymbol}
                </div>
              </div>

              {/* Platform */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Platform</span>
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                  {activity.source || 'UNKNOWN'}
                </span>
              </div>
            </div>

            {/* Footer: Signature Link */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <a
                href={getSolscanUrl(activity.signature)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs font-mono text-blue-600 hover:text-blue-800 hover:underline"
              >
                <span>
                  {activity.signature.slice(0, 8)}...{activity.signature.slice(-8)}
                </span>
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
