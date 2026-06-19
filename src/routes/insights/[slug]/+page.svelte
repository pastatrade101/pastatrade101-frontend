<script lang="ts">
  import { ArrowLeft, ArrowRight, Lock } from '@lucide/svelte';
  import Seo from '$lib/components/Seo.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  let { data } = $props();

  const r = $derived(data.report);
  const ms = $derived(r.market_status);
  // market_status is shown as chips; skip its text section to avoid duplication.
  const bodySections = $derived(data.sections.filter((s) => s.section_key !== 'market_status' && s.section_key !== 'disclaimer' && s.content));
  const disclaimer = $derived(data.sections.find((s) => s.section_key === 'disclaimer'));

  const dateStr = $derived(r.published_at ? new Date(r.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : r.report_date);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const articleLd = $derived({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: r.title,
    datePublished: r.published_at ?? r.report_date,
    dateModified: r.published_at ?? r.report_date,
    author: { '@type': 'Organization', name: 'Pastatrade', url: 'https://pastatrade101.com' },
    publisher: { '@type': 'Organization', name: 'Pastatrade', logo: { '@type': 'ImageObject', url: 'https://pastatrade101.com/favicon.svg' } }
  });
</script>

<Seo title={r.title} description={r.preview ?? `Pastatrade ${cap(r.report_type)} market insight.`} type="article" jsonLd={articleLd} />

<a href="/insights" class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-soft"><ArrowLeft class="h-4 w-4" /> All insights</a>

<article class="mx-auto max-w-3xl space-y-4">
  <header>
    <div class="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
      <span class="pill bg-panel-2 text-soft">{cap(r.report_type)}</span>
      <span>{dateStr}</span>
    </div>
    <h1 class="mt-2 text-2xl font-bold tracking-tight text-strong sm:text-3xl">{r.title}</h1>
  </header>

  {#if ms}
    <div class="hero-card grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div><p class="stat-label">Regime</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.regime}</p></div>
      <div><p class="stat-label">BTC risk</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.btc_risk}</p></div>
      <div><p class="stat-label">Altcoin</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.altcoin}</p></div>
      <div><p class="stat-label">Social</p><p class="mt-0.5 text-sm font-semibold text-strong">{ms.social}</p></div>
    </div>
  {/if}

  {#each bodySections as s (s.section_key)}
    <section class="card">
      <h2 class="text-sm font-semibold text-strong">{s.section_title}</h2>
      <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-soft">{s.content}</p>
    </section>
  {/each}

  <!-- Premium gate / conversion -->
  <div class="card border border-mint/30 bg-mint/5 text-center">
    <div class="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-mint/15 text-mint"><Lock class="h-5 w-5" /></div>
    <h2 class="text-lg font-semibold text-strong">Get the full breakdown</h2>
    <p class="mx-auto mt-1 max-w-md text-sm text-muted">
      On-chain reads, Alt/BTC strength, ecosystem rotation, strongest signals and the premium takeaway are part of the full member report.
    </p>
    <a href="/register" class="btn-primary mt-4 inline-flex px-6 py-3 text-base">Read the full report — start free <ArrowRight class="h-4 w-4" /></a>
  </div>

  {#if disclaimer?.content}
    <p class="text-xs leading-relaxed text-muted">{disclaimer.content}</p>
  {:else}
    <Disclaimer />
  {/if}
</article>
