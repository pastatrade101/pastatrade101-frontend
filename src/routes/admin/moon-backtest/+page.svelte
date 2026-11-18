<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { Rocket, Play, Layers, Trash2, ChevronDown, ChevronUp, RefreshCw } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { authReady, user } from '$lib/stores/auth';
  import EChart from '$lib/components/EChart.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import { axisTooltip, categorical, grid, lineSeries, logAxis, timeAxis, valueAxis, zoomInside } from '$lib/charts/presets';

  // The moon backtest: buy a coin when it closes above a long sideways range on a
  // volume surge, sell on fixed rules — replayed over Binance's daily candles since
  // 2017, coins Binance later delisted included. Runs on the server; each run is saved.

  interface Params {
    timeframe: 'daily' | 'weekly';
    baseBars: number;
    maxRangePct: number;
    breakoutPct: number;
    volumeMult: number;
    minDailyVolumeUsd: number;
    minListedDays: number;
    btcFilter: boolean;
    slots: number;
    maxNewPerDay: number;
    stopLossPct: number;
    trailPct: number;
    failExit: boolean;
    failBufferPct: number;
    takeProfits: { gainPct: number; sellPct: number }[];
    timeStopDays: number;
    timeStopMinGainPct: number;
    cooldownDays: number;
    feePct: number;
    spreadPct: number;
    maxAdvPct: number;
    initialCash: number;
    startDate: string;
    endDate: string | null;
  }
  interface Metrics {
    finalEquity: number;
    totalReturnPct: number;
    cagrPct: number | null;
    maxDrawdownPct: number;
    sharpe: number | null;
  }
  interface Stats {
    trades: number;
    wins: number;
    winRatePct: number | null;
    avgWinPct: number | null;
    avgLossPct: number | null;
    profitFactor: number | null;
    bestTradePct: number | null;
    worstTradePct: number | null;
    avgHoldDays: number | null;
    exposurePct: number;
    feesUsd: number;
    slippageUsd: number;
    signals: number;
    skippedNoSlot: number;
    skippedLiquidity: number;
    btcFilterOpenPct: number | null;
    pairsTraded: number;
  }
  interface Summary {
    period: { start: string; end: string; days: number };
    universe: { pairs: number; delisted: number };
    metrics: { strategy: Metrics; btc: Metrics };
    stats: Stats;
    byYear: { year: number; strategyPct: number; btcPct: number; trades: number }[];
  }
  interface RunRow {
    id: string;
    created_at: string;
    name: string;
    params: Params;
    summary: Summary;
    created_by: string | null;
  }
  interface Trade {
    symbol: string;
    entryDate: string;
    exitDate: string;
    entryPrice: number;
    exitPrice: number;
    returnPct: number;
    pnlUsd: number;
    costUsd: number;
    holdDays: number;
    exitReason: string;
    partials: number;
    base: { top: number; bottom: number; rangePct: number; volumeSurge: number };
    delisted: boolean;
  }
  interface Result extends Summary {
    params: Params;
    exitReasons: { reason: string; count: number; avgReturnPct: number }[];
    trades: Trade[];
    equity: { dates: string[]; strategy: number[]; btc: number[] };
    latestSignals: { date: string | null; btcFilterOpen: boolean; coins: { symbol: string; close: number; top: number; rangePct: number; volumeSurge: number; dailyVolumeUsd: number }[] };
  }
  interface Job {
    id: string;
    status: 'running' | 'done' | 'failed';
    stage: string;
    done: number;
    total: number;
    startedAt: string;
    finishedAt: string | null;
    error: string | null;
    warnings: string[];
    runs: { name: string; id: string | null }[];
  }
  interface View {
    tableReady: boolean;
    runs: RunRow[];
    job: Job | null;
    cache: { pairs: number; dir: string } | null;
    defaults: Params;
    compareSet: string[];
  }

  let view = $state<View | null>(null);
  let loading = $state(true);
  let error = $state('');
  let notice = $state('');
  let starting = $state(false);
  let selectedId = $state<string | null>(null);
  let detail = $state<(RunRow & { result: Result }) | null>(null);
  let detailLoading = $state(false);
  let rulesOpen = $state(false);
  let rules = $state<Params | null>(null);
  let takeProfit = $state<'none' | 'thirds'>('none');
  let logScale = $state(true);
  let tradeSort = $state<'date' | 'return' | 'pnl'>('date');
  let showAllTrades = $state(false);
  let poll: ReturnType<typeof setInterval> | null = null;

  $effect(() => {
    if ($authReady && (!$user || $user.role !== 'admin')) goto('/app');
  });

  const load = async () => {
    try {
      const v = await api<View>('/admin/moon-backtest', { auth: true, timeoutMs: 20_000 });
      const wasRunning = view?.job?.status === 'running';
      view = v;
      if (!rules) rules = structuredClone(v.defaults);
      error = '';
      // A job just finished: show its first run.
      if (wasRunning && v.job && v.job.status !== 'running') {
        const first = v.job.runs.find((r) => r.id)?.id;
        if (first) select(first);
        notice = v.job.status === 'done' ? `Finished: ${v.job.runs.length} run${v.job.runs.length === 1 ? '' : 's'} saved.` : '';
      } else if (!selectedId && v.runs.length) select(v.runs[0].id);
      syncPolling();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the backtest.';
    } finally {
      loading = false;
    }
  };

  const syncPolling = () => {
    const running = view?.job?.status === 'running';
    if (running && !poll) poll = setInterval(load, 2000);
    if (!running && poll) {
      clearInterval(poll);
      poll = null;
    }
  };

  onMount(load);
  onDestroy(() => poll && clearInterval(poll));

  const select = async (id: string) => {
    selectedId = id;
    showAllTrades = false;
    detailLoading = true;
    try {
      detail = await api<RunRow & { result: Result }>(`/admin/moon-backtest/runs/${id}`, { auth: true, timeoutMs: 30_000 });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load the run.';
    } finally {
      detailLoading = false;
    }
  };

  const startCompare = async () => {
    starting = true;
    notice = '';
    error = '';
    try {
      await api('/admin/moon-backtest/compare', { auth: true, method: 'POST', timeoutMs: 30_000 });
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not start the comparison.';
    } finally {
      starting = false;
    }
  };

  const startRun = async () => {
    if (!rules) return;
    starting = true;
    notice = '';
    error = '';
    try {
      const params = { ...rules, takeProfits: takeProfit === 'thirds' ? [{ gainPct: 100, sellPct: 33 }, { gainPct: 300, sellPct: 33 }] : [] };
      await api('/admin/moon-backtest/run', { auth: true, method: 'POST', body: { params }, timeoutMs: 30_000 });
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not start the backtest.';
    } finally {
      starting = false;
    }
  };

  const remove = async (r: RunRow) => {
    if (!confirm(`Delete the saved run "${r.name}"?`)) return;
    try {
      await api(`/admin/moon-backtest/runs/${r.id}`, { auth: true, method: 'DELETE', timeoutMs: 20_000 });
      if (selectedId === r.id) {
        selectedId = null;
        detail = null;
      }
      await load();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not delete the run.';
    }
  };

  const resetRules = () => {
    if (view) rules = structuredClone(view.defaults);
    takeProfit = 'none';
  };
  const setTimeframe = (tf: 'daily' | 'weekly') => {
    if (!rules || rules.timeframe === tf) return;
    // Keep the base the same length in time.
    rules.baseBars = tf === 'daily' ? rules.baseBars * 7 : Math.max(4, Math.round(rules.baseBars / 7));
    rules.timeframe = tf;
  };

  const pct = (n: number | null | undefined, digits = 1) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`);
  const tone = (n: number | null | undefined) => (n == null ? 'text-muted' : n >= 0 ? 'text-mint' : 'text-danger');
  const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
  const niceDate = (d: string | null | undefined) => (d ? new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—');
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const coin = (s: string) => s.replace(/USDT$/, '');
  const REASONS: Record<string, string> = {
    stop: 'Stop-loss',
    trail: 'Trailing stop',
    failed: 'Fell back into the range',
    time: 'Time stop',
    target: 'All sold at targets',
    delisted: 'Delisted by Binance',
    halted: 'Trading halted',
    end: 'Still held at the end'
  };
  const rulesLine = (p: Params) =>
    [
      `${p.timeframe === 'daily' ? 'Daily' : 'Weekly'} closes`,
      `${p.baseBars}-${p.timeframe === 'daily' ? 'day' : 'week'} base ≤ ${p.maxRangePct}% tall`,
      `close ${p.breakoutPct}% above it on ${p.volumeMult}× volume`,
      p.btcFilter ? 'BTC above its 200-day average' : 'no BTC filter',
      `${p.slots} slots`,
      p.stopLossPct ? `stop ${p.stopLossPct}%` : 'no stop',
      p.trailPct ? `trail ${p.trailPct}%` : 'no trail',
      p.failExit ? `sell if back in the range (−${p.failBufferPct}%)` : null,
      p.takeProfits.length ? `take profits ${p.takeProfits.map((t) => `${t.sellPct}% at +${t.gainPct}%`).join(', ')}` : null,
      p.timeStopDays ? `time stop ${p.timeStopDays}d` : null,
      `from ${niceDate(p.startDate)}`
    ]
      .filter(Boolean)
      .join(' · ');

  const colors = $derived({ strat: $categorical[1], btc: $categorical[0] });
  const job = $derived(view?.job ?? null);
  const running = $derived(job?.status === 'running');
  const r = $derived(detail?.result ?? null);

  const sortedTrades = $derived.by(() => {
    const t = [...(r?.trades ?? [])];
    if (tradeSort === 'return') t.sort((a, b) => b.returnPct - a.returnPct);
    else if (tradeSort === 'pnl') t.sort((a, b) => b.pnlUsd - a.pnlUsd);
    else t.sort((a, b) => b.entryDate.localeCompare(a.entryDate));
    return showAllTrades ? t : t.slice(0, 40);
  });

  const yearLabel = (t: number) => new Date(t).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const chartOption = $derived.by(() => {
    const e = r?.equity;
    if (!e || e.dates.length < 2) return {};
    return {
      backgroundColor: 'transparent',
      useUTC: true,
      grid: grid({ top: 30, right: 16 }),
      legend: { data: ['Moon rules', 'Hold BTC'], top: 0 },
      tooltip: axisTooltip({ valueFormatter: (v: number) => usd(v), axisPointer: { label: { formatter: ({ value }: { value: number }) => niceDate(new Date(value).toISOString()) } } }),
      dataZoom: [zoomInside()],
      xAxis: timeAxis({ splitLine: { show: false }, axisLabel: { formatter: yearLabel, hideOverlap: true } }),
      yAxis: logScale ? logAxis({ axisLabel: { formatter: (v: number) => usd(v) } }) : valueAxis({ axisLabel: { formatter: (v: number) => usd(v) } }),
      series: [
        lineSeries({ name: 'Moon rules', color: colors.strat, width: 2, data: e.dates.map((d, i) => [ts(d), Math.max(1, e.strategy[i])]) }),
        lineSeries({ name: 'Hold BTC', color: colors.btc, width: 1.6, data: e.dates.map((d, i) => [ts(d), Math.max(1, e.btc[i])]) })
      ]
    };
  });

  const field = 'w-full rounded-lg border border-edge bg-panel-2 px-2 py-1.5 text-sm text-strong';
</script>

<svelte:head><title>Moon Backtest · Admin · Pastatrade</title></svelte:head>

<header class="mb-5">
  <h1 class="flex items-center gap-2 text-xl font-semibold text-strong"><Rocket class="h-5 w-5 text-accent" /> Admin · Moon backtest</h1>
  <p class="mt-1 max-w-3xl text-sm text-muted">
    Buys a coin when it closes above a long sideways range on a volume surge, and sells on fixed rules. Replays Binance's real daily candles since 2017 for every USDT pair, including the coins Binance later delisted, with fees, spread and price impact on every fill. Private to admins.
  </p>
</header>

{#if loading}
  <p class="text-sm text-muted">Loading…</p>
{:else if view}
  <div class="space-y-4">
    {#if error}<p class="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>{/if}
    {#if notice}<p class="rounded-lg border border-mint/40 bg-mint/10 px-3 py-2 text-sm text-mint">{notice}</p>{/if}

    {#if !view.tableReady}
      <div class="card border-warn/40">
        <h2 class="text-sm font-semibold text-strong">One-time setup</h2>
        <p class="mt-1 text-sm text-soft">Runs are saved in a new table. Create it once by running <code class="text-strong">backend/database/moon-backtests.sql</code> in the Supabase SQL editor, then reload this page.</p>
      </div>
    {/if}

    <!-- Run -->
    <div class="card">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-sm font-semibold text-strong">Run a backtest</h2>
          <p class="mt-0.5 text-xs text-muted">
            {#if view.cache}Candles cached for {view.cache.pairs} pairs. A run first fetches the days since the last one.{:else}The first run downloads every pair's history (a few minutes), then replays it.{/if}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn-primary text-sm" disabled={running || starting || !view.tableReady} onclick={startCompare} title={view.compareSet.join('\n')}>
            <Layers class="h-4 w-4" /> Compare {view.compareSet.length} rule sets
          </button>
          <button class="btn-ghost text-sm" disabled={running || starting} onclick={() => (rulesOpen = !rulesOpen)}>
            {#if rulesOpen}<ChevronUp class="h-4 w-4" />{:else}<ChevronDown class="h-4 w-4" />{/if} Set my own rules
          </button>
        </div>
      </div>

      {#if job && (running || job.status === 'failed')}
        <div class="mt-3 rounded-lg bg-panel-2/60 px-3 py-2">
          {#if running}
            <p class="flex items-center gap-2 text-xs text-soft"><RefreshCw class="h-3.5 w-3.5 animate-spin" /> {job.stage}{job.total > 1 ? ` — ${Math.round((job.done / job.total) * 100)}%` : ''}</p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-edge"><div class="h-full bg-accent transition-all" style="width:{job.total > 1 ? (job.done / job.total) * 100 : 5}%"></div></div>
          {:else}
            <p class="text-xs text-danger">The last run failed: {job.error}</p>
          {/if}
        </div>
      {/if}
      {#if job?.warnings.length}
        {#each job.warnings as w}<p class="mt-2 text-[11px] text-warn">{w}</p>{/each}
      {/if}

      {#if rulesOpen && rules}
        <div class="mt-4 grid gap-3 border-t border-edge/60 pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p class="mb-1 text-[11px] font-medium text-muted">Signal closes</p>
            <div class="flex gap-1">
              {#each ['weekly', 'daily'] as tf}
                <button class="flex-1 rounded-lg border px-2 py-1.5 text-xs {rules.timeframe === tf ? 'border-accent text-strong' : 'border-edge text-muted'}" onclick={() => setTimeframe(tf as 'daily' | 'weekly')}>{tf === 'weekly' ? 'Weekly' : 'Daily'}</button>
              {/each}
            </div>
          </div>
          <label class="text-[11px] font-medium text-muted">Base length ({rules.timeframe === 'daily' ? 'days' : 'weeks'})<input type="number" class={field} bind:value={rules.baseBars} min="4" /></label>
          <label class="text-[11px] font-medium text-muted">Base at most this tall (%)<input type="number" class={field} bind:value={rules.maxRangePct} min="10" /></label>
          <label class="text-[11px] font-medium text-muted">Close above the base top by (%)<input type="number" class={field} bind:value={rules.breakoutPct} min="0" step="0.5" /></label>
          <label class="text-[11px] font-medium text-muted">Volume vs the base average (×)<input type="number" class={field} bind:value={rules.volumeMult} min="0" step="0.5" /></label>
          <label class="text-[11px] font-medium text-muted">Min daily volume (USDT)<input type="number" class={field} bind:value={rules.minDailyVolumeUsd} min="0" step="50000" /></label>
          <label class="text-[11px] font-medium text-muted">Slots (equal size)<input type="number" class={field} bind:value={rules.slots} min="1" max="50" /></label>
          <label class="text-[11px] font-medium text-muted">New buys per signal close<input type="number" class={field} bind:value={rules.maxNewPerDay} min="1" /></label>
          <label class="text-[11px] font-medium text-muted">Stop-loss (%, 0 = off)<input type="number" class={field} bind:value={rules.stopLossPct} min="0" max="95" /></label>
          <label class="text-[11px] font-medium text-muted">Trailing stop (%, 0 = off)<input type="number" class={field} bind:value={rules.trailPct} min="0" max="95" /></label>
          <label class="text-[11px] font-medium text-muted">Time stop (days, 0 = off)<input type="number" class={field} bind:value={rules.timeStopDays} min="0" /></label>
          <label class="text-[11px] font-medium text-muted">Take profits
            <select class={field} bind:value={takeProfit}>
              <option value="none">None — ride the trend</option>
              <option value="thirds">⅓ at +100%, ⅓ at +300%</option>
            </select>
          </label>
          <label class="text-[11px] font-medium text-muted">Start date<input type="date" class={field} bind:value={rules.startDate} min="2018-03-01" /></label>
          <label class="text-[11px] font-medium text-muted">Starting cash (USDT)<input type="number" class={field} bind:value={rules.initialCash} min="50" /></label>
          <label class="flex items-center gap-2 self-end pb-1.5 text-xs text-soft"><input type="checkbox" bind:checked={rules.btcFilter} /> Only buy while BTC is above its 200-day average</label>
          <label class="flex items-center gap-2 self-end pb-1.5 text-xs text-soft"><input type="checkbox" bind:checked={rules.failExit} /> Sell if it closes back in the range</label>
          <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button class="btn-primary text-sm" disabled={running || starting || !view.tableReady} onclick={startRun}><Play class="h-4 w-4" /> Run with these rules</button>
            <button class="btn-ghost text-sm" onclick={resetRules}>Reset to defaults</button>
            <span class="text-[11px] text-muted">Fees {rules.feePct}% and spread {rules.spreadPct}% per fill; an order is at most {rules.maxAdvPct}% of the coin's daily volume.</span>
          </div>
        </div>
      {/if}
    </div>

    <!-- Saved runs -->
    {#if view.runs.length}
      <div class="card overflow-x-auto">
        <h2 class="text-sm font-semibold text-strong">Saved runs</h2>
        <p class="mt-0.5 text-xs text-muted">Click a run for its trades and chart. BTC on the same dates is the yardstick.</p>
        <table class="mt-2 w-full min-w-[860px] text-sm">
          <thead>
            <tr class="text-left text-[11px] text-muted">
              <th class="py-1 font-medium">Rules</th>
              <th class="py-1 text-right font-medium">Return</th>
              <th class="py-1 text-right font-medium">BTC</th>
              <th class="py-1 text-right font-medium">Per year</th>
              <th class="py-1 text-right font-medium">Worst drop</th>
              <th class="py-1 text-right font-medium">Trades</th>
              <th class="py-1 text-right font-medium">Won</th>
              <th class="py-1 text-right font-medium">Avg win / loss</th>
              <th class="py-1 text-right font-medium">Profit factor</th>
              <th class="py-1"></th>
            </tr>
          </thead>
          <tbody>
            {#each view.runs as row (row.id)}
              {@const m = row.summary.metrics}
              {@const s = row.summary.stats}
              <tr class="cursor-pointer border-t border-edge/60 hover:bg-panel-2/50 {selectedId === row.id ? 'bg-panel-2/70' : ''}" onclick={() => select(row.id)}>
                <td class="py-1.5 pr-2">
                  <p class="font-medium text-strong">{row.name}</p>
                  <p class="text-[11px] text-muted">{niceDate(row.summary.period.start)} → {niceDate(row.summary.period.end)} · run {niceDate(row.created_at)}</p>
                </td>
                <td class="py-1.5 text-right font-semibold {tone(m.strategy.totalReturnPct)}">{pct(m.strategy.totalReturnPct, 0)}</td>
                <td class="py-1.5 text-right text-soft">{pct(m.btc.totalReturnPct, 0)}</td>
                <td class="py-1.5 text-right {tone(m.strategy.cagrPct)}">{pct(m.strategy.cagrPct)}</td>
                <td class="py-1.5 text-right text-danger">{m.strategy.maxDrawdownPct.toFixed(0)}%</td>
                <td class="py-1.5 text-right text-soft">{s.trades}</td>
                <td class="py-1.5 text-right text-soft">{s.winRatePct == null ? '—' : `${s.winRatePct.toFixed(0)}%`}</td>
                <td class="py-1.5 text-right text-xs"><span class="text-mint">{pct(s.avgWinPct, 0)}</span> / <span class="text-danger">{pct(s.avgLossPct, 0)}</span></td>
                <td class="py-1.5 text-right text-soft">{s.profitFactor?.toFixed(2) ?? '—'}</td>
                <td class="py-1.5 text-right">
                  <button class="rounded p-1 text-muted hover:text-danger" title="Delete this run" aria-label="Delete this run" onclick={(e) => { e.stopPropagation(); remove(row); }}><Trash2 class="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else if view.tableReady && !running}
      <div class="card text-sm text-muted">No runs yet. Start with <span class="text-strong">Compare {view.compareSet.length} rule sets</span>: it runs the same idea with one thing changed at a time (daily vs weekly, base length, exit width, BTC filter, taking profits).</div>
    {/if}

    <!-- One run -->
    {#if detailLoading && !detail}
      <p class="text-sm text-muted">Loading the run…</p>
    {:else if detail && r}
      {@const m = r.metrics}
      {@const s = r.stats}
      <div class="card">
        <h2 class="text-sm font-semibold text-strong">{detail.name}</h2>
        <p class="mt-0.5 text-[11px] text-muted">{rulesLine(r.params)}</p>
        <p class="mt-0.5 text-[11px] text-muted">{r.universe.pairs} pairs could be bought, {r.universe.delisted} of them since delisted · {niceDate(r.period.start)} → {niceDate(r.period.end)} · {usd(r.params.initialCash)} to start</p>

        <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-lg bg-panel-2/60 p-3">
            <p class="text-[11px] text-muted">Moon rules</p>
            <p class="text-xl font-semibold {tone(m.strategy.totalReturnPct)}">{pct(m.strategy.totalReturnPct, 0)}</p>
            <p class="text-[11px] text-muted">{usd(m.strategy.finalEquity)} · {pct(m.strategy.cagrPct)} a year</p>
          </div>
          <div class="rounded-lg bg-panel-2/60 p-3">
            <p class="text-[11px] text-muted">Hold BTC instead</p>
            <p class="text-xl font-semibold {tone(m.btc.totalReturnPct)}">{pct(m.btc.totalReturnPct, 0)}</p>
            <p class="text-[11px] text-muted">{usd(m.btc.finalEquity)} · {pct(m.btc.cagrPct)} a year</p>
          </div>
          <div class="rounded-lg bg-panel-2/60 p-3">
            <p class="text-[11px] text-muted">Worst drop from a high</p>
            <p class="text-xl font-semibold text-danger">{m.strategy.maxDrawdownPct.toFixed(0)}%</p>
            <p class="text-[11px] text-muted">BTC {m.btc.maxDrawdownPct.toFixed(0)}%</p>
          </div>
          <div class="rounded-lg bg-panel-2/60 p-3">
            <p class="text-[11px] text-muted">Trades</p>
            <p class="text-xl font-semibold text-strong">{s.trades} <span class="text-sm font-normal text-soft">· {s.winRatePct?.toFixed(0) ?? '—'}% won</span></p>
            <p class="text-[11px] text-muted">Avg win {pct(s.avgWinPct, 0)} · avg loss {pct(s.avgLossPct, 0)} · held {s.avgHoldDays?.toFixed(0) ?? '—'}d</p>
          </div>
        </div>

        <div class="mt-4 flex items-center justify-between">
          <h3 class="text-xs font-semibold text-strong">Value of {usd(r.params.initialCash)}</h3>
          <label class="flex items-center gap-1.5 text-[11px] text-muted"><input type="checkbox" bind:checked={logScale} /> Log scale</label>
        </div>
        <EChart option={chartOption} height={320} />
        <p class="mt-1 text-[11px] text-muted">
          In coins {s.exposurePct.toFixed(0)}% of the time on average{#if s.btcFilterOpenPct != null}; the BTC filter allowed buying on {s.btcFilterOpenPct.toFixed(0)}% of signal closes{/if}. Costs paid: {usd(s.feesUsd)} fees, {usd(s.slippageUsd)} spread and impact.
        </p>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="card overflow-x-auto">
          <h3 class="text-xs font-semibold text-strong">Year by year</h3>
          <table class="mt-2 w-full text-sm">
            <thead><tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Year</th><th class="py-1 text-right font-medium">Moon rules</th><th class="py-1 text-right font-medium">BTC</th><th class="py-1 text-right font-medium">Trades opened</th></tr></thead>
            <tbody>
              {#each r.byYear as y (y.year)}
                <tr class="border-t border-edge/60">
                  <td class="py-1.5 text-soft">{y.year}</td>
                  <td class="py-1.5 text-right font-medium {tone(y.strategyPct)}">{pct(y.strategyPct, 0)}</td>
                  <td class="py-1.5 text-right {tone(y.btcPct)}">{pct(y.btcPct, 0)}</td>
                  <td class="py-1.5 text-right text-soft">{y.trades}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="card">
          <h3 class="text-xs font-semibold text-strong">How trades ended</h3>
          <table class="mt-2 w-full text-sm">
            <thead><tr class="text-left text-[11px] text-muted"><th class="py-1 font-medium">Exit</th><th class="py-1 text-right font-medium">Trades</th><th class="py-1 text-right font-medium">Avg result</th></tr></thead>
            <tbody>
              {#each r.exitReasons as e (e.reason)}
                <tr class="border-t border-edge/60">
                  <td class="py-1.5 text-soft">{REASONS[e.reason] ?? e.reason}</td>
                  <td class="py-1.5 text-right text-soft">{e.count}</td>
                  <td class="py-1.5 text-right {tone(e.avgReturnPct)}">{pct(e.avgReturnPct, 0)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="mt-2 text-[11px] text-muted">
            {s.signals} breakout signals passed every rule (a coin can signal on several closes in a row); {s.skippedNoSlot} came when every slot was full or that close's buy limit was reached, and {s.skippedLiquidity} were skipped for too little volume. {s.pairsTraded} different coins traded.
          </p>
          {#if r.latestSignals.date}
            <div class="mt-3 border-t border-edge/60 pt-2">
              <p class="text-[11px] font-medium text-muted">Breakouts on the last signal close ({niceDate(r.latestSignals.date)}, BTC filter {r.latestSignals.btcFilterOpen ? 'open' : 'closed'})</p>
              {#if r.latestSignals.coins.length}
                <p class="mt-1 text-xs text-soft">{r.latestSignals.coins.map((c) => `${coin(c.symbol)} (${c.volumeSurge.toFixed(1)}× volume)`).join(', ')}</p>
              {:else}
                <p class="mt-1 text-xs text-muted">None.</p>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="card overflow-x-auto">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-xs font-semibold text-strong">Trades ({r.trades.length})</h3>
          <div class="flex gap-1 text-[11px]">
            {#each [['date', 'Newest'], ['return', 'Best %'], ['pnl', 'Best $']] as [k, label]}
              <button class="rounded px-2 py-1 {tradeSort === k ? 'bg-edge text-strong' : 'text-muted'}" onclick={() => (tradeSort = k as typeof tradeSort)}>{label}</button>
            {/each}
          </div>
        </div>
        <table class="mt-2 w-full min-w-[760px] text-sm">
          <thead>
            <tr class="text-left text-[11px] text-muted">
              <th class="py-1 font-medium">Coin</th><th class="py-1 font-medium">Bought</th><th class="py-1 font-medium">Sold</th>
              <th class="py-1 text-right font-medium">Result</th><th class="py-1 text-right font-medium">P&amp;L</th><th class="py-1 text-right font-medium">Days</th>
              <th class="py-1 pl-3 font-medium">Exit</th><th class="py-1 text-right font-medium">Base</th>
            </tr>
          </thead>
          <tbody>
            {#each sortedTrades as t (t.symbol + t.entryDate)}
              <tr class="border-t border-edge/60">
                <td class="py-1.5 font-semibold text-strong">{coin(t.symbol)}{#if t.delisted}<span class="ml-1 rounded bg-danger/15 px-1 text-[10px] font-normal text-danger">delisted</span>{/if}</td>
                <td class="py-1.5 text-xs text-soft">{niceDate(t.entryDate)}</td>
                <td class="py-1.5 text-xs text-soft">{niceDate(t.exitDate)}</td>
                <td class="py-1.5 text-right font-medium {tone(t.returnPct)}">{pct(t.returnPct, 0)}</td>
                <td class="py-1.5 text-right text-xs {tone(t.pnlUsd)}">{t.pnlUsd >= 0 ? '+' : '−'}{usd(Math.abs(t.pnlUsd))}</td>
                <td class="py-1.5 text-right text-xs text-soft">{t.holdDays}</td>
                <td class="py-1.5 pl-3 text-xs text-muted">{REASONS[t.exitReason] ?? t.exitReason}{t.partials ? ` (+${t.partials} target${t.partials > 1 ? 's' : ''})` : ''}</td>
                <td class="py-1.5 text-right text-[11px] text-muted">{t.base.rangePct.toFixed(0)}% tall · {t.base.volumeSurge.toFixed(1)}×</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !showAllTrades && r.trades.length > 40}
          <button class="btn-ghost mt-2 text-xs" onclick={() => (showAllTrades = true)}>Show all {r.trades.length} trades</button>
        {/if}
      </div>
    {/if}

    <Disclaimer />
    <p class="text-[11px] text-muted">A backtest shows how fixed rules would have behaved on past prices; it does not predict the next cycle. Real fills can be worse than modelled on thin coins, and a delisted coin's last price may not have been sellable.</p>
  </div>
{/if}
