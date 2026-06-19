<script lang="ts">
  import { page } from '$app/stores';

  type JsonLd = Record<string, unknown>;
  interface Props {
    title: string;
    description: string;
    image?: string; // absolute or root-relative
    type?: string; // og:type
    noindex?: boolean; // utility/private pages
    canonical?: string; // override
    home?: boolean; // use `title` verbatim (no " · Pastatrade" suffix)
    jsonLd?: JsonLd | JsonLd[];
  }
  let { title, description, image = '/hero-img.png', type = 'website', noindex = false, canonical, home = false, jsonLd }: Props = $props();

  const SITE = 'Pastatrade';
  const origin = $derived($page.url.origin);
  const url = $derived(canonical ?? `${origin}${$page.url.pathname}`);
  const fullTitle = $derived(home || title.includes(SITE) ? title : `${title} · ${SITE}`);
  const imageUrl = $derived(image.startsWith('http') ? image : `${origin}${image}`);
  const robots = $derived(noindex ? 'noindex, nofollow' : 'index, follow');
  const blocks = $derived(jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : []);
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <meta name="robots" content={robots} />
  <link rel="canonical" href={url} />

  <!-- Open Graph -->
  <meta property="og:type" content={type} />
  <meta property="og:site_name" content={SITE} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={url} />
  <meta property="og:image" content={imageUrl} />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={fullTitle} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={imageUrl} />

  {#each blocks as block}
    {@html '<script type="application/ld+json">' + JSON.stringify(block) + '<' + '/script>'}
  {/each}
</svelte:head>
