import {
  formatTokenAmount,
  isBaseCurrency,
  isStablecoin
} from '../tokens';
import { WSOL_MINT, STABLECOIN_MINTS } from '@/types';

describe('Token Utilities', () => {
  describe('formatTokenAmount', () => {
    it('should format USDC amounts correctly (6 decimals)', () => {
      expect(formatTokenAmount(1000000, 6)).toBe(1.0);
      expect(formatTokenAmount(5500000, 6)).toBe(5.5);
      expect(formatTokenAmount(100, 6)).toBe(0.0001);
    });

    it('should format SOL amounts correctly (9 decimals)', () => {
      expect(formatTokenAmount(1000000000, 9)).toBe(1.0);
      expect(formatTokenAmount(500000000, 9)).toBe(0.5);
      expect(formatTokenAmount(1500000000, 9)).toBe(1.5);
    });

    it('should format BONK amounts correctly (5 decimals)', () => {
      expect(formatTokenAmount(100000, 5)).toBe(1.0);
      expect(formatTokenAmount(50000, 5)).toBe(0.5);
    });

    it('should handle zero amounts', () => {
      expect(formatTokenAmount(0, 6)).toBe(0);
      expect(formatTokenAmount(0, 9)).toBe(0);
    });

    it('should handle large amounts', () => {
      expect(formatTokenAmount(1000000000000, 6)).toBe(1000000);
      expect(formatTokenAmount(1000000000000000, 9)).toBe(1000000);
    });
  });

  describe('isBaseCurrency', () => {
    it('should identify SOL as base currency', () => {
      expect(isBaseCurrency('SOL', WSOL_MINT)).toBe(true);
      expect(isBaseCurrency('sol', WSOL_MINT)).toBe(true);
    });

    it('should identify USDC as base currency', () => {
      expect(isBaseCurrency('USDC', STABLECOIN_MINTS.USDC)).toBe(true);
      expect(isBaseCurrency('usdc', STABLECOIN_MINTS.USDC)).toBe(true);
    });

    it('should identify USDT as base currency', () => {
      expect(isBaseCurrency('USDT', STABLECOIN_MINTS.USDT)).toBe(true);
    });

    it('should identify DAI as base currency', () => {
      expect(isBaseCurrency('DAI', 'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o')).toBe(true);
    });

    it('should not identify random tokens as base currency', () => {
      expect(isBaseCurrency('BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')).toBe(false);
      expect(isBaseCurrency('WIF', 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm')).toBe(false);
    });
  });

  describe('isStablecoin', () => {
    it('should identify USDC as stablecoin', () => {
      expect(isStablecoin('USDC', STABLECOIN_MINTS.USDC)).toBe(true);
      expect(isStablecoin('usdc', STABLECOIN_MINTS.USDC)).toBe(true);
    });

    it('should identify USDT as stablecoin', () => {
      expect(isStablecoin('USDT', STABLECOIN_MINTS.USDT)).toBe(true);
    });

    it('should identify DAI as stablecoin', () => {
      expect(isStablecoin('DAI', 'EjmyN6qEC1Tf1JxiG1ae7UTJhUxSwk1TCWNWqxWV4J6o')).toBe(true);
    });

    it('should not identify SOL as stablecoin', () => {
      expect(isStablecoin('SOL', WSOL_MINT)).toBe(false);
    });

    it('should not identify random tokens as stablecoin', () => {
      expect(isStablecoin('BONK', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263')).toBe(false);
    });
  });
});
