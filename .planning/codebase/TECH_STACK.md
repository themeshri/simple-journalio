# Technology Stack

**Analysis Date:** 2026-02-10

## Languages

**Primary:**
- TypeScript 5.x - All application code, strict mode enabled
- JavaScript (ES6+) - Configuration files (jest.config.js, postcss.config.mjs)

## Runtime

**Environment:**
- Node.js (no specific version specified in package.json)
- Next.js 15.5.4 runtime

**Package Manager:**
- npm (package-lock.json not visible, but scripts use npm)
- Lockfile: Not visible in structure

## Frameworks

**Core:**
- Next.js 15.5.4 - Full-stack React framework with App Router
- React 19.1.0 - UI library
- React DOM 19.1.0 - DOM rendering

**Testing:**
- Jest 29.7.0 - Test runner
- React Testing Library 16.3.0 - Component testing
- Jest Environment JSDoc 29.7.0 - Browser environment simulation

**Build/Dev:**
- Turbopack - Next.js bundler (enabled via --turbopack flag)
- ESLint 9.x - Code linting
- PostCSS - CSS processing
- TypeScript compiler - Type checking

## Key Dependencies

**Critical:**
- Axios 1.12.2 - HTTP client for Helius API communication
- Tailwind CSS 4.x - Utility-first CSS framework
- clsx 2.1.1 - Conditional CSS class composition
- tailwind-merge 3.3.1 - Tailwind class merging utility

**Infrastructure:**
- @testing-library/jest-dom 6.9.1 - Extended Jest matchers
- @testing-library/user-event 14.6.1 - User interaction simulation
- @types/* packages - TypeScript definitions

## Configuration

**Environment:**
- `.env.local` file present - contains environment configuration
- HELIUS_API_KEY required for Helius API integration

**Build:**
- `tsconfig.json` - TypeScript configuration with strict mode
- `eslint.config.mjs` - ESLint flat configuration format
- `jest.config.js` - Jest testing configuration
- `next.config.ts` - Next.js configuration
- `postcss.config.mjs` - PostCSS configuration

## External APIs & Services

**Blockchain:**
- Helius API (Enhanced Transactions API) - Primary data source
- Solana RPC - Fallback for missing transactions
- Solscan/Solana Explorer - Transaction links

**No database or persistent storage configured**

## Platform Requirements

**Development:**
- Node.js runtime
- TypeScript 5.x
- Helius API key

**Production:**
- Next.js-compatible hosting (Vercel, Netlify, etc.)
- Environment variables configuration
- No additional infrastructure required

---

*Stack analysis: 2026-02-10*