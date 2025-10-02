import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import TransactionTable from '../TransactionTable';
import { DeFiActivity } from '@/types';

describe('TransactionTable', () => {
  const mockActivities: DeFiActivity[] = [
    {
      signature: 'abc123def456',
      timestamp: 1704067200,
      type: 'BUY',
      status: 'success',
      fee: 5000,
      fromSymbol: 'USDC',
      toSymbol: 'BONK',
      fromAmount: 100,
      toAmount: 1000000,
      fromMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      toMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      priceImpact: 0.5,
      platform: 'Jupiter',
      isBuy: true,
    },
    {
      signature: 'xyz789abc123',
      timestamp: 1704153600,
      type: 'SELL',
      status: 'success',
      fee: 5000,
      fromSymbol: 'BONK',
      toSymbol: 'USDC',
      fromAmount: 500000,
      toAmount: 50,
      fromMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      toMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      priceImpact: 1.2,
      platform: 'Raydium',
      isBuy: false,
    },
  ];

  it('should render empty state when no activities', () => {
    render(<TransactionTable activities={[]} />);
    expect(screen.getByText('No transactions')).toBeInTheDocument();
  });

  it('should render table with activities', () => {
    const { container } = render(<TransactionTable activities={mockActivities} />);

    // Check if table is rendered
    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
  });

  it('should display transaction signatures as links', () => {
    render(<TransactionTable activities={mockActivities} />);

    // Check for Solscan links
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });

  it('should display token symbols', () => {
    render(<TransactionTable activities={mockActivities} />);

    // These should appear in the rendered output
    expect(screen.getAllByText(/USDC/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/BONK/i).length).toBeGreaterThan(0);
  });

  it('should show transaction type badges', () => {
    render(<TransactionTable activities={mockActivities} />);

    // Buy and Sell should appear as badges (may be multiple)
    expect(screen.getAllByText('Buy').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sell').length).toBeGreaterThan(0);
  });
});
