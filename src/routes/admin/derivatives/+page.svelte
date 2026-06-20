<script lang="ts">
  import { Flame, RefreshCw, Info } from '@lucide/svelte';
  import { api } from '$lib/api';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let diag = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let syncing = $state(false);
  let message = $state('');
  let started = $state(false);

  const load = async () => {
    loading = true;
    error = '';
    try {
      diag = await api('/admin/derivatives/diagnostics', { auth: true });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load diagnostics.';
    } finally {
      loading = false;
    }
  };
  $effect(() => {
    if (started) return;
    started = true;
    void load();
  });

  const syncNow = async () => {
    syncing = true;
    message = '';
    error = '';
    try {
      const res: any = await api('/admin/derivatives/sync', { method: 'POST', auth: true });
      message = res?.stored ? 'Synced — today’s row updated.' : 'Bitget data unavailable — nothing stored.';
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Sync failed.';
    } finally {
      syncing = false;
    }
  };

  const fundPct = (f: number | null | undefined) => (f == null ? 'n/a' : `${(f * 100).toFixed(4)}%`);
  const num = (n: number | null | undefined, suffix = '') => (n == null ? 'n/a' : `${Math.round(n).toLocaleString()}${suffix}`);
</script>

<header class="mb-5 flex items-center gap-2">
  <Flame class="h-5 w-5 text-warn" />
  <div>
    <h1 class="text-xl font-semibold text-strong">Derivatives · Leverage Risk (Admin)</h1>
    <p class="text-sm text-muted">Diagnostics, manual sync and the thresholds the leverage model uses.</p>
  </div>
</header>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <button class="btn-primary inline-flex items-center gap-2" disabled={syncing} onclick={syncNow}>
    <RefreshCw class="h-4 w-4 {syncing ? 'animate-spin' : ''}" /> {syncing ? 'Syncing…' : 'Sync now'}
  </button>
  {#if message}<span class="text-sm text-mint">{message}</span>{/if}
  {#if error}<span class="text-sm text-danger">{error}</span>{/if}
</div>

{#if loading}
  <p class="text-sm text-muted">Loading diagnostics…</p>
{:else if diag}
  <div class="grid gap-4 lg:grid-cols-2">
    <!-- Stored latest -->
    <div class="card">
      <div class="mb-2 flex items-center justify-between">
        <p class="stat-label">Latest stored row</p>
        <span class="text-[11px] text-muted">{diag.row_count} row(s) total</span>
      </div>
      {#if diag.latest}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-muted">Date</dt><dd class="text-right text-soft">{diag.latest.date}</dd>
          <dt class="text-muted">Leverage</dt><dd class="text-right font-medium text-strong">{diag.latest.leverage_percent}/100 · {diag.latest.label}</dd>
          <dt class="text-muted">Confidence</dt><dd class="text-right text-soft">{diag.latest.confidence}</dd>
          <dt class="text-muted">BTC funding</dt><dd class="text-right text-soft">{fundPct(diag.latest.btc_funding_rate)}</dd>
          <dt class="text-muted">BTC long/short</dt><dd class="text-right text-soft">{diag.latest.btc_long_short ?? 'n/a'}</dd>
          <dt class="text-muted">BTC open interest</dt><dd class="text-right text-soft">{num(diag.latest.btc_open_interest, ' BTC')}</dd>
          <dt class="text-muted">Hot-funding breadth</dt><dd class="text-right text-soft">{diag.latest.hot_funding_breadth ?? 'n/a'}%</dd>
        </dl>
      {:else}
        <p class="text-sm text-muted">No stored row yet. Click “Sync now” (requires the derivatives migration + Bitget reachable).</p>
      {/if}
    </div>

    <!-- Live read -->
    <div class="card">
      <p class="stat-label mb-2">Live Bitget read (right now)</p>
      {#if diag.live?.leverage_risk != null}
        <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt class="text-muted">Leverage</dt><dd class="text-right font-medium text-strong">{diag.live.leverage_percent}/100 · {diag.live.label}</dd>
          <dt class="text-muted">Confidence</dt><dd class="text-right text-soft">{diag.live.confidence}</dd>
          <dt class="text-muted">BTC / ETH funding</dt><dd class="text-right text-soft">{fundPct(diag.live.btc_funding_rate)} / {fundPct(diag.live.eth_funding_rate)}</dd>
          <dt class="text-muted">BTC / ETH long/short</dt><dd class="text-right text-soft">{diag.live.btc_long_short ?? 'n/a'} / {diag.live.eth_long_short ?? 'n/a'}</dd>
          <dt class="text-muted">Hot-funding breadth</dt><dd class="text-right text-soft">{diag.live.hot_funding_breadth ?? 'n/a'}%</dd>
        </dl>
        {#if diag.live.top_funding?.length}
          <p class="mt-3 text-[11px] uppercase tracking-wide text-muted">Hottest funding</p>
          <p class="text-sm text-soft">{diag.live.top_funding.map((c: any) => `${c.symbol} ${(c.funding * 100).toFixed(2)}%`).join(' · ')}</p>
        {/if}
      {:else}
        <p class="text-sm text-warn">Live read unavailable — Bitget did not return data this moment.</p>
      {/if}
    </div>
  </div>

  <!-- Thresholds -->
  <div class="card mt-4">
    <p class="stat-label mb-2">Model thresholds (read-only)</p>
    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
      <div><span class="text-muted">Hot funding /8h:</span> <span class="text-soft">&gt; {fundPct(diag.thresholds?.funding_hot_per_8h)}</span></div>
      <div><span class="text-muted">L/S extreme:</span> <span class="text-soft">&gt;{diag.thresholds?.long_short_extreme_high} / &lt;{diag.thresholds?.long_short_extreme_low}</span></div>
      <div><span class="text-muted">OI rising:</span> <span class="text-soft">&gt; {diag.thresholds?.oi_rising_pct}%</span></div>
      <div><span class="text-muted">Zones (L/N/E):</span> <span class="text-soft">{diag.thresholds?.leverage_zones?.low} / {diag.thresholds?.leverage_zones?.normal} / {diag.thresholds?.leverage_zones?.elevated}</span></div>
      <div><span class="text-muted">Funding weight:</span> <span class="text-soft">{diag.thresholds?.funding_weight}</span></div>
      <div><span class="text-muted">L/S weight:</span> <span class="text-soft">{diag.thresholds?.long_short_weight}</span></div>
    </div>
  </div>

  <div class="mt-4 flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>Access to the Derivatives module is toggled per-plan on the <a href="/admin/plans" class="text-accent hover:underline">Plans &amp; users</a> page (<code>access_derivatives</code>). This row is also refreshed automatically by the full sync.</span>
  </div>
{:else}
  <p class="text-sm text-danger">{error || 'No diagnostics available.'}</p>
{/if}
