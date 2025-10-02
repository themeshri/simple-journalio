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
 * - Pagination controls (20-50 items per page)
 * - Empty state handling
 */

import { useState } from 'react';
import type { DeFiActivity } from '@/types';
import { formatTime, formatAmount, getSolscanUrl } from '@/lib/utils';

interface TransactionTableProps {
  activities: DeFiActivity[];
}

type SortField = 'date' | 'type' | 'fromAmount' | 'toAmount' | 'platform';
type SortDirection = 'asc' | 'desc';

// Sortable Header Component
function SortHeader({
  field,
  label,
  currentField,
  direction,
  onSort,
}: {
  field: SortField;
  label: string;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}) {
  const isActive = currentField === field;

  return (
    <th
      scope="col"
      className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 cursor-pointer hover:bg-gray-50 select-none"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <span className="flex flex-col">
          <svg
            className={`h-3 w-3 ${
              isActive && direction === 'asc' ? 'text-blue-600' : 'text-gray-400'
            }`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </span>
      </div>
    </th>
  );
}

export default function TransactionTable({ activities }: TransactionTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sorting logic
  const sortedActivities = [...activities].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'date':
        comparison = a.timestamp - b.timestamp;
        break;
      case 'type':
        comparison = (a.isBuy ? 1 : 0) - (b.isBuy ? 1 : 0);
        break;
      case 'fromAmount':
        comparison = a.fromAmount - b.fromAmount;
        break;
      case 'toAmount':
        comparison = a.toAmount - b.toAmount;
        break;
      case 'platform':
        comparison = (a.platform || '').localeCompare(b.platform || '');
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedActivities.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedActivities = sortedActivities.slice(startIndex, endIndex);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  // Reset to page 1 when activities change
  if (sortedActivities.length > 0 && currentPage > totalPages) {
    setCurrentPage(1);
  }
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
                <SortHeader
                  field="date"
                  label="Time"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  field="type"
                  label="Type"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                >
                  Coin
                </th>
                <SortHeader
                  field="fromAmount"
                  label="From"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  field="toAmount"
                  label="To"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
                <SortHeader
                  field="platform"
                  label="Platform"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {paginatedActivities.map((activity, index) => (
                <tr key={`${activity.signature}-${index}`} className="hover:bg-gray-50 transition-colors">
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
        {paginatedActivities.map((activity, index) => (
          <div
            key={`${activity.signature}-${index}-mobile`}
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{startIndex + 1}</span> to{' '}
                <span className="font-medium">{Math.min(endIndex, activities.length)}</span> of{' '}
                <span className="font-medium">{activities.length}</span> transactions
              </p>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-md border-gray-300 py-1.5 pl-3 pr-8 text-sm text-gray-700 focus:border-blue-500 focus:ring-blue-500"
              >
                <option value={20}>20 per page</option>
                <option value={30}>30 per page</option>
                <option value={50}>50 per page</option>
              </select>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>

                {/* Page Numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    // Show first, last, current, and pages around current
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    );
                  })
                  .map((page, idx, arr) => (
                    <span key={page}>
                      {idx > 0 && arr[idx - 1] !== page - 1 && (
                        <span className="relative inline-flex items-center px-4 py-2 text-sm font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
                          ...
                        </span>
                      )}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                          currentPage === page
                            ? 'z-10 bg-blue-600 text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                        }`}
                      >
                        {page}
                      </button>
                    </span>
                  ))}

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
