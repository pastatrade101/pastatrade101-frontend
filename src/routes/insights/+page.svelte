<script lang="ts">
  import { ArrowRight, FileText } from '@lucide/svelte';
  import Seo from '$lib/components/Seo.svelte';
  let { data } = $props();

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
</script>

<Seo
  title="Market Insights"
  description="Free Bitcoin and crypto market insights from Pastatrade — BTC risk, altcoin rotation, on-chain reads and ecosystem strength, published regularly. Probability-style, not financial advice."
/>

<header class="mx-auto mb-8 max-w-2xl text-center">
  <span class="pill bg-mint/10 text-mint">Insights</span>
  <h1 class="mt-3 text-3xl font-bold tracking-tight text-strong sm:text-4xl">Pastatrade Market Insights</h1>
  <p class="mt-2 text-muted">Clear, probability-style reads on BTC risk, altcoin rotation, on-chain data and ecosystem strength — updated regularly.</p>
</header>

{#if !data.items.length}
  <div class="card mx-auto max-w-lg text-center text-sm text-muted">
    <FileText class="mx-auto mb-2 h-6 w-6 text-muted" />
    No insights published yet — check back soon.
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    {#each data.items as r (r.id)}
      <a href="/insights/{r.slug}" class="card rail-card flex flex-col transition-colors hover:border-mint/40" style="--rail: var(--c-mint)">
        <div class="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted">
          <span class="pill bg-panel-2 text-soft">{cap(r.report_type)}</span>
          <span>{fmtDate(r.published_at ?? r.report_date)}</span>
        </div>
        <h2 class="mt-2 text-base font-semibold leading-snug text-strong">{r.title}</h2>
        {#if r.preview}<p class="mt-1.5 line-clamp-3 flex-1 text-sm leading-relaxed text-muted">{r.preview}</p>{/if}
        <span class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-mint">Read insight <ArrowRight class="h-4 w-4" /></span>
      </a>
    {/each}
  </div>
{/if}

<div class="mx-auto mt-10 max-w-xl text-center">
  <a href="/register" class="btn-primary px-6 py-3 text-base">Get the full reports — start free <ArrowRight class="h-4 w-4" /></a>
</div>
