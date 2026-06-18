<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api';
  import { fmtPct, fmtUsd, signalColor } from '$lib/format';
  import ScoreBar from '$lib/components/ScoreBar.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';

  interface BtcDashboard {
    price: number;
    ath: number;
    btc_dominance: number | null;
    moving_averages: { ma20: number | null; ma50: number | null; ma100: number | null; ma200: number | null };
    rsi_14: number | null;
    volatility: { daily_pct: number | null; state: string };
    drawdown_from_ath: number;
    return_30d: number | null;
    dca: { score: number; label: string };
    market_condition: string;
    series: { date: string; price: number; volume: number }[];
  }

  let data = $state<BtcDashboard | null>(null);
  let error = $state('');
  let loading = $state(true);

  onMount(async () => {
    try {
      data = await api<BtcDashboard>('/btc/dashboard');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load BTC dashboard.';
    } finally {
      loading = false;
    }
  });

  const closes = $derived(data ? data.series.map((p) => p.price) : []);
  const mas = $derived(
    data
      ? [
          { label: 'MA 20', value: data.moving_averages.ma20 },
          { label: 'MA 50', value: data.moving_averages.ma50 },
          { label: 'MA 100', value: data.moving_averages.ma100 },
          { label: 'MA 200', value: data.moving_averages.ma200 }
        ]
      : []
  );
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Bitcoin Cycle</h1>
  <p class="text-sm text-muted">Drawdown, trend, momentum and the composite DCA window score.</p>
</header>

{#if loading}
  <div class="card text-center text-muted">Loading BTC dashboard…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">
    {error}
    <p class="mt-1 text-sm text-muted">Run a data sync from the Admin panel to populate BTC history.</p>
  </div>
{:else if data}
  <div class="grid gap-4 lg:grid-cols-3">
    <!-- Price + chart -->
    <div class="card lg:col-span-2">
      <div class="flex items-end justify-between">
        <div>
          <p class="stat-label">BTC / USD</p>
          <p class="text-3xl font-semibold text-strong">{fmtUsd(data.price)}</p>
        </div>
        <span class="pill {signalColor(data.market_condition)}">{data.market_condition}</span>
      </div>
      <div class="mt-4"><Sparkline points={closes} height={120} /></div>
      <p class="mt-1 text-xs text-muted">Trailing ~180 days</p>
    </div>

    <!-- DCA score -->
    <div class="card">
      <p class="stat-label mb-2">DCA Window Score</p>
      <ScoreBar score={data.dca.score} label={data.dca.label} />
      <p class="mt-3 text-xs leading-relaxed text-muted">
        Composite of drawdown, volatility cooling, RSI, moving-average position and BTC dominance. Higher = more
        favourable accumulation conditions.
      </p>
    </div>
  </div>

  <!-- Indicator grid -->
  <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
    <div class="card">
      <p class="stat-label">Drawdown from ATH</p>
      <p class="stat-value mt-1 text-xl text-danger">{fmtPct(data.drawdown_from_ath)}</p>
    </div>
    <div class="card">
      <p class="stat-label">RSI (14)</p>
      <p class="stat-value mt-1 text-xl">{data.rsi_14?.toFixed(0) ?? '—'}</p>
    </div>
    <div class="card">
      <p class="stat-label">Volatility</p>
      <p class="mt-1 text-sm font-medium text-strong">{data.volatility.state}</p>
    </div>
    <div class="card">
      <p class="stat-label">Return 30d</p>
      <p class="stat-value mt-1 text-xl">{fmtPct(data.return_30d)}</p>
    </div>
    <div class="card">
      <p class="stat-label">BTC Dominance</p>
      <p class="stat-value mt-1 text-xl">{data.btc_dominance?.toFixed(1) ?? '—'}%</p>
    </div>
    <div class="card">
      <p class="stat-label">ATH</p>
      <p class="stat-value mt-1 text-xl">{fmtUsd(data.ath, { compact: true })}</p>
    </div>
  </div>

  <!-- Moving averages -->
  <div class="card mt-4">
    <h2 class="mb-3 font-semibold text-strong">Moving Averages</h2>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each mas as ma}
        <div>
          <p class="stat-label">{ma.label}</p>
          <p class="mt-1 text-sm text-soft">{fmtUsd(ma.value)}</p>
          {#if ma.value}
            <p class="text-xs {data.price >= ma.value ? 'text-mint' : 'text-danger'}">
              {data.price >= ma.value ? 'Above' : 'Below'}
            </p>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="mt-6"><Disclaimer /></div>
{/if}
