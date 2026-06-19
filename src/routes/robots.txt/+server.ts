import type { RequestHandler } from './$types';

const SITE = 'https://pastatrade101.com';

// Crawl public marketing pages; keep the app + admin out of the index.
export const prerender = true;

export const GET: RequestHandler = () => {
  const body = `User-agent: *
Allow: /
Disallow: /app
Disallow: /admin

Sitemap: ${SITE}/sitemap.xml
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};
