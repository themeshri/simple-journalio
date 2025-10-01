'use client';

import { useState } from 'react';
import { TransactionTable, TradeSummary } from '@/components';
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader';
import { DeFiActivity } from '@/types';

/**
 * Main page for Solana Wallet Transaction Viewer
 *
 * Features:
 * - Wallet address input with validation
 * - Fetch transactions from Helius API
 * - Toggle between table and summary views
 * - Loading, error, and empty states
 */
export default function Home() {
  // State management
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [activities, setActivities] = useState<DeFiActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'summary'>('table');

  /**
   * Validates Solana wallet address format
   * Solana addresses are base58 encoded and typically 32-44 characters
   */
  const isValidSolanaAddress = (address: string): boolean => {
    // Basic validation: 32-44 characters, alphanumeric (base58)
    const solanaAddressRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
    return solanaAddressRegex.test(address.trim());
  };

  /**
   * Fetches transactions from the API
   */
  const fetchTransactions = async () => {
    // Validate wallet address
    const trimmedAddress = walletAddress.trim();
    if (!trimmedAddress) {
      setError('Please enter a wallet address');
      return;
    }

    if (!isValidSolanaAddress(trimmedAddress)) {
      setError('Invalid Solana wallet address format');
      return;
    }

    // Reset state and start loading
    setError(null);
    setLoading(true);
    setActivities([]);

    try {
      const response = await fetch(`/api/helius-swaps?wallet=${encodeURIComponent(trimmedAddress)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.data) {
        setActivities(data.data || []);

        // Show message if no transactions found
        if (!data.data || data.data.length === 0) {
          setError('No swap transactions found for this wallet address');
        }
      } else {
        throw new Error(data.error || 'Failed to fetch transactions');
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles form submission
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTransactions();
  };

  /**
   * Handles wallet address input change
   */
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWalletAddress(e.target.value);
    // Clear error when user starts typing
    if (error) {
      setError(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Solana Wallet Transaction Viewer
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-lg">
            Track and analyze your DeFi swap transactions on Solana
          </p>
        </header>

        {/* Input Section */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="wallet-address"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2"
              >
                Wallet Address
              </label>
              <input
                id="wallet-address"
                type="text"
                value={walletAddress}
                onChange={handleAddressChange}
                placeholder="Enter Solana wallet address (e.g., 7xKXtg2C...)"
                className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white transition-colors"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !walletAddress.trim()}
              className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Loading Transactions...
                </span>
              ) : (
                'Fetch Transactions'
              )}
            </button>
          </form>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 flex-1">
                  <svg
                    className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
                {!error.includes('No swap transactions found') && walletAddress.trim() && (
                  <button
                    onClick={fetchTransactions}
                    disabled={loading}
                    className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 dark:bg-red-800/30 dark:hover:bg-red-800/50 text-red-800 dark:text-red-200 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1 shadow-sm">
                <div className="px-6 py-2 rounded-md bg-blue-600 text-white shadow-sm">
                  {viewMode === 'table' ? 'Table View' : 'Summary View'}
                </div>
              </div>
            </div>
            {viewMode === 'table' ? <TableSkeleton rows={8} /> : <CardSkeleton cards={6} />}
          </div>
        )}

        {/* View Toggle and Results */}
        {!loading && activities.length > 0 && (
          <>
            {/* View Mode Toggle */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-1 shadow-sm">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    viewMode === 'table'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Table View
                </button>
                <button
                  onClick={() => setViewMode('summary')}
                  className={`px-6 py-2 rounded-md font-medium transition-colors ${
                    viewMode === 'summary'
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  Summary View
                </button>
              </div>
            </div>

            {/* Conditional Component Rendering */}
            {viewMode === 'table' ? (
              <TransactionTable activities={activities} />
            ) : (
              <TradeSummary activities={activities} />
            )}
          </>
        )}

        {/* Empty State */}
        {!loading && !error && activities.length === 0 && walletAddress.trim() === '' && (
          <div className="text-center py-12">
            <svg
              className="mx-auto h-24 w-24 text-slate-400 dark:text-slate-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
              Ready to analyze transactions
            </h3>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Enter a Solana wallet address above to get started
            </p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <svg
              className="animate-spin h-16 w-16 text-blue-600 mx-auto mb-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">
              Fetching Transactions
            </h3>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Please wait while we retrieve your transaction history...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
