# Solana Wallet Transaction Viewer

A Next.js application for tracking and analyzing DeFi swap transactions on Solana blockchain using Helius API.

## Overview

This application fetches, processes, and displays swap transactions for Solana wallet addresses. It uses a hybrid architecture combining Helius Enhanced Transactions API (fast) with RPC fallback (complete coverage) to capture all swap transactions, including those from unindexed DEX programs.

## Key Features

- **Hybrid Transaction Fetching**: Fast Enhanced API with automatic RPC fallback for missing transactions
- **Gap Detection**: Automatically identifies and fetches transactions missing from Enhanced API
- **Token Metadata**: Automatic fetching and caching of token symbols, decimals, and names
- **Trade Cycle Analysis**: Groups buy/sell transactions into trade cycles with P/L tracking
- **Dual View Modes**: Table view for detailed transactions and Summary view for trade cycles
- **Real-time Processing**: Live transaction classification and reclassification
- **Responsive UI**: Mobile-friendly design with skeleton loaders

## Architecture

### Technology Stack

- **Framework**: Next.js 15.5.4 with App Router and Turbopack
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **HTTP Client**: Axios 1.12.2
- **Runtime**: React 19.1.0

### Project Structure

```
simple-journalio/
├── app/
│   ├── api/
│   │   └── helius-swaps/
│   │       └── route.ts          # Main API endpoint
│   ├── layout.tsx                 # Root layout
│   └── page.tsx                   # Main page component
├── components/
│   ├── index.ts                   # Component exports
│   ├── SkeletonLoader.tsx         # Loading states
│   ├── TransactionTable.tsx       # Transaction table view
│   └── TradeSummary.tsx           # Trade cycle summary view
├── lib/
│   ├── config.ts                  # Configuration (API keys)
│   ├── helius.ts                  # Helius Enhanced API client
│   ├── rpc-parser.ts              # RPC transaction parser
│   ├── transactions.ts            # Transaction processing logic
│   ├── tokens.ts                  # Token metadata fetching
│   ├── utils.ts                   # Utility functions
│   └── prices.ts                  # Price utilities (deprecated)
└── types/
    └── index.ts                   # TypeScript type definitions
```

## Core Components

### 1. API Endpoint (`/api/helius-swaps`)

**Location**: `app/api/helius-swaps/route.ts`

**Endpoint**: `GET /api/helius-swaps?wallet=<address>&detectGaps=<true|false>&signatures=<sig1,sig2>`

**Parameters**:
- `wallet` (required): Solana wallet address (32-44 chars, base58)
- `detectGaps` (optional): Enable automatic gap detection (default: false)
- `signatures` (optional): Comma-separated transaction signatures for RPC fallback

**Response**:
```json
{
  "success": true,
  "data": DeFiActivity[],
  "total": number,
  "wallet": string,
  "metadata": {
    "enhancedApiCount": number,
    "rpcFallbackCount": number,
    "totalCount": number
  }
}
```

### 2. Transaction Processing Pipeline

**Location**: `lib/transactions.ts`

**Function**: `processAllTransactions(walletAddress, options)`

**Pipeline Steps**:
1. Fetch transactions from Enhanced API
2. (Optional) Detect missing signatures via RPC comparison
3. Fetch missing transactions via RPC fallback (max 50)
4. Merge Enhanced API + RPC results (deduplication)
5. Filter valid swap transactions
6. Extract unique token mints
7. Fetch token metadata from Helius
8. Process transactions into DeFiActivity objects
9. Reclassify transaction types (first buy, buy more, sell)
10. Sort by timestamp (newest first)

**Key Features**:
- **Deduplication**: Enhanced API transactions take priority over RPC
- **Safety Limits**: Max 50 RPC transactions per request to prevent timeouts
- **Rate Limiting**: 400ms delay between RPC requests to avoid 429 errors
- **Caching**: 24-hour in-memory cache for RPC transactions

### 3. Helius Enhanced API Client

**Location**: `lib/helius.ts`

**Function**: `fetchAllSwapTransactionsWithRetry(walletAddress)`

**Features**:
- Fetches transactions using `v0/addresses/:address/transactions` endpoint
- Filters for swap-related types: SWAP, BUY, SELL, INIT_SWAP, CANCEL_SWAP, REJECT_SWAP
- Includes UNKNOWN types with 2+ token transfers (misclassified swaps)
- Automatic retry with exponential backoff (3 retries)
- Pagination support (100 transactions per page)
- Transaction validation before processing

**Limitations**:
- Only indexes transactions from recognized DEX programs (Jupiter, Raydium, Orca, etc.)
- May miss transactions from new/unindexed DEX programs

### 4. RPC Parser

**Location**: `lib/rpc-parser.ts`

**Key Functions**:

#### `fetchAllSignaturesForAddress(walletAddress, limit = 1000)`
- Fetches complete list of transaction signatures (fast, no full data)
- Uses RPC method: `getSignaturesForAddress`
- Returns array of signature strings

