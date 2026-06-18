// Human labels for the DB-driven feature & limit keys. UI only — the source of
// truth for which plan has what is always the backend.

export const FEATURE_LABELS: Record<string, string> = {
  access_overview: 'Market overview',
  access_btc_risk_dashboard: 'BTC Risk Dashboard',
  access_btc_cycle_lab: 'BTC Cycle Lab',
  access_altcoin_btc_lab: 'Altcoin vs BTC Lab',
  access_ecosystem_rankings: 'Ecosystem Rankings',
  access_sector_rankings: 'Sector Rankings',
  access_social_metrics: 'Social Metrics',
  access_watchlist: 'Watchlist',
  access_alerts: 'Watchlist alerts',
  access_premium_reports: 'Premium reports',
  access_weekly_reports: 'Weekly reports',
  access_model_watchlists: 'Model watchlists',
  access_advanced_filters: 'Advanced filters',
  access_onchain_metrics: 'On-chain metrics',
  access_export_reports: 'Export / share reports'
};

export const LIMIT_LABELS: Record<string, string> = {
  max_watchlist_items: 'Watchlist items',
  max_alerts: 'Alerts',
  max_custom_indicators: 'Custom indicators',
  max_saved_reports: 'Saved reports',
  max_compared_coins: 'Compared coins',
  max_history_years: 'Historical data (years)',
  data_refresh_minutes: 'Data delay (minutes)'
};

// Display order for feature lists on pricing/account cards.
export const FEATURE_ORDER = Object.keys(FEATURE_LABELS);

export const fmtLimit = (key: string, value: number | null): string => {
  if (value === null || value === undefined) return 'Unlimited';
  if (key === 'data_refresh_minutes') return value === 0 ? 'Real-time' : `${value} min delay`;
  if (value >= 100 && key !== 'max_history_years') return `${value}+`;
  return String(value);
};
