import type { RequestHandler } from './$types';

const SITE = 'https://pastatrade101.com';

// Public, indexable pages only.
const PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.8' },
  { path: '/journey', changefreq: 'monthly', priority: '0.6' }
];

export const prerender = true;

export const GET: RequestHandler = () => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (p) =>
      `  <url>\n    <loc>${SITE}${p.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
};
