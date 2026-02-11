# Architecture

**Analysis Date:** 2026-02-10

## Pattern Overview

**Overall:** Next.js App Router with Client-Side Data Fetching

**Key Characteristics:**
- Server-side API routes with client-side consumption
- Hybrid blockchain data fetching (Enhanced API + RPC fallback)
- Component-based UI with dynamic imports for code splitting
- Stateful client components for real-time progress tracking

## Layers

**Presentation Layer:**
- Purpose: User interface and interaction handling
- Location: `app/` and `components/`
- Contains: React components, pages, layout definitions
- Depends on: API routes, utility libraries
- Used by: End users via browser

**API Layer:**
- Purpose: Server-side transaction processing and data aggregation
- Location: `app/api/`
- Contains: REST endpoint handlers, business logic orchestration
- Depends on: Library layer for blockchain integration
- Used by: Frontend components via fetch requests

**Business Logic Layer:**
- Purpose: Core transaction processing, blockchain interaction, data transformation
- Location: `lib/`
- Contains: Helius integration, RPC parsing, transaction classification, token metadata
- Depends on: External APIs (Helius, Solana RPC)
- Used by: API routes

**Type Layer:**
- Purpose: TypeScript type definitions and interfaces
- Location: `types/`
- Contains: Complete type system for blockchain data, API responses, UI state
- Depends on: Nothing (pure types)
- Used by: All other layers

## Data Flow

**Primary Transaction Flow:**

1. User inputs wallet address in `app/page.tsx`
2. Frontend calls `/api/helius-swaps` with parameters
3. API route orchestrates data fetching via `lib/transactions.ts`
4. Enhanced API fetched first via `lib/helius.ts`
5. Gap detection identifies missing transactions via `lib/rpc-parser.ts`
6. RPC fallback fetches missing transactions in batches
7. Token metadata fetched via `lib/tokens.ts`
8. Transactions classified and reclassified for trade cycles
9. Processed data returned to frontend as `DeFiActivity[]`
10. UI renders via `TransactionTable` or `TradeSummary` components

**State Management:**
- Local React state for UI interactions and loading states
- No global state management (Redux/Zustand)
- localStorage for recent wallet addresses only

## Key Abstractions

**DeFiActivity:**
- Purpose: Standardized representation of swap transactions
- Examples: `types/index.ts` lines 80-196
- Pattern: Rich domain object with computed properties (isBuy, isSell, tradedCoin)

**HeliusTransaction:**
- Purpose: Raw blockchain transaction data from Helius API
- Examples: `types/index.ts` lines 464-519
- Pattern: External API data contract mapping

**TradeGroup:**
- Purpose: Aggregation of buy/sell activities for P/L tracking
- Examples: `types/index.ts` lines 237-357
- Pattern: Aggregate root with computed metrics

## Entry Points

**Web Application:**
- Location: `app/page.tsx`
- Triggers: Browser navigation
- Responsibilities: Main UI, wallet input, view mode management, progress tracking

**API Endpoint:**
- Location: `app/api/helius-swaps/route.ts`
- Triggers: HTTP GET requests from frontend
- Responsibilities: Transaction processing orchestration, parameter validation, response formatting

**Transaction Processor:**
- Location: `lib/transactions.ts`
- Triggers: API route invocation
- Responsibilities: Hybrid data fetching, transaction classification, trade cycle calculation

## Error Handling

**Strategy:** Graceful degradation with user-friendly messages

**Patterns:**
- API level: Try-catch with custom error types (`ApiError`, `TransactionProcessingError`)
- Network level: Retry logic with exponential backoff
- UI level: Error boundaries and inline error displays with retry buttons
- Rate limiting: 429 errors logged but don't break processing

## Cross-Cutting Concerns

**Logging:** Console-based logging with structured prefixes (`[helius]`, `[rpc]`)

**Validation:** 
- Wallet address format validation via regex
- Transaction validation before processing
- API response validation

**Caching:**
- RPC transactions: 24-hour in-memory cache with TTL
- Token metadata: No caching (fetched per request)
- Frontend: Dynamic imports for code splitting

**Rate Limiting:**
- 400ms delays between RPC requests
- Respect Helius free tier limits (~150 requests/minute)

---

*Architecture analysis: 2026-02-10*