import type { PageLoad } from './$types';

export interface InsightSummary {
  id: string;
  slug: string;
  title: string;
  report_type: string;
  report_date: string;
  published_at: string | null;
  preview: string | null;
  market_status: { regime: string; btc_risk: string; altcoin: string; social: string } | null;
}

// Server-side load so the list renders into the HTML (crawlable).
export const load: PageLoad = async ({ fetch }) => {
  const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:5050/api/v1';
  try {
    const res = await fetch(`${base}/insights`);
    const json = await res.json();
    return { items: (json?.data?.items ?? []) as InsightSummary[] };
  } catch {
    return { items: [] as InsightSummary[] };
  }
};
