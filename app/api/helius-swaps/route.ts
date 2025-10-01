/**
 * Helius Swaps API Route
 * GET /api/helius-swaps?wallet=<address>
 *
 * Fetches and processes all swap transactions for a given Solana wallet address
 * using the Helius Enhanced API and Jupiter Price API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processAllTransactions } from '@/lib/transactions';
import { DeFiActivity } from '@/types';

/**
 * Wallet address validation regex for Solana
 * Solana addresses are 32-44 characters, base58 encoded
 */
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Validate Solana wallet address format
 */
function isValidSolanaAddress(address: string): boolean {
  return SOLANA_ADDRESS_REGEX.test(address);
}

/**
 * GET /api/helius-swaps
 *
 * Query Parameters:
 * - wallet (required): Solana wallet address to fetch transactions for
 *
 * Response Format:
 * {
 *   success: true,
 *   data: DeFiActivity[],
 *   total: number,
 *   wallet: string,
 *   message?: string
 * }
 *
 * Error Responses:
 * - 400: Missing or invalid wallet parameter
 * - 500: Transaction processing error
 */
export async function GET(request: NextRequest) {
  try {
    // Extract wallet address from query parameters
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('wallet');

    // Validate wallet parameter presence
    if (!walletAddress) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameter: wallet',
          message: 'Please provide a wallet address as a query parameter',
        },
        { status: 400 }
      );
    }

    // Validate wallet address format
    if (!isValidSolanaAddress(walletAddress)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address',
          message: 'The provided wallet address is not a valid Solana address. Solana addresses are 32-44 characters long and base58 encoded.',
        },
        { status: 400 }
      );
    }

    console.log(`[api/helius-swaps] Processing request for wallet: ${walletAddress}`);

    // Process all transactions for the wallet
    const activities: DeFiActivity[] = await processAllTransactions(walletAddress);

    console.log(`[api/helius-swaps] Successfully processed ${activities.length} activities`);

    // Return successful response
    return NextResponse.json(
      {
        success: true,
        data: activities,
        total: activities.length,
        wallet: walletAddress,
        message: activities.length === 0
          ? 'No swap transactions found for this wallet'
          : `Successfully processed ${activities.length} swap transactions`,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );

  } catch (error) {
    console.error('[api/helius-swaps] Error processing transactions:', error);

    // Determine error message
    const errorMessage = error instanceof Error
      ? error.message
      : 'An unknown error occurred while processing transactions';

    // Return error response
    return NextResponse.json(
      {
        success: false,
        error: 'Transaction processing failed',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
