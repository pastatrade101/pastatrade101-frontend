import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export interface InsightSection {
  section_key: string;
  section_title: string;
  content: string | null;
}
export interface InsightReport {
  id: string;
  slug: string;
  title: string;
  report_type: string;
  report_date: string;
  published_at: string | null;
  preview: string | null;
  market_status: { regime: string; btc_risk: string; altcoin: string; social: string } | null;
  language: string;
}

// Server-side load so the published, non-premium content is in the HTML.
export const load: PageLoad = async ({ fetch, params }) => {
  const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:5050/api/v1';
  const res = await fetch(`${base}/insights/${params.slug}`);
  if (!res.ok) throw error(404, 'Insight not found');
  const json = await res.json();
  if (!json?.data?.report) throw error(404, 'Insight not found');
  return json.data as { report: InsightReport; sections: InsightSection[] };
};
