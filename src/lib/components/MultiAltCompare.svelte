<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import { api } from '$lib/api';
  import EChart from '$lib/components/EChart.svelte';
  import { changeColor, fmtPct, signalColor } from '$lib/format';

  interface CoinOpt {
    coingecko_id: string;
    symbol: string;
    name: string;
  }
  interface CompareCoin {
    coingecko_id: string;
    symbol: string;
    name: string;
    points: { date: string; ratio: number }[];
    strength_7d: number | null;
    strength_30d: number | null;
    strength_90d: number | null;
    signal: string;
    reaction_score: number;
    reaction_label: string;
    above_ma200: boolean;
    premium_signal: string;
    trend_state: string;
    confidence: string;
  }

  const premiumColor = (label: string): string => {
    if (['Strong leader', 'Confirmed strength', 'Market leader'].includes(label)) return 'bg-mint/15 text-mint';
    if (label === 'Early recovery') return 'bg-accent/15 text-accent';
    if (['Overextended', 'Watch only', 'Neutral'].includes(label)) return 'bg-warn/15 text-warn';
    return 'bg-danger/15 text-danger';
  };
  const confidenceColor = (c: string): string =>
    c.startsWith('High') ? 'bg-mint/15 text-mint' : c.startsWith('Medium') ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger';

  let { coins }: { coins: CoinOpt[] } = $props();

  const TF: Record<string, number> = { '30D': 30, '90D': 90, '180D': 180, '1Y': 365 };
  const PALETTE = ['#F59E0B', '#3B82F6', '#22C55E', '#EF4444', '#c084fc', '#22d3ee', '#f472b6', '#34d399'];

  const DEFAULT = ['ethereum', 'solana', 'sui', 'injective-protocol', 'chainlink', 'jupiter-exchange-solana'];

  let selected = $state<string[]>([...DEFAULT]);
  let timeframe = $state<keyof typeof TF | string>('90D');
  let sortBy = $state<'30d' | '90d'>('90d');
  let data = $state<CompareCoin[]>([]);
  let verdict = $state('');
  let hidden = $state<Set<string>>(new Set());
  let addId = $state('');
  let loading = $state(true);
  let error = $state('');

  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);

  const colorMap = $derived.by(() => {
    const m: Record<string, string> = {};
    data.forEach((c, i) => (m[c.coingecko_id] = PALETTE[i % PALETTE.length]));
    return m;
  });

  const load = async () => {
    loading = true;
    error = '';
    try {
      const r = await api<{ coins: CompareCoin[]; verdict: string }>(`/altcoin-btc/compare?coins=${selected.join(',')}`);
      data = r.coins;
      verdict = r.verdict;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load comparison.';
    } finally {
      loading = false;
    }
  };

  onMount(load);

  const addCoin = (e: Event) => {
    const id = (e.target as HTMLSelectElement).value;
    if (id && !selected.includes(id)) {
      selected = [...selected, id];
      load();
    }
    addId = '';
  };
  const removeCoin = (id: string) => {
    selected = selected.filter((s) => s !== id);
    load();
  };
  const toggle = (id: string) => {
    const n = new Set(hidden);
    n.has(id) ? n.delete(id) : n.add(id);
    hidden = n;
  };

  const ranked = $derived(
    [...data].sort((a, b) => {
      const key = sortBy === '90d' ? 'strength_90d' : 'strength_30d';
      return (b[key] ?? -1e9) - (a[key] ?? -1e9);
    })
  );

  // Overlay: each coin's Alt/BTC ratio normalized to 100 from the window start.
  const chartOption = $derived.by(() => {
    if (!data.length) return {};
    const visible = data.filter((c) => !hidden.has(c.coingecko_id));
    return {
      backgroundColor: 'transparent',
      grid: { left: 52, right: 16, top: 28, bottom: 32 },
      legend: { show: false },
      tooltip: { trigger: 'axis', backgroundColor: '#0E1117', borderColor: '#1F2937', textStyle: { color: '#F9FAFB', fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: {
        type: 'value',
        name: 'Alt/BTC indexed to 100',
        nameTextStyle: { color: '#9CA3AF' },
        axisLabel: { color: '#9CA3AF' },
        axisLine: { lineStyle: { color: '#1F2937' } },
        splitLine: { lineStyle: { color: '#1F2937' } },
        scale: true
      },
      series: visible.map((c) => {
        const pts = c.points.slice(-TF[timeframe]);
        const base = pts[0]?.ratio || 1;
        return {
          name: c.symbol,
          type: 'line',
          showSymbol: false,
          lineStyle: { width: 2, color: colorMap[c.coingecko_id] },
          data: pts.map((p) => [ts(p.date), Number(((p.ratio / base) * 100).toFixed(2))])
        };
      })
    };
  });

  const interpretation = $derived.by(() => {
    if (!ranked.length) return '';
    const leader = ranked[0];
    const weakest = ranked[ranked.length - 1];
    const recovering = data.find((c) => (c.strength_30d ?? 0) > 0 && !c.above_ma200 && c !== leader);
    let txt = `${leader.symbol} is leading the selected basket against BTC over the last 90 days (${fmtPct(leader.strength_90d)}).`;
    if (recovering)
      txt += ` ${recovering.symbol} is recovering (${fmtPct(recovering.strength_30d)} on 30d) but still needs confirmation above its 200-day Alt/BTC moving average.`;
    else if ((weakest.strength_90d ?? 0) < -5) txt += ` ${weakest.symbol} is the weakest, still bleeding against BTC (${fmtPct(weakest.strength_90d)}).`;
    return txt;
  });

  const available = $derived(coins.filter((c) => !selected.includes(c.coingecko_id)));
</script>

<!-- Selector + timeframe -->
<div class="card mb-4">
  <div class="flex flex-wrap items-center gap-3">
    <div>
      <label class="stat-label" for="add">Add coin</label>
      <select id="add" class="input mt-1 w-44" value={addId} onchange={addCoin}>
        <option value="">Select…</option>
        {#each available as c}<option value={c.coingecko_id}>{c.symbol} · {c.name}</option>{/each}
      </select>
    </div>
    <div>
      <span class="stat-label">Timeframe</span>
      <div class="mt-1 flex gap-1">
        {#each Object.keys(TF) as t}
          <button class="rounded-md px-2 py-1 text-sm" class:bg-panel-2={timeframe === t} class:text-strong={timeframe === t} class:text-muted={timeframe !== t} onclick={() => (timeframe = t)}>{t}</button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Coin chips (click = toggle visibility, × = remove) -->
  <div class="mt-3 flex flex-wrap gap-2">
    {#each data as c}
      <div class="pill border" style={!hidden.has(c.coingecko_id) ? `background:${colorMap[c.coingecko_id]}22;color:${colorMap[c.coingecko_id]};border-color:${colorMap[c.coingecko_id]}` : 'border-color:#1F2937;color:#9CA3AF'}>
        <button onclick={() => toggle(c.coingecko_id)}>{c.symbol}/BTC</button>
        <button class="opacity-70 hover:opacity-100" aria-label="Remove" onclick={() => removeCoin(c.coingecko_id)}><X class="h-3 w-3" /></button>
      </div>
    {/each}
  </div>
</div>

{#if loading}
  <div class="card text-center text-muted">Loading comparison…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if data.length}
  <div class="card">
    <EChart option={chartOption} height={400} />
    <p class="mt-1 text-xs text-muted">Each line = a coin’s Alt/BTC ratio indexed to 100 at the start of the window. Rising = outperforming BTC.</p>
  </div>

  <!-- Ranking table -->
  <div class="card mt-4 p-0">
    <div class="flex items-center justify-between border-b border-edge px-4 py-3">
      <h2 class="text-sm font-semibold text-strong">Ranking vs BTC</h2>
      <div class="flex items-center gap-1 text-xs">
        <span class="stat-label mr-1">Sort</span>
        <button class="rounded px-2 py-0.5" class:bg-panel-2={sortBy === '30d'} class:text-strong={sortBy === '30d'} class:text-muted={sortBy !== '30d'} onclick={() => (sortBy = '30d')}>30d</button>
        <button class="rounded px-2 py-0.5" class:bg-panel-2={sortBy === '90d'} class:text-strong={sortBy === '90d'} class:text-muted={sortBy !== '90d'} onclick={() => (sortBy = '90d')}>90d</button>
      </div>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
            <th class="px-3 py-2">#</th>
            <th class="px-3 py-2">Coin</th>
            <th class="px-3 py-2">7d</th>
            <th class="px-3 py-2">30d</th>
            <th class="px-3 py-2">90d</th>
            <th class="px-3 py-2">Oscillator</th>
            <th class="px-3 py-2">200D MA</th>
            <th class="px-3 py-2">Reaction</th>
            <th class="px-3 py-2">Premium signal</th>
            <th class="px-3 py-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {#each ranked as c, i}
            <tr class="border-b border-edge/60 last:border-0">
              <td class="px-3 py-2 text-muted">{i + 1}</td>
              <td class="px-3 py-2 font-medium text-strong">
                <span class="inline-block h-2 w-2 rounded-sm align-middle" style="background: {colorMap[c.coingecko_id]}"></span>
                {c.symbol}
              </td>
              <td class="px-3 py-2 {changeColor(c.strength_7d)}">{fmtPct(c.strength_7d)}</td>
              <td class="px-3 py-2 {changeColor(c.strength_30d)}">{fmtPct(c.strength_30d)}</td>
              <td class="px-3 py-2 {changeColor(c.strength_90d)}">{fmtPct(c.strength_90d)}</td>
              <td class="px-3 py-2"><span class="pill {signalColor(c.signal)}">{c.signal}</span></td>
              <td class="px-3 py-2">
                <span class="pill {c.above_ma200 ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'}">{c.above_ma200 ? 'Above' : 'Below'}</span>
              </td>
              <td class="px-3 py-2 text-soft">{c.reaction_score}</td>
              <td class="px-3 py-2"><span class="pill {premiumColor(c.premium_signal)}">{c.premium_signal}</span></td>
              <td class="px-3 py-2"><span class="pill {confidenceColor(c.confidence)} text-[10px]">{c.confidence.replace(' confidence', '')}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>

  <div class="card mt-4">
    <h3 class="text-sm font-semibold text-strong">Selected basket summary</h3>
    <p class="mt-1 text-sm leading-relaxed text-soft">{verdict || interpretation}</p>
  </div>
{/if}