#### `detectMissingSignatures(walletAddress, enhancedSignatures, maxToCheck = 1000)`
- Compares Enhanced API signatures with RPC signatures
- Returns signatures present in RPC but missing from Enhanced API
- Used for automatic gap detection

#### `fetchTransactionBySignature(signature, walletAddress)`
- Fetches raw transaction via RPC `getTransaction` method
- Parses into HeliusTransaction format
- Extracts token transfers from pre/post balance changes
- 24-hour in-memory cache with TTL

#### `fetchTransactionsBatch(signatures, walletAddress)`
- Parallel fetching of multiple transactions
- Returns only successful fetches (filters out nulls)
- Rate limiting: 400ms delay between requests

**Parsing Logic**:
- Extracts token transfers by comparing `preTokenBalances` and `postTokenBalances`
- Uses `uiTokenAmount.uiAmount` (decimal-adjusted) instead of raw `amount`
- Extracts native SOL transfers from balance changes
- Determines transaction direction (incoming/outgoing)

### 5. Token Metadata

**Location**: `lib/tokens.ts`

**Function**: `fetchTokenMetadata(mints)`

**Features**:
- Fetches metadata for multiple tokens in single API call
- Uses Helius `v0/token-metadata` endpoint
- Returns symbol, name, and decimals for each token
- Handles missing/invalid tokens gracefully

### 6. Transaction Classification

**Location**: `lib/transactions.ts`

**Function**: `reclassifyTransactionType(activity, allActivities)`

**Classification Logic**:
1. **First Buy**: First time buying a token (no previous buys)
2. **Buy More**: Buying more of a token already owned
3. **Sell**: Selling a token

**Criteria**:
- Based on temporal ordering (sorted by timestamp)
- Checks if token was previously purchased
- Updates `transactionType` field

### 7. Trade Cycle Calculation

**Location**: `lib/utils.ts`

**Function**: `calculateTradeCycles(activities)`

**Features**:
- Groups transactions by token mint
- Creates cycles from first buy to final sell
- Tracks buy count, sell count, total amounts
- Calculates current balance and final balance
- Determines trade status (Active/Completed)
- Computes trade duration

**Output**: `TokenTradeCycles` object with arrays of `TradeGroup` per token

## Type Definitions

**Location**: `types/index.ts`

### Core Types

#### `HeliusTransaction`
Raw transaction data from Helius API with token transfers, account data, signatures, etc.

#### `DeFiActivity`
Processed swap transaction with:
- From/To token amounts and symbols
- Transaction type (first buy, buy more, sell)
- Timestamp, signature, status
- Buy/sell flags
- Source platform

#### `TradeGroup`
Trade cycle summary:
- Token symbol and mint
- Buy/sell counts and totals
- Current/final balance
- Start timestamp and duration
- Status (Active/Completed)

#### `TokenTradeCycles`
Map of token mint → array of TradeGroup

## API Integration

### Helius API Endpoints Used

1. **Enhanced Transactions API**
   - Endpoint: `v0/addresses/:address/transactions`
   - Purpose: Fast fetching of indexed swap transactions
   - Limit: 100 transactions per request
   - Parameters: `api-key`, `before` (pagination), `type` (transaction types)

2. **Token Metadata API**
   - Endpoint: `v0/token-metadata`
   - Purpose: Fetch token symbols, names, decimals
   - Limit: Multiple mints per request

3. **RPC API** (Standard Solana RPC)
   - Method: `getSignaturesForAddress`
     - Purpose: Get all transaction signatures for wallet
     - Fast signature-only fetch

   - Method: `getTransaction`
     - Purpose: Get full raw transaction data
     - Slow but complete coverage
     - Parameters: `encoding: jsonParsed`, `maxSupportedTransactionVersion: 0`

### Rate Limiting

- **Free Tier**: ~150 requests/minute
- **Mitigation**: 400ms delay between RPC requests
- **Safety Limit**: Max 50 RPC transactions per API call
- **Errors**: 429 errors logged but don't break processing

## Environment Variables

**Location**: `.env.local`

```env
HELIUS_API_KEY=your_api_key_here
```

Get API key from: https://www.helius.dev/

## UI Components

### Main Page (`app/page.tsx`)

**Features**:
- Wallet address input with validation
- View mode toggle (Table/Summary)
- Loading skeletons
- Error handling with retry
- Gap detection indicator badge (purple "Deep Scan Active")
- Responsive design

**Default Behavior**:
- Gap detection enabled by default (`detectGaps=true`)
- Fetches transactions on submit
- Shows metadata when RPC fallback is used

### Transaction Table (`components/TransactionTable.tsx`)

**Desktop View**:
- Sortable columns: Signature, Time, Type, Coin, From, To, Platform
- Signature links to Solscan explorer
- Color-coded buy/sell badges
- Formatted amounts (4 decimals)

