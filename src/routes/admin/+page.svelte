<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { RefreshCw } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';

  interface SyncJob {
    id: string;
    source: string;
    job_type: string;
    status: 'running' | 'success' | 'failed';
    records_processed: number;
    error: string | null;
    started_at: string;
    finished_at: string | null;
  }

  interface OnchainStatus {
    provider: string;
    base_url: string;
    key_mode: string;
    last_synced: string | null;
    days_covered: number;
    metrics: string[];
    latest: Record<string, { raw: number | null; risk: number | null }>;
    last_job: { status: string; error: string | null; records_processed: number; finished_at: string | null } | null;
    supply_profit_loss: { last_synced: string | null; days_covered: number; profit_percent: number | null; loss_percent: number | null } | null;
  }

  let jobs = $state<SyncJob[]>([]);
  let onchain = $state<OnchainStatus | null>(null);
  let running = $state(false);
  let message = $state('');
  let error = $state('');

  const ONCHAIN_LABELS: Record<string, string> = {
    mvrv_zscore: 'MVRV Z-Score',
    puell_multiple: 'Puell Multiple',
    nupl: 'NUPL',
    reserve_risk: 'Reserve Risk'
  };

  // Admin-only guard.
  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const loadJobs = async () => {
    const data = await api<{ items: SyncJob[] }>('/admin/sync-jobs', { auth: true });
    jobs = data.items;
  };
  const loadOnchain = async () => {
    try {
      onchain = await api<OnchainStatus>('/admin/onchain/status', { auth: true });
    } catch {
      /* non-critical */
    }
  };

  onMount(() => {
    loadJobs().catch((err) => (error = err instanceof Error ? err.message : 'Failed to load jobs.'));
    loadOnchain();
  });

  const runSync = async (path: string, label: string) => {
    running = true;
    message = '';
    error = '';
    try {
      const res = await api<{ steps?: { step: string; ok: boolean; error?: string }[]; ok?: number }>(path, { method: 'POST', auth: true });
      if (res && Array.isArray(res.steps)) {
        const failed = res.steps.filter((s) => !s.ok);
        message = failed.length
          ? `${label}: ${res.ok}/${res.steps.length} stages OK · failed: ${failed.map((s) => s.step).join(', ')}`
          : `${label}: all ${res.steps.length} stages completed.`;
      } else {
        message = `${label} completed.`;
      }
      await Promise.all([loadJobs(), loadOnchain()]);
    } catch (err) {
      error = err instanceof Error ? err.message : `${label} failed.`;
    } finally {
      running = false;
    }
  };

  const statusColor = (s: string) =>
    s === 'success' ? 'bg-mint/15 text-mint' : s === 'failed' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn';
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Admin · Data Sync</h1>
  <p class="text-sm text-muted">Trigger ingestion runs and review job history.</p>
</header>

