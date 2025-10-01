'use client';

/**
 * SkeletonLoader Component
 *
 * Provides skeleton loaders for table rows and cards during data fetching.
 * Features animated pulse effect and responsive design matching actual components.
 *
 * Exports:
 * - TableSkeleton: Skeleton for TransactionTable (multiple rows)
 * - CardSkeleton: Skeleton for TradeSummary cards (multiple cards)
 */

interface TableSkeletonProps {
  /**
   * Number of skeleton rows to display
   * @default 5
   */
  rows?: number;
}

interface CardSkeletonProps {
  /**
   * Number of skeleton cards to display
   * @default 3
   */
  cards?: number;
}

/**
 * TableSkeleton Component
 *
 * Displays skeleton loaders for the TransactionTable component
 * Matches both desktop table layout and mobile card layout
 */
export function TableSkeleton({ rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {/* Desktop Table Skeleton */}
      <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            {/* Table Header */}
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Signature
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Time
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Coin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  To
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  USD Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Platform
                </th>
              </tr>
            </thead>

            {/* Table Body with Skeleton Rows */}
            <tbody className="divide-y divide-gray-200 bg-white">
              {Array.from({ length: rows }).map((_, index) => (
                <tr key={index} className="animate-pulse">
                  {/* Signature */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="h-4 w-32 rounded bg-gray-200"></div>
                  </td>

                  {/* Time */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="h-4 w-24 rounded bg-gray-200"></div>
                  </td>

                  {/* Type Badge */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="h-5 w-12 rounded-full bg-gray-200"></div>
                  </td>

                  {/* Coin Badge */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="h-5 w-16 rounded-full bg-gray-200"></div>
                  </td>

                  {/* From Amount */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="space-y-1">
                      <div className="h-4 w-24 rounded bg-gray-200"></div>
                      <div className="h-3 w-16 rounded bg-gray-200"></div>
                    </div>
                  </td>

                  {/* To Amount */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="space-y-1">
                      <div className="h-4 w-24 rounded bg-gray-200"></div>
                      <div className="h-3 w-16 rounded bg-gray-200"></div>
                    </div>
                  </td>

                  {/* USD Value */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="space-y-1">
                      <div className="h-4 w-20 rounded bg-gray-200"></div>
                      <div className="h-3 w-24 rounded bg-gray-200"></div>
                    </div>
                  </td>

                  {/* Platform */}
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="h-5 w-20 rounded-md bg-gray-200"></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card Skeleton */}
      <div className="space-y-4 lg:hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            {/* Header: Type Badge and Time */}
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="h-5 w-12 rounded-full bg-gray-200"></div>
                <div className="h-5 w-16 rounded-full bg-gray-200"></div>
              </div>
              <div className="h-4 w-20 rounded bg-gray-200"></div>
            </div>

            {/* Trade Details */}
            <div className="space-y-2">
              {/* From */}
              <div className="flex items-center justify-between">
                <div className="h-4 w-12 rounded bg-gray-200"></div>
                <div className="space-y-1 text-right">
                  <div className="h-4 w-24 rounded bg-gray-200"></div>
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                </div>
              </div>

              {/* To */}
              <div className="flex items-center justify-between">
                <div className="h-4 w-12 rounded bg-gray-200"></div>
                <div className="space-y-1 text-right">
                  <div className="h-4 w-24 rounded bg-gray-200"></div>
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                </div>
              </div>

              {/* USD Value */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                <div className="h-4 w-20 rounded bg-gray-200"></div>
                <div className="h-4 w-20 rounded bg-gray-200"></div>
              </div>

              {/* Platform */}
              <div className="flex items-center justify-between">
                <div className="h-4 w-16 rounded bg-gray-200"></div>
                <div className="h-5 w-20 rounded-md bg-gray-200"></div>
              </div>
            </div>

            {/* Footer: Signature Link */}
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="h-4 w-40 rounded bg-gray-200"></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * CardSkeleton Component
 *
 * Displays skeleton loaders for the TradeSummary cards
 * Matches the responsive grid layout and card structure
 */
export function CardSkeleton({ cards = 3 }: CardSkeletonProps) {
  return (
    <div className="space-y-4">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="animate-pulse space-y-2">
          <div className="h-7 w-40 rounded bg-gray-200"></div>
          <div className="h-4 w-56 rounded bg-gray-200"></div>
        </div>
      </div>

      {/* Trade Cycle Cards Grid Skeleton */}
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-lg border-2 border-gray-200 bg-white p-4 shadow-sm"
          >
            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-6 w-32 rounded bg-gray-200"></div>
                <div className="h-3 w-24 rounded bg-gray-200"></div>
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200"></div>
            </div>

            {/* Buy Stats */}
            <div className="mb-3 rounded-md bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-3 w-12 rounded bg-gray-200"></div>
                <div className="h-3 w-24 rounded bg-gray-200"></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                  <div className="h-4 w-24 rounded bg-gray-200"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-12 rounded bg-gray-200"></div>
                  <div className="h-4 w-20 rounded bg-gray-200"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                </div>
              </div>
            </div>

            {/* Sell Stats */}
            <div className="mb-3 rounded-md bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-3 w-12 rounded bg-gray-200"></div>
                <div className="h-3 w-24 rounded bg-gray-200"></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                  <div className="h-4 w-24 rounded bg-gray-200"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-12 rounded bg-gray-200"></div>
                  <div className="h-4 w-20 rounded bg-gray-200"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                  <div className="h-3 w-16 rounded bg-gray-200"></div>
                </div>
              </div>
            </div>

            {/* Current Balance */}
            <div className="mb-3 flex items-center justify-between rounded-md bg-blue-50 p-2">
              <div className="h-3 w-24 rounded bg-gray-200"></div>
              <div className="h-4 w-20 rounded bg-gray-200"></div>
            </div>

            {/* P/L Display */}
            <div className="mb-3 rounded-md bg-gray-50 p-3">
              <div className="mb-2">
                <div className="h-3 w-20 rounded bg-gray-200"></div>
              </div>
              <div className="flex items-center justify-between">
                <div className="h-6 w-20 rounded bg-gray-200"></div>
                <div className="h-5 w-16 rounded bg-gray-200"></div>
              </div>
            </div>

            {/* Duration */}
            <div className="mb-3 flex items-center justify-between">
              <div className="h-3 w-16 rounded bg-gray-200"></div>
              <div className="h-3 w-24 rounded bg-gray-200"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