**Mobile View**:
- Card-based layout
- Compact information display
- Touch-friendly interactions

### Trade Summary (`components/TradeSummary.tsx`)

**Features**:
- Trade cycle cards grouped by token
- Buy/sell statistics
- Current/final balance display
- Trade duration
- Active vs Completed status
- Responsive grid layout (1-3 columns)

### Skeleton Loaders (`components/SkeletonLoader.tsx`)

**Types**:
- `TableSkeleton`: Animated loading rows for table view
- `CardSkeleton`: Animated loading cards for summary view

## Data Flow

```
User Input (Wallet Address)
    ↓
Frontend (page.tsx)
    ↓
API Endpoint (/api/helius-swaps?wallet=X&detectGaps=true)
    ↓
Transaction Processing (lib/transactions.ts)
    ├─→ Enhanced API (lib/helius.ts) → 40-100 transactions
    ├─→ Gap Detection (lib/rpc-parser.ts) → Find missing signatures
    └─→ RPC Fallback (lib/rpc-parser.ts) → Fetch missing txs (max 50)
    ↓
Merge & Deduplicate
    ↓
Token Metadata Fetch (lib/tokens.ts)
    ↓
Transaction Classification
    ↓
Sort & Return
    ↓
Frontend Display
    ├─→ Table View (components/TransactionTable.tsx)
    └─→ Summary View (components/TradeSummary.tsx)
```

## Performance Characteristics

### Speed

- **Enhanced API Only**: ~3 seconds for 40 transactions
- **With Gap Detection**: ~7-10 seconds for 60 transactions (depends on missing count)
- **RPC Rate Limiting**: Some 429 errors expected when fetching 50 transactions

### Coverage

- **Enhanced API**: 85-95% of swap transactions
- **With Gap Detection**: 95-99% of swap transactions (limited to first 50 missing)
- **Theoretical Limit**: 944+ missing signatures may exist but only 50 are fetched

### Caching

- **RPC Transactions**: 24-hour in-memory cache
- **Token Metadata**: Fetched per request (no caching)
- **Frontend**: Browser cache for static assets

## Known Issues & Limitations

1. **Rate Limiting**
   - 50 parallel RPC requests cause ~20-30 429 errors
   - Successfully fetches ~30-40 of 50 attempted transactions
   - Could be improved with better retry logic

2. **Missing Transactions**
   - Only fetches first 50 missing signatures (safety limit)
   - Wallets with 900+ missing transactions won't get complete coverage
   - User can manually specify signatures via `&signatures=` parameter

3. **Transaction Classification**
   - Some complex multi-hop swaps may fail to extract swap data
   - Logged as "Failed to extract swap data for <signature>"
   - These transactions are skipped

4. **No Persistent Storage**
   - RPC cache is in-memory only (lost on server restart)
   - Token metadata refetched on every request
   - Could benefit from Redis or similar

5. **No Price Data**
   - USD values removed (price API was unreliable)
   - Only shows token amounts

## Usage Examples

### Basic Usage
```
GET /api/helius-swaps?wallet=2oubkNmatGszLi7vUPPAGdTQMSVrLdaoXJfu7zHZkbqz&detectGaps=true
```

### With Specific Signatures
```
GET /api/helius-swaps?wallet=4NuB8ZFSjEVWE1nJTJ5RBCRmw9VHUE2g8Q5vFza4L8wm&signatures=2qBExRFEdATfpVSpsrjwcj3YTCNUobaMkGc4fNfXCXJEaDVW1WoQkQgVNx1pFS8Ejvb1Dt4S1kSGi8iDqF4NrZUN
```

### Without Gap Detection (Fast)
```
GET /api/helius-swaps?wallet=4NuB8ZFSjEVWE1nJTJ5RBCRmw9VHUE2g8Q5vFza4L8wm
```

## Development

### Setup

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3000` (or next available port)

### Build for Production

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

## Deployment Considerations

1. **Environment Variables**: Ensure `HELIUS_API_KEY` is set
2. **API Tier**: Consider upgrading Helius plan for higher rate limits
3. **Caching**: Implement Redis for RPC transaction cache persistence
4. **Monitoring**: Add logging/monitoring for 429 errors and failed transactions
5. **Error Handling**: Current error handling is basic - could be improved

## Future Improvements

1. **Persistent Caching**: Redis or database for RPC transactions
2. **Better Rate Limiting**: Exponential backoff, request queuing
3. **Pagination**: Support for fetching more than first 50 missing transactions
4. **Price Integration**: More reliable price API or on-chain price discovery
5. **Transaction Filters**: Filter by token, date range, transaction type
6. **Export Functionality**: CSV/JSON export of transactions
7. **Analytics Dashboard**: More detailed statistics and charts
8. **Wallet Tracking**: Save favorite wallets, notifications for new transactions

## Credits

Built with Next.js, Helius API, and Tailwind CSS.
