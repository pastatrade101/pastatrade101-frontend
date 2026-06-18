<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, FileText } from '@lucide/svelte';
  import { api } from '$lib/api';
  import ReportStatusBadge from '$lib/components/ReportStatusBadge.svelte';

  interface ReportListItem {
    id: string;
    slug: string;
    title: string;
    report_type: string;
    audience: string;
    language: string;
    report_date: string;
    published_at: string | null;
    preview: string | null;
    status: string;
    cover_image_url: string | null;
    view: 'full' | 'preview';
  }

  let items = $state<ReportListItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let filter = $state<'all' | 'daily' | 'weekly' | 'monthly'>('all');

  const load = async () => {
    loading = true;
    error = '';
    try {
      const q = filter === 'all' ? '' : `?type=${filter}`;
      items = (await api<{ items: ReportListItem[] }>(`/reports${q}`, { auth: true })).items;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load reports.';
    } finally {
      loading = false;
    }
  };

  onMount(load);
  $effect(() => {
    filter;
    load();
  });
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Pastatrade Reports</h1>
  <p class="text-sm text-muted">Ready-made market intelligence from BTC risk, on-chain data, social metrics, Alt/BTC strength and ecosystem rotation.</p>
</header>

<div class="mb-4 flex flex-wrap items-center gap-2">
  <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
    {#each ['all', 'daily', 'weekly', 'monthly'] as f}
      <button class="px-3 py-1.5 font-medium capitalize transition-colors {filter === f ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (filter = f as typeof filter)}>{f}</button>
    {/each}
  </div>
  <div class="ml-auto flex gap-2 text-xs">
    <a href="/app/reports/daily" class="btn-ghost">Latest daily</a>
    <a href="/app/reports/weekly" class="btn-ghost">Latest weekly</a>
    <a href="/app/reports/monthly" class="btn-ghost">Latest monthly</a>
  </div>
</div>

{#if error}<div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

{#if loading}
  <p class="text-sm text-muted">Loading reports…</p>
{:else if !items.length}
  <div class="card text-center text-sm text-muted">
    <FileText class="mx-auto mb-2 h-6 w-6 text-muted" />
    No published reports yet. Check back soon.
  </div>
{:else}
  <div class="grid gap-3 md:grid-cols-2">
    {#each items as r (r.id)}
      <a href="/app/reports/{r.slug}" class="card block overflow-hidden p-0 transition-colors hover:border-accent/40">
        {#if r.cover_image_url}
          <img src={r.cover_image_url} alt="" class="h-32 w-full object-cover" />
        {/if}
        <div class="p-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5">
            <ReportStatusBadge type={r.report_type} audience={r.audience} />
            {#if r.language === 'sw'}<span class="pill bg-panel-2 text-soft">SW</span>{/if}
          </div>
          {#if r.view === 'preview'}<span class="pill bg-edge text-muted"><Lock class="h-3 w-3" /> Preview</span>{/if}
        </div>
        <h2 class="mt-2 text-sm font-semibold text-strong">{r.title}</h2>
        {#if r.preview}<p class="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{r.preview}</p>{/if}
        <p class="mt-2 text-[11px] text-muted">{r.published_at ? new Date(r.published_at).toLocaleDateString() : r.report_date}</p>
        </div>
      </a>
    {/each}
  </div>
{/if}
