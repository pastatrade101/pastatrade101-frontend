<script lang="ts">
  import { onMount } from 'svelte';
  import { Info } from '@lucide/svelte';
  import { api } from '$lib/api';
  import Disclaimer from './Disclaimer.svelte';
  import EChart from './EChart.svelte';

  interface CoinRow {
    symbol: string;
    name: string;
    image: string | null;
    rank: number | null;
    coin_return: number;
    btc_return: number;
    relative: number;
    signal: string;
    badge: string;
  }
  interface Result {
    timeframe: string;
    universe: string;
    tracked_count: number;
    btc_return: number;
    outperforming_btc_count: number;
    outperforming_btc_percent: number;
    positive_return_count: number;
    positive_return_percent: number;
    above_ma50_percent: number | null;
    above_ma200_percent: number | null;
    altcoin_season_index: number;
    altcoin_season_quality: number;
    quality_label: string;
    regime_label: string;
    confidence: 'High' | 'Medium' | 'Low';
    confidence_reason: string;
    premium_takeaway: string;
    true_leaders: CoinRow[];
    relative_defenders: CoinRow[];
    weak_vs_btc: CoinRow[];
    data_quality_summary: { clean: number; short_history: number; low_liquidity: number; abnormal_spike: number; excluded: number };
  }

  interface HistPoint {
    date: string;
    index: number;
    positive_pct: number;
    btc_price: number | null;
  }

  const TIMEFRAMES = ['7d', '30d', '60d', '90d', '180d', '1y'] as const;
  let timeframe = $state<(typeof TIMEFRAMES)[number]>('30d');
  let universe = $state<'premium_clean' | 'all'>('premium_clean');
  let data = $state<Result | null>(null);
  let history = $state<HistPoint[]>([]);
  let loading = $state(true);
  let error = $state('');

  const load = async () => {
    loading = true;
    error = '';
    try {
      const [d, h] = await Promise.all([
        api<Result>(`/charts/altcoin-season-index?timeframe=${timeframe}&universe=${universe}`),
        api<{ series: HistPoint[] }>(`/charts/altcoin-season-index/history?timeframe=${timeframe}&universe=${universe}`).catch(() => ({ series: [] as HistPoint[] }))
      ]);
      data = d;
      history = h.series ?? [];
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  };

  const ts2 = (d: string) => Date.parse(`${d}T00:00:00Z`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const histOption = $derived.by((): any => {
    if (!history.length) return {};
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        formatter: (p: { axisValue: number; seriesName: string; value: [number, number] }[]) => {
          if (!p?.length) return '';
          const dd = new Date(p[0].axisValue).toISOString().slice(0, 10);
          const get = (n: string) => p.find((x) => x.seriesName === n)?.value?.[1];
          let h = `<b>${dd}</b>`;
          const idx = get('Season Index');
          const pos = get('Positive %');
          const btc = get('BTC');
          if (idx != null) h += `<br/>Season Index: ${idx}`;
          if (pos != null) h += `<br/>Positive breadth: ${pos}%`;
          if (btc != null) h += `<br/>BTC: $${Math.round(btc).toLocaleString()}`;
          return h;
        }
      },
      legend: { data: ['Season Index', 'Positive %', 'BTC'], top: 0, textStyle: { color: '#9CA3AF' } },
      grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' } },
      yAxis: [
        { type: 'value', name: '%', min: 0, max: 100, position: 'left', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'log', name: 'BTC', position: 'right', nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, splitLine: { show: false } }
      ],
      series: [
        {
          name: 'Season Index',
          type: 'line',
          yAxisIndex: 0,
          showSymbol: false,
          smooth: true,
          itemStyle: { color: '#5B8CFF' },
          lineStyle: { width: 2, color: '#5B8CFF' },
          data: history.map((p) => [ts2(p.date), p.index]),
          markArea: {
            silent: true,
            data: [
              [{ yAxis: 0, itemStyle: { color: 'rgba(239,68,68,0.05)' } }, { yAxis: 25 }],
              [{ yAxis: 75, itemStyle: { color: 'rgba(55,224,166,0.06)' } }, { yAxis: 100 }]
            ]
          }
        },
        { name: 'Positive %', type: 'line', yAxisIndex: 0, showSymbol: false, smooth: true, itemStyle: { color: '#37e0a6' }, lineStyle: { width: 1.6, color: '#37e0a6' }, data: history.map((p) => [ts2(p.date), p.positive_pct]) },
        { name: 'BTC', type: 'line', yAxisIndex: 1, showSymbol: false, itemStyle: { color: '#6B7280' }, lineStyle: { width: 1, color: '#6B7280', opacity: 0.6 }, data: history.filter((p) => p.btc_price != null).map((p) => [ts2(p.date), p.btc_price]) }
      ]
    };
  });
  onMount(load);
  $effect(() => {
    timeframe;
    universe;
    load();
  });

  const regimePill = (r: string) =>
    /^altcoin season|^broad/i.test(r)
      ? 'bg-mint/15 text-mint'
      : /^btc season|weakness/i.test(r)
        ? 'bg-danger/15 text-danger'
        : 'bg-warn/15 text-warn';
  const confPill = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const signalPill = (s: string) =>
    s === 'True outperformer' ? 'bg-mint/15 text-mint' : s === 'Weak vs BTC' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn';
  const rel = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
