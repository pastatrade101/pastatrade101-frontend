<script lang="ts">
  import { goto } from '$app/navigation';
  import { Upload } from '@lucide/svelte';
  import { apiUpload } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  let asset = $state<'BTC' | 'ETH'>('BTC');
  let source = $state('coingecko');
  let file = $state<File | null>(null);
  let busy = $state(false);
  let error = $state('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let summary = $state<any>(null);

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const onFile = (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
    file = f;
  };

  const upload = async () => {
    if (!file) {
      error = 'Choose a CSV file first.';
      return;
    }
    busy = true;
    error = '';
    summary = null;
    try {
      const text = await file.text();
      summary = await apiUpload(`/admin/data-import/log-regression?asset=${asset}&source=${encodeURIComponent(source)}`, text, 'text/csv');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Import failed.';
    } finally {
      busy = false;
    }
  };
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Admin · Log Regression CSV Import</h1>
  <p class="text-sm text-muted">Import daily price history for BTC or ETH. Accepts CoinGecko, CryptoDataDownload, CoinMarketCap or custom CSV exports.</p>
</header>

<div class="mb-4 flex flex-wrap gap-2 text-sm">
  <a href="/admin/charts/log-regression-settings" class="btn-ghost">Settings</a>
  <a href="/app/charts/logarithmic-regression" class="btn-ghost">View charts</a>
</div>

{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<div class="card max-w-xl space-y-3">
  <div class="flex flex-wrap items-end gap-3">
    <div>
      <span class="text-xs font-medium text-muted">Asset</span>
      <div class="mt-1 inline-flex overflow-hidden rounded-lg border border-edge text-sm">
        {#each ['BTC', 'ETH'] as a}
          <button class="px-4 py-1.5 font-medium {asset === a ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (asset = a as 'BTC' | 'ETH')}>{a}</button>
        {/each}
      </div>
    </div>
    <label class="text-xs text-muted">Source name
      <input class="input mt-1" bind:value={source} placeholder="coingecko" />
    </label>
  </div>

  <div>
    <label class="text-xs font-medium text-muted" for="csv">CSV file</label>
    <input id="csv" type="file" accept=".csv,text/csv" class="mt-1 block w-full text-sm text-soft file:mr-3 file:rounded-lg file:border file:border-edge file:bg-panel-2 file:px-3 file:py-1.5 file:text-sm file:text-soft" onchange={onFile} />
    <p class="mt-1 text-[11px] text-muted">Expected columns (any of): date / snapped_at, price or close, plus optional open, high, low, volume, market_cap. Dates are normalized to YYYY-MM-DD; duplicate dates are merged.</p>
  </div>

  <button class="btn-primary" disabled={busy || !file} onclick={upload}><Upload class="h-4 w-4" /> {busy ? 'Importing…' : `Import ${asset} CSV`}</button>
</div>

{#if summary}
  <div class="card mt-4 max-w-xl border-mint/30 bg-mint/5">
    <p class="stat-label text-mint">Import complete</p>
    <div class="mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      <div><p class="text-[11px] text-muted">Rows imported</p><p class="font-semibold text-strong">{summary.rows_imported}</p></div>
      <div><p class="text-[11px] text-muted">First date</p><p class="font-semibold text-soft">{summary.first_date ?? '—'}</p></div>
      <div><p class="text-[11px] text-muted">Last date</p><p class="font-semibold text-soft">{summary.last_date ?? '—'}</p></div>
      <div><p class="text-[11px] text-muted">Errors</p><p class="font-semibold {summary.errors?.length ? 'text-warn' : 'text-mint'}">{summary.errors?.length ?? 0}</p></div>
    </div>
    {#if summary.errors?.length}
      <ul class="mt-2 space-y-0.5 text-[11px] text-warn">
        {#each summary.errors.slice(0, 8) as err}<li>• {err}</li>{/each}
      </ul>
    {/if}
    <p class="mt-2 text-[11px] text-muted">Regression bands were recalculated automatically. View them on the charts page.</p>
  </div>
{/if}
