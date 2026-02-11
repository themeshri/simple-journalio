# Codebase Concerns

**Analysis Date:** 2026-02-10

## Tech Debt

**In-Memory Caching:**
- Issue: RPC transaction cache is in-memory only and lost on server restart
- Files: `lib/rpc-parser.ts` (lines with cache implementation)
- Impact: Repeated expensive RPC calls after server restarts, degraded performance
- Fix approach: Implement Redis or database-backed caching with proper TTL

**Rate Limiting Implementation:**
- Issue: Simple delay-based rate limiting causes ~20-30 429 errors when fetching 50 RPC transactions
- Files: `lib/helius.ts`, `lib/rpc-parser.ts`
- Impact: Failed requests, incomplete data, poor user experience
- Fix approach: Implement exponential backoff, request queuing, or better retry logic

**Missing Price Data:**
- Issue: USD values and P/L calculations removed due to unreliable price API
- Files: `lib/prices.ts` (deprecated), `types/index.ts` (optional USD fields)
- Impact: Users can only see token amounts, no profit/loss insights
- Fix approach: Integrate reliable price API (Jupiter, Birdeye) or on-chain price discovery

## Performance Bottlenecks

**RPC Fallback Parallelization:**
- Problem: 50 parallel RPC requests overwhelm free tier limits
- Files: `lib/rpc-parser.ts` lines around `fetchTransactionsBatch`
- Cause: Aggressive parallel processing without proper throttling
- Improvement path: Implement request batching with configurable concurrency limits

**Deep Scan Mode:**
- Problem: Complete history scan can take 2-5 minutes for large wallets
- Files: `app/page.tsx` (progressive loading), `app/api/helius-swaps/route.ts`
- Cause: Sequential processing of all transactions without optimization
- Improvement path: Server-side streaming, background processing, or pagination improvements

**Token Metadata Fetching:**
- Problem: Refetched on every request, no persistent caching
- Files: `lib/tokens.ts`
- Cause: No caching layer for token metadata
- Improvement path: Implement persistent caching with background refresh

## Scaling Limits

**Transaction History Coverage:**
- Current capacity: First 50 missing signatures from Enhanced API
- Limit: Wallets with 900+ missing transactions get incomplete coverage
- Scaling path: Implement pagination for RPC fallback, background processing

**API Rate Limits:**
- Current capacity: ~150 requests/minute (Helius free tier)
- Limit: Multiple concurrent users will hit rate limits quickly
- Scaling path: Upgrade to paid Helius tier, implement request queuing

## Fragile Areas

**Transaction Classification Logic:**
- Files: `lib/transactions.ts` (swap classification functions)
- Why fragile: Complex logic for detecting buy/sell/swap types, many edge cases
- Safe modification: Ensure comprehensive test coverage before changes
- Test coverage: Partial - needs more integration tests

**Progressive Loading State Management:**
- Files: `app/page.tsx` (progressive loading logic)
- Why fragile: Complex state synchronization between progress and UI updates
- Safe modification: Refactor into custom hook, add more error boundaries
- Test coverage: None detected for complex state scenarios

## Missing Critical Features

**Persistent Data Storage:**
- Problem: No database, all data refetched on each request
- Blocks: User history, saved wallets, analytics over time
- Priority: Medium - affects user experience but not core functionality

**Error Recovery:**
- Problem: Limited error recovery options when API calls fail
- Blocks: Users stuck when Helius API is down or rate limited
- Priority: High - core application functionality

**Request Cancellation:**
- Problem: Only works for top-level requests, not individual RPC calls
- Blocks: Users can't fully cancel long-running deep scans
- Priority: Medium - user experience issue

## Security Considerations

**API Key Exposure:**
- Risk: Client-side code could potentially expose patterns about API usage
- Files: All API integration files
- Current mitigation: API key only used server-side
- Recommendations: Audit for any client-side API key references

**Input Validation:**
- Risk: Wallet address validation is basic regex only
- Files: `app/page.tsx`, `lib/helius.ts`
- Current mitigation: Basic format validation
- Recommendations: Add checksum validation, length limits

## Test Coverage Gaps

**API Route Testing:**
- What's not tested: `/api/helius-swaps` endpoint integration
- Files: `app/api/helius-swaps/route.ts`
- Risk: API contract changes could break frontend integration unnoticed
- Priority: High - core application functionality

**Error Scenarios:**
- What's not tested: Network failures, API timeouts, malformed responses
- Files: All async API integration code
- Risk: Poor error handling in production edge cases
- Priority: Medium - affects reliability

**Progressive Loading Logic:**
- What's not tested: Complex state management during deep scans
- Files: `app/page.tsx` (progressive loading functions)
- Risk: State corruption, UI inconsistencies during long operations
- Priority: Medium - affects user experience

**Transaction Classification Edge Cases:**
- What's not tested: Multi-hop swaps, flash loans, complex DeFi interactions
- Files: `lib/transactions.ts`
- Risk: Misclassified transactions, incorrect P/L calculations
- Priority: High - affects data accuracy

---

*Concerns audit: 2026-02-10*