{#if message}<div class="card mb-4 border-mint/30 bg-mint/5 text-mint">{message}</div>{/if}
{#if error}<div class="card mb-4 border-danger/30 bg-danger/5 text-danger">{error}</div>{/if}

<div class="card mb-6 flex flex-wrap gap-3">
  <button class="btn-primary" disabled={running} title="Runs every stage: coins, BTC, global, ecosystems, Lab price series, social, on-chain (incl. supply P/L) and the risk model" onclick={() => runSync('/admin/sync', 'Full sync')}>
    <RefreshCw class="h-4 w-4 {running ? 'animate-spin' : ''}" /> Run full sync
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/coingecko', 'CoinGecko sync')}>
    Sync coins (CoinGecko)
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/defillama', 'DefiLlama sync')}>
    Sync ecosystems (DefiLlama)
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/risk', 'Risk model sync')}>
    Rebuild risk model
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/onchain', 'On-chain metrics sync')}>
    Sync on-chain metrics (BGeometrics)
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/onchain-supply', 'Supply profit/loss sync')}>
    Sync supply profit/loss only (2 req)
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/price-series', 'Lab price-series sync')}>
    Sync Lab price series (top 100)
  </button>
  <button class="btn-ghost" disabled={running} onclick={() => runSync('/admin/sync/social-metrics', 'Social metrics sync')}>
    Sync social metrics (Trends/Wiki/F&amp;G)
  </button>
</div>
<p class="mb-4 text-xs text-muted">
  <span class="font-medium text-soft">“Run full sync”</span> runs the entire pipeline in order — coins, BTC, global, ecosystems, Lab price series,
  social, on-chain (incl. supply profit/loss) and the risk model. Each stage is independent, so one failure won't stop the rest;
  it's heavy (several minutes on free tiers). The individual buttons re-run a single stage.
  <br />
  “Sync Lab price series” prebakes BTC + top-100 daily history so Charts, Cycle Lab and Alt vs BTC read saved data
  (no live CoinGecko calls from users). It’s heavy — ~100 throttled calls, a few minutes. Run it on a schedule, or via
  <code class="rounded bg-panel-2 px-1">npm run sync:prices</code>.
</p>
{#if running}
  <p class="mb-4 text-sm text-muted">Sync running — this can take a minute on the keyless CoinGecko tier…</p>
{/if}

<!-- On-chain source status -->
{#if onchain}
  <div class="card mb-6">
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-sm font-semibold text-strong">On-chain source · {onchain.provider}</h2>
      <div class="flex items-center gap-2 text-xs">
        <span class="pill bg-edge text-muted">{onchain.key_mode} mode</span>
        {#if onchain.last_job}
          <span class="pill {statusColor(onchain.last_job.status)}">last run: {onchain.last_job.status}</span>
        {/if}
      </div>
    </div>
    <dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><dt class="text-xs text-muted">Last synced</dt><dd class="font-medium text-strong">{onchain.last_synced ?? '—'}</dd></div>
      <div><dt class="text-xs text-muted">Days covered</dt><dd class="font-medium text-strong">{onchain.days_covered.toLocaleString()}</dd></div>
      <div class="sm:col-span-2"><dt class="text-xs text-muted">Provider</dt><dd class="truncate font-medium text-soft">{onchain.base_url}</dd></div>
    </dl>

    <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {#each onchain.metrics as key}
        {@const v = onchain.latest[key]}
        <div class="rounded-lg border border-edge bg-panel-2/40 p-2.5">
          <div class="text-[11px] text-muted">{ONCHAIN_LABELS[key] ?? key}</div>
          <div class="text-base font-semibold text-strong">{v?.raw != null ? Number(v.raw).toLocaleString(undefined, { maximumSignificantDigits: 4 }) : '—'}</div>
          <div class="text-[11px] text-muted">risk {v?.risk != null ? Number(v.risk).toFixed(3) : '—'}</div>
        </div>
      {/each}
    </div>

    <div class="mt-3 rounded-lg border border-edge bg-panel-2/40 p-2.5 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="font-medium text-soft">Supply in Profit / Loss</span>
        {#if onchain.supply_profit_loss}
          <span class="text-muted">{onchain.supply_profit_loss.days_covered.toLocaleString()} days · last {onchain.supply_profit_loss.last_synced ?? '—'}</span>
        {:else}
          <span class="pill bg-warn/15 text-warn">not synced</span>
        {/if}
      </div>
      {#if onchain.supply_profit_loss}
        <div class="mt-1 text-muted">
          In profit <span class="font-medium text-mint">{onchain.supply_profit_loss.profit_percent ?? '—'}%</span> ·
          In loss <span class="font-medium text-danger">{onchain.supply_profit_loss.loss_percent ?? '—'}%</span>
        </div>
      {/if}
    </div>

    {#if onchain.last_job?.error}
      {@const rateLimited = /rate|limit|429/i.test(onchain.last_job.error)}
      {#if rateLimited}
        <p class="mt-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          Rate-limited by BGeometrics — the daily scheduler will retry automatically. Add <code class="rounded bg-panel-2 px-1">BITCOIN_DATA_API_KEY</code> to raise the limit.
        </p>
      {:else}
        <p class="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">Last sync error: {onchain.last_job.error}</p>
      {/if}
    {/if}
    <p class="mt-3 text-[11px] text-muted">
      On-chain data by <a href="https://bitcoin-data.com" target="_blank" rel="noopener" class="hover:underline">BGeometrics · bitcoin-data.com</a>.
      Auto-syncs daily via the scheduler. Free tier: ~10 req/hour, 15 req/day — one sync uses 6 (4 risk metrics + supply profit/loss). Requests-used-today isn't reported by the provider API.
    </p>
  </div>
{/if}

<div class="card overflow-x-auto p-0">
  <table class="w-full min-w-[640px] text-sm">
    <thead>
      <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
        <th class="px-4 py-3 font-medium">Source</th>
        <th class="px-4 py-3 font-medium">Type</th>
        <th class="px-4 py-3 font-medium">Status</th>
        <th class="px-4 py-3 font-medium">Records</th>
        <th class="px-4 py-3 font-medium">Started</th>
        <th class="px-4 py-3 font-medium">Error</th>
      </tr>
    </thead>
    <tbody>
      {#each jobs as job}
        <tr class="border-b border-edge/60 last:border-0">
          <td class="px-4 py-3 text-soft">{job.source}</td>
          <td class="px-4 py-3 text-soft">{job.job_type}</td>
          <td class="px-4 py-3"><span class="pill {statusColor(job.status)}">{job.status}</span></td>
          <td class="px-4 py-3 text-soft">{job.records_processed}</td>
          <td class="px-4 py-3 text-muted">{new Date(job.started_at).toLocaleString()}</td>
          <td class="px-4 py-3 text-xs text-danger">{job.error ?? ''}</td>
        </tr>
      {:else}
        <tr><td colspan="6" class="px-4 py-6 text-center text-muted">No sync jobs yet.</td></tr>
      {/each}
    </tbody>
  </table>
</div>