</script>

{#if loading && !data}
  <p class="py-10 text-center text-sm text-muted">Computing altcoin season…</p>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if data}
  {@const d = data}
  <!-- Controls -->
  <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      {#each TIMEFRAMES as tf}
        <button class="px-2.5 py-1.5 font-medium uppercase transition-colors {timeframe === tf ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (timeframe = tf)}>{tf}</button>
      {/each}
    </div>
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      <button class="px-2.5 py-1.5 font-medium transition-colors {universe === 'premium_clean' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (universe = 'premium_clean')}>Clean universe</button>
      <button class="px-2.5 py-1.5 font-medium transition-colors {universe === 'all' ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => (universe = 'all')}>All coins</button>
    </div>
  </div>

  <!-- Headline -->
  <div class="hero-card mb-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Altcoin Season Index</span>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <span class="text-3xl font-bold text-strong">{d.altcoin_season_index}<span class="text-lg text-muted">/100</span></span>
          <span class="pill {regimePill(d.regime_label)}">{d.regime_label}</span>
          <span class="pill {confPill(d.confidence)}">{d.confidence} confidence</span>
        </div>
        <div class="meter mt-2 max-w-md"><div class="meter-fill {/^altcoin season|^broad/i.test(d.regime_label) ? 'bg-mint' : /^btc season|weakness/i.test(d.regime_label) ? 'bg-danger' : 'bg-warn'}" style="width: {d.altcoin_season_index}%"></div></div>
        <p class="mt-2 max-w-2xl text-sm leading-relaxed text-soft">{d.premium_takeaway}</p>
      </div>
    </div>
  </div>

  <!-- Breadth metrics -->
  <div class="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
    <div class="card"><p class="stat-label">Outperforming BTC</p><p class="mt-0.5 text-xl font-bold text-strong">{d.outperforming_btc_percent}%</p><p class="text-[11px] text-muted">{d.outperforming_btc_count}/{d.tracked_count} beat BTC</p></div>
    <div class="card"><p class="stat-label">Positive (absolute)</p><p class="mt-0.5 text-xl font-bold {d.positive_return_percent >= 50 ? 'text-mint' : 'text-warn'}">{d.positive_return_percent}%</p><p class="text-[11px] text-muted">{d.positive_return_count}/{d.tracked_count} actually up</p></div>
    <div class="card"><p class="stat-label">BTC return ({d.timeframe})</p><p class="mt-0.5 text-xl font-bold {d.btc_return >= 0 ? 'text-mint' : 'text-danger'}">{rel(d.btc_return)}</p></div>
    <div class="card"><p class="stat-label">Season quality</p><p class="mt-0.5 text-xl font-bold text-strong">{d.altcoin_season_quality}</p><p class="text-[11px] text-muted">{d.quality_label}</p></div>
  </div>

  <!-- Relative vs absolute education -->
  <div class="mb-3 flex items-start gap-2 rounded-lg border border-edge bg-panel-2/40 px-3 py-2.5 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-4 w-4 shrink-0 text-accent" />
    <span><span class="font-medium text-soft">Relative vs absolute:</span> a coin can “outperform BTC” yet still be down in USD. If BTC is {rel(d.btc_return)} and a coin is only −5%, it beat BTC but is still negative — that’s defensive relative strength, not true bullish strength.</span>
  </div>

  <!-- Tables -->
  {#snippet coinList(title: string, rows: CoinRow[], empty: string)}
    <div class="card">
      <h3 class="mb-2 text-sm font-semibold text-strong">{title} <span class="text-xs font-normal text-muted">({rows.length})</span></h3>
      {#if !rows.length}
        <p class="py-3 text-center text-xs text-muted">{empty}</p>
      {:else}
        <div class="space-y-1.5">
          {#each rows as c}
            <div class="flex items-center justify-between gap-2 rounded-lg border border-edge bg-panel-2/40 px-2.5 py-2">
              <div class="flex min-w-0 items-center gap-2">
                {#if c.image}<img src={c.image} alt="" class="h-6 w-6 shrink-0 rounded-full" />{:else}<div class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[9px] font-semibold text-muted">{c.symbol.slice(0, 3)}</div>{/if}
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 text-sm font-medium text-strong">{c.symbol}{#if c.badge !== 'Clean'}<span class="pill bg-edge text-[9px] text-muted">{c.badge}</span>{/if}</div>
                  <div class="truncate text-[11px] text-muted">{c.name}</div>
                </div>
              </div>
              <div class="shrink-0 text-right">
                <div class="text-sm font-semibold {c.coin_return >= 0 ? 'text-mint' : 'text-danger'}">{rel(c.coin_return)}</div>
                <div class="text-[11px] {c.relative >= 0 ? 'text-mint/80' : 'text-danger/80'}">vs BTC {rel(c.relative)}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}

  <div class="grid gap-3 lg:grid-cols-3">
    {@render coinList('True leaders', d.true_leaders, 'No altcoins are positive AND beating BTC right now.')}
    {@render coinList('Relative defenders', d.relative_defenders, 'No coins are beating BTC while still negative.')}
    {@render coinList('Weak vs BTC', d.weak_vs_btc, 'No clear underperformers.')}
  </div>

  <p class="mt-2 text-[11px] text-muted">
    <span class="font-medium text-soft">True leaders</span> beat BTC and are up in USD. <span class="font-medium text-soft">Relative defenders</span> beat BTC but are still down. <span class="font-medium text-soft">Weak vs BTC</span> underperformed BTC.
  </p>

  <!-- History chart -->
  {#if history.length}
    <div class="card mt-3">
      <h3 class="mb-2 text-sm font-semibold text-strong">Altcoin Season Index — history ({d.timeframe} window)</h3>
      <EChart option={histOption} height={300} />
      <p class="mt-2 text-[11px] leading-relaxed text-muted">Blue = Season Index (% beating BTC). Green = positive-return breadth (% actually up). When blue is high but green is low, it's relative strength, not a real altcoin season. Shaded zones: BTC season (0–25) / altcoin season (75–100).</p>
    </div>
  {/if}

  <!-- Data quality + definition -->
  <div class="mt-3 rounded-lg border border-edge bg-panel-2/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted">
    <p>
      <span class="font-medium text-soft">How it's measured:</span> the Index = share of tracked liquid, non-stable altcoins that outperformed BTC over {d.timeframe} ({d.outperforming_btc_count}/{d.tracked_count} = {d.outperforming_btc_percent}%).
      Universe: {d.universe === 'premium_clean' ? 'Premium clean (top-100, ≥$10M volume, ≥180d history, no stable/wrapped)' : 'All coins (badged)'}.
    </p>
    <p class="mt-1">
      Data quality — clean {d.data_quality_summary.clean}, short history {d.data_quality_summary.short_history}, low liquidity {d.data_quality_summary.low_liquidity}, abnormal {d.data_quality_summary.abnormal_spike}, excluded {d.data_quality_summary.excluded}.
      {#if d.above_ma50_percent != null}· {d.above_ma50_percent}% above Alt 50-day MA, {d.above_ma200_percent}% above 200-day MA.{/if}
    </p>
    <p class="mt-1 text-soft">Confidence: {d.confidence} — {d.confidence_reason}</p>
  </div>

  <div class="mt-4"><Disclaimer /></div>
{/if}
