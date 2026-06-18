// Compact, dashboard-friendly formatters.

export const fmtUsd = (value: number | null | undefined, opts: { compact?: boolean } = {}): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  if (opts.compact) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(value);
  }
  const digits = value < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits }).format(value);
};

// Currency-aware price formatter for plan pricing (USD, TZS, …).
const MONEY: Record<string, { symbol: string; space: boolean; decimals: number }> = {
  USD: { symbol: '$', space: false, decimals: 2 },
  TZS: { symbol: 'TSh', space: true, decimals: 0 }
};
export const fmtMoney = (value: number | null | undefined, currency = 'USD'): string => {
  const v = Number(value ?? 0);
  const c = MONEY[currency];
  if (!c) {
    const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(v);
    return `${num} ${currency}`;
  }
  const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: c.decimals }).format(v);
  return `${c.symbol}${c.space ? ' ' : ''}${num}`;
};

export const CURRENCIES = ['USD', 'TZS'];

export const fmtPct = (value: number | null | undefined, digits = 2): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
};

export const fmtNum = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
};

// Tailwind text color for a signed change.
export const changeColor = (value: number | null | undefined): string => {
  if (value == null || !Number.isFinite(value)) return 'text-muted';
  return value >= 0 ? 'text-mint' : 'text-danger';
};

// Map qualitative signals → pill colors.
export const signalColor = (signal: string | null | undefined): string => {
  switch (signal) {
    case 'Hot':
    case 'Strong':
    case 'Very strong vs BTC':
    case 'Strong DCA window':
    case 'Extreme accumulation zone':
    case 'Risk-on':
      return 'bg-mint/15 text-mint';
    case 'Improving':
    case 'Accumulation possible':
    case 'Accumulation':
    case 'Strong vs BTC':
      return 'bg-accent/15 text-accent';
    case 'Overheated':
    case 'Distribution':
    case 'Very weak vs BTC':
    case 'Not attractive':
      return 'bg-danger/15 text-danger';
    case 'Cool-off':
    case 'Watch zone':
    case 'Neutral':
      return 'bg-warn/15 text-warn';
    default:
      return 'bg-edge text-muted';
  }
};
