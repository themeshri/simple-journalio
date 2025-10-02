/**
 * Solana Transaction Signature Fetcher
 * Uses getSignaturesForAddress RPC method to retrieve ALL transaction signatures
 * for a wallet address - no filtering, no timeouts like Enhanced API has.
 */

import axios from 'axios';
import { getHeliusApiKey } from './config';

// ============================================================================
// Types
// ============================================================================

interface SignatureInfo {
  signature: string;
  slot: number;
  err: any;
  memo: string | null;
  blockTime: number | null;
}

interface GetSignaturesOptions {
  limit?: number;
  before?: string;
  until?: string;
  commitment?: 'finalized' | 'confirmed' | 'processed';
}

// ============================================================================
// Constants
// ============================================================================

const HELIUS_RPC_URL = 'https://mainnet.helius-rpc.com';
const MAX_SIGNATURES_PER_REQUEST = 1000; // Solana RPC limit
const REQUEST_TIMEOUT = 30000; // 30 seconds
const RATE_LIMIT_DELAY_MS = 400; // ~150 requests/minute

// ============================================================================
// Rate Limiting
// ============================================================================

let lastRequestTime = 0;

async function respectRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < RATE_LIMIT_DELAY_MS) {
    const delay = RATE_LIMIT_DELAY_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  lastRequestTime = Date.now();
}

// ============================================================================
// Signature Fetching
// ============================================================================

/**
 * Fetch a single page of transaction signatures for an address
 * Uses Solana's getSignaturesForAddress RPC method
 */
async function fetchSignaturesPage(
  address: string,
  options: GetSignaturesOptions = {}
): Promise<SignatureInfo[]> {
  await respectRateLimit();

  const apiKey = getHeliusApiKey();
  const rpcUrl = `${HELIUS_RPC_URL}/?api-key=${apiKey}`;

  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getSignaturesForAddress',
    params: [
      address,
      {
        limit: options.limit || MAX_SIGNATURES_PER_REQUEST,
        ...(options.before && { before: options.before }),
        ...(options.until && { until: options.until }),
        commitment: options.commitment || 'finalized',
      },
    ],
  };

  try {
    const response = await axios.post<{
      result: SignatureInfo[];
      error?: { code: number; message: string };
    }>(rpcUrl, requestBody, {
      timeout: REQUEST_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.data.error) {
      throw new Error(
        `RPC error: ${response.data.error.message} (code: ${response.data.error.code})`
      );
    }

    return response.data.result || [];
  } catch (error: any) {
    if (error.response?.data?.error) {
      throw new Error(
        `RPC error: ${error.response.data.error.message || 'Unknown RPC error'}`
      );
    }
    throw new Error(`Failed to fetch signatures: ${error.message}`);
  }
}

/**
 * Fetch ALL transaction signatures for an address with pagination
 * This function will fetch the complete transaction history without
 * the filtering or timeout issues that Enhanced API has.
 *
 * @param address - Solana wallet address
 * @param maxSignatures - Maximum signatures to fetch (default: 50000)
 * @returns Array of all signature strings
 */
export async function fetchAllSignatures(
  address: string,
  maxSignatures: number = 50000
): Promise<string[]> {
  console.log(`[signatures] Fetching all signatures for ${address}...`);

  const allSignatures: string[] = [];
  let beforeSignature: string | undefined = undefined;
  let pageNumber = 0;

  while (true) {
    pageNumber++;
    console.log(
      `[signatures] Fetching page ${pageNumber} (before: ${beforeSignature || 'none'})...`
    );

    const signatureInfos = await fetchSignaturesPage(address, {
      limit: MAX_SIGNATURES_PER_REQUEST,
      before: beforeSignature,
    });

    // Stop if no signatures returned
    if (signatureInfos.length === 0) {
      console.log('[signatures] No more signatures found');
      break;
    }

    // Extract signature strings (filter out errors)
    const signatures = signatureInfos
      .filter((info) => !info.err) // Only include successful transactions
      .map((info) => info.signature);

    console.log(
      `[signatures] Received ${signatures.length} successful signatures (${signatureInfos.length} total)`
    );

    allSignatures.push(...signatures);

    // Check if we've reached the maximum limit
    if (allSignatures.length >= maxSignatures) {
      console.log(
        `[signatures] Reached maximum signature limit (${maxSignatures})`
      );
      break;
    }

    // If we got fewer than the max per request, we've reached the end
    if (signatureInfos.length < MAX_SIGNATURES_PER_REQUEST) {
      console.log(
        `[signatures] Reached end of signature history (page had ${signatureInfos.length} signatures)`
      );
      break;
    }

    // Use the last signature for pagination
    beforeSignature = signatureInfos[signatureInfos.length - 1].signature;
  }

  console.log(
    `[signatures] Fetched total of ${allSignatures.length} signatures across ${pageNumber} pages`
  );

  return allSignatures;
}

/**
 * Fetch signatures for a specific time range
 *
 * @param address - Solana wallet address
 * @param options - Options for time range filtering
 * @returns Array of signature strings
 */
export async function fetchSignaturesInRange(
  address: string,
  options: {
    startTime?: number; // Unix timestamp
    endTime?: number; // Unix timestamp
    maxSignatures?: number;
  } = {}
): Promise<string[]> {
  console.log(
    `[signatures] Fetching signatures for ${address} in time range...`
  );

  const allSignatures: string[] = [];
  let beforeSignature: string | undefined = undefined;
  let pageNumber = 0;
  const maxSignatures = options.maxSignatures || 50000;

  while (true) {
    pageNumber++;

    const signatureInfos = await fetchSignaturesPage(address, {
      limit: MAX_SIGNATURES_PER_REQUEST,
      before: beforeSignature,
    });

    if (signatureInfos.length === 0) {
      break;
    }

    // Filter by time range if specified
    let filteredInfos = signatureInfos;

    if (options.startTime || options.endTime) {
      filteredInfos = signatureInfos.filter((info) => {
        if (!info.blockTime) return false;

        if (options.startTime && info.blockTime < options.startTime) {
          return false;
        }

        if (options.endTime && info.blockTime > options.endTime) {
          return false;
        }

        return true;
      });
    }

    // Extract successful signatures
    const signatures = filteredInfos
      .filter((info) => !info.err)
      .map((info) => info.signature);

    allSignatures.push(...signatures);

    // Check limits
    if (allSignatures.length >= maxSignatures) {
      console.log(`[signatures] Reached maximum (${maxSignatures})`);
      break;
    }

    if (signatureInfos.length < MAX_SIGNATURES_PER_REQUEST) {
      break;
    }

    // If we've passed the end time, stop
    if (
      options.endTime &&
      signatureInfos[signatureInfos.length - 1].blockTime &&
      signatureInfos[signatureInfos.length - 1].blockTime! < options.endTime
    ) {
      console.log('[signatures] Reached end of time range');
      break;
    }

    beforeSignature = signatureInfos[signatureInfos.length - 1].signature;
  }

  console.log(
    `[signatures] Fetched ${allSignatures.length} signatures in range`
  );

  return allSignatures;
}
