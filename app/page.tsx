'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { TableSkeleton, CardSkeleton } from '@/components/SkeletonLoader';
import { DeFiActivity } from '@/types';

// Dynamic imports for code splitting
const TransactionTable = dynamic(() => import('@/components/TransactionTable'), {
  loading: () => <TableSkeleton rows={8} />,
  ssr: false,
});

const TradeSummary = dynamic(() => import('@/components/TradeSummary'), {
  loading: () => <CardSkeleton cards={6} />,
  ssr: false,
});

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
  const [metadata, setMetadata] = useState<{
    enhancedApiCount: number;
    rpcFallbackCount: number;
    totalCount: number;
  } | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [recentWallets, setRecentWallets] = useState<string[]>([]);
  const [useDeepScan, setUseDeepScan] = useState<boolean>(false);
  const [progressData, setProgressData] = useState<{
    processedSignatures: number;
    totalSignatures: number;
    foundSwaps: number;
  } | null>(null);

  /**
   * Load recent wallets from localStorage on mount
   */
  useEffect(() => {
    const stored = localStorage.getItem('recentWallets');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setRecentWallets(parsed);
      } catch (err) {
        console.error('Failed to parse recent wallets:', err);
      }
    }
  }, []);

  /**
   * Progress tracking effect - clears progress when loading stops
   */
  useEffect(() => {
    if (!loading) {
      setProgressPercent(0);
      setProgressMessage('');
      setProgressData(null);
    }
  }, [loading]);

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
   * Fetches transactions progressively with cursor-based pagination
   * This mode processes ALL transaction history to find every swap
   */
  const fetchTransactionsProgressive = async (trimmedAddress: string, controller: AbortController) => {
    const BATCH_SIZE = 100;
    const allActivities: DeFiActivity[] = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;

    try {
      while (hasMore && !controller.signal.aborted) {
        const url = cursor
          ? `/api/helius-swaps?wallet=${encodeURIComponent(trimmedAddress)}&progressive=true&batchSize=${BATCH_SIZE}&cursor=${encodeURIComponent(cursor)}`
          : `/api/helius-swaps?wallet=${encodeURIComponent(trimmedAddress)}&progressive=true&batchSize=${BATCH_SIZE}`;

        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch transactions');
        }

        // Accumulate activities from this batch
        if (data.data && data.data.length > 0) {
          allActivities.push(...data.data);
        }

        // Update progress display
        if (data.progress) {
          const { processedSignatures, totalSignatures, foundSwaps, percentComplete, hasMore: more, cursor: nextCursor } = data.progress;

          setProgressData({
            processedSignatures,
            totalSignatures,
            foundSwaps,
          });
          setProgressPercent(percentComplete);
          setProgressMessage(`Scanning transaction history... Found ${foundSwaps} swaps so far`);

          // Update activities in real-time
          setActivities([...allActivities]);

          // Check if there's more to fetch
          hasMore = more;
          cursor = nextCursor;
        } else {
          hasMore = false;
        }

        // Small delay to avoid overwhelming the UI
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Final update
      setActivities(allActivities);
      setMetadata({
        enhancedApiCount: 0,
        rpcFallbackCount: allActivities.length,
        totalCount: allActivities.length,
      });

      // Save to recent wallets
      saveToRecentWallets(trimmedAddress);

      if (allActivities.length === 0) {
        setError('No swap transactions found for this wallet address');
      }

    } catch (err) {
      // Don't show error if request was cancelled by user
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Progressive loading cancelled by user');
        return;
      }

      console.error('Error in progressive loading:', err);
      throw err;
    }
  };

  /**
   * Fetches transactions from the API (standard mode)
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

    // Create abort controller for cancellation
    const controller = new AbortController();
    setAbortController(controller);

    // Reset state and start loading
    setError(null);
    setLoading(true);
    setActivities([]);

    try {
      // Use progressive loading if Deep Scan is enabled
      if (useDeepScan) {
        await fetchTransactionsProgressive(trimmedAddress, controller);
      } else {
        // Standard mode - quick scan with gap detection
        const response = await fetch(
          `/api/helius-swaps?wallet=${encodeURIComponent(trimmedAddress)}&detectGaps=true`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
          setActivities(data.data || []);
          setMetadata(data.metadata || null);

          // Save to recent wallets on successful search
          saveToRecentWallets(trimmedAddress);

          // Show message if no transactions found
          if (!data.data || data.data.length === 0) {
            setError('No swap transactions found for this wallet address');
          }
        } else {
          throw new Error(data.error || 'Failed to fetch transactions');
        }
      }
    } catch (err) {
      // Don't show error if request was cancelled by user
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Request cancelled by user');
        return;
      }

      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setActivities([]);
    } finally {
      setLoading(false);
      setAbortController(null);
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

  /**
   * Cancels the current request
   */
  const handleCancelRequest = () => {
    if (abortController) {
      abortController.abort();
      setLoading(false);
      setAbortController(null);
      setError('Request cancelled');
    }
  };

  /**
   * Save wallet to recent wallets in localStorage
   */
  const saveToRecentWallets = (wallet: string) => {
    const updated = [wallet, ...recentWallets.filter(w => w !== wallet)].slice(0, 5);
    setRecentWallets(updated);
    localStorage.setItem('recentWallets', JSON.stringify(updated));
  };

  /**
   * Clear all recent wallets
   */
  const clearRecentWallets = () => {
    setRecentWallets([]);
    localStorage.removeItem('recentWallets');
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

            {/* Deep Scan Toggle */}
            <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
              <input
                id="deep-scan"
                type="checkbox"
                checked={useDeepScan}
                onChange={(e) => setUseDeepScan(e.target.checked)}
                disabled={loading}
                className="w-5 h-5 text-blue-600 bg-white dark:bg-slate-600 border-slate-300 dark:border-slate-500 rounded focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="flex-1">
                <label
                  htmlFor="deep-scan"
                  className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer select-none"
                >
                  🔍 Deep Scan (Complete History)
                </label>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Scans ALL transactions to find every swap. Slower but more thorough (may take 2-5 minutes for wallets with 10,000+ transactions).
                </p>
              </div>
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

          {/* Recent Wallets */}
          {recentWallets.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Recent Wallets
                </span>
                <button
                  onClick={clearRecentWallets}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  Clear All
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentWallets.map((wallet, idx) => (
                  <button
                    key={idx}
                    onClick={() => setWalletAddress(wallet)}
                    className="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-md transition-colors font-mono"
                    title={wallet}
                  >
                    {wallet.slice(0, 4)}...{wallet.slice(-4)}
                  </button>
                ))}
              </div>
            </div>
          )}

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

        {/* Progress Indicator */}
        {loading && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md p-8 mb-6">
            <div className="max-w-2xl mx-auto">
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {progressMessage || (useDeepScan ? 'Initializing deep scan...' : 'Fetching transactions...')}
                  </span>
                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                    {progressPercent}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Progress Stats (Deep Scan Mode) */}
              {useDeepScan && progressData && (
                <div className="mb-6 grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {progressData.foundSwaps}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Swaps Found</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                      {progressData.processedSignatures.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Processed</div>
                  </div>
                  <div className="text-center p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">
                      {progressData.totalSignatures.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">Total</div>
                  </div>
                </div>
              )}

              {/* Spinner and Info */}
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center justify-center gap-3 text-slate-600 dark:text-slate-400">
                  <svg
                    className="animate-spin h-6 w-6 text-blue-600"
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
                  <p className="text-sm">
                    {useDeepScan
                      ? 'Deep scan in progress - processing complete transaction history'
                      : 'This may take 30-60 seconds for wallets with many transactions'}
                  </p>
                </div>

                {/* Cancel Button */}
                <button
                  onClick={handleCancelRequest}
                  className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors border border-red-200 dark:border-red-800"
                >
                  Cancel Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View Toggle and Results */}
        {!loading && activities.length > 0 && (
          <>
            {/* Metadata Badge (RPC Fallback Indicator) */}
            {metadata && metadata.rpcFallbackCount > 0 && (
              <div className="flex justify-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                    Deep Scan Active: {metadata.rpcFallbackCount} transaction{metadata.rpcFallbackCount > 1 ? 's' : ''} found via RPC fallback
                  </span>
                  <span className="text-xs text-purple-700 dark:text-purple-300">
                    ({metadata.totalCount} total)
                  </span>
                </div>
              </div>
            )}

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
      </div>
    </div>
  );
}
