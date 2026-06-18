<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, List, ChevronDown } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { fmtPct, fmtUsd } from '$lib/format';
  import BarChart from '$lib/components/BarChart.svelte';
  import MultiLineChart from '$lib/components/MultiLineChart.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import AltcoinSeason from '$lib/components/AltcoinSeason.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';

  interface ChartDef {
    key: string;
    title: string;
    category: string;
    render: string;
    asset: string;
    description: string;
  }

  const PALETTE = ['#37e0a6', '#5b8cff', '#ffb547', '#ff5d6c', '#c084fc', '#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#34d399'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let catalog = $state<ChartDef[]>([]);
  let search = $state('');
  let selected = $state<ChartDef | null>(null);
  let browseOpen = $state(false); // mobile: catalog collapsed by default
  let chart = $state<any>(null);
  let error = $state('');
  let loadingChart = $state(false);

  // DCA simulator inputs
  let dcaAmount = $state(100);
  let dcaFrom = $state('');
  let dcaTo = $state('');
  let dcaBusy = $state(false);

  // Overlay: which years are visible
  let visibleYears = $state<Set<number>>(new Set());

  const filtered = $derived(
    catalog.filter(
      (c) =>
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.category.toLowerCase().includes(search.toLowerCase())
    )
  );

  const colorByYear = $derived.by(() => {
    const map: Record<number, string> = {};
    if (chart?.render === 'multiline') chart.series.forEach((s: any, i: number) => (map[s.year] = PALETTE[i % PALETTE.length]));
    return map;
  });
  const visibleSeries = $derived(
    chart?.render === 'multiline'
      ? chart.series.filter((s: any) => visibleYears.has(s.year)).map((s: any) => ({ ...s, color: colorByYear[s.year] }))
      : []
  );

  const heatColor = (v: number | null) => {
    if (v == null) return 'transparent';
    const a = Math.min(Math.abs(v) / 40, 1) * 0.8 + 0.05;
    return v >= 0 ? `rgba(55,224,166,${a})` : `rgba(255,93,108,${a})`;
  };

  const select = async (def: ChartDef) => {
    selected = def;
    browseOpen = false; // close the mobile catalog after picking
    loadingChart = true;
    error = '';
    chart = null;
    try {
      const data: any = await api(`/charts/${def.key}`);
      chart = data;
      if (data.render === 'dca') {
        dcaAmount = data.amount;
        dcaFrom = data.from;
        dcaTo = data.to;
      }
      if (data.render === 'multiline') {
        // Default to the last 6 years visible.
        const years = data.series.map((s: any) => s.year);
        visibleYears = new Set(years.slice(-6));
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load chart.';
    } finally {
      loadingChart = false;
    }
  };

  let dcaTimer: ReturnType<typeof setTimeout>;
  const reloadDca = () => {
    clearTimeout(dcaTimer);
    dcaTimer = setTimeout(async () => {
      dcaBusy = true;
      try {
        const q = new URLSearchParams({ amount: String(dcaAmount || 0), from: dcaFrom, to: dcaTo });
        chart = await api(`/charts/best-day-to-dca?${q.toString()}`);
      } catch (err) {
        error = err instanceof Error ? err.message : 'Failed to recompute.';
      } finally {
        dcaBusy = false;
      }
    }, 250);
  };

  const toggleYear = (year: number) => {
    const next = new Set(visibleYears);
    next.has(year) ? next.delete(year) : next.add(year);
    visibleYears = next;
  };

  const bestRow = $derived(
    chart?.render === 'dca' && chart.table?.length
      ? [...chart.table].sort((a: any, b: any) => b.roi - a.roi)[0]
      : null
  );

  onMount(async () => {
    try {
      const data = await api<{ items: ChartDef[] }>('/charts');
      catalog = data.items;
      if (catalog[0]) await select(catalog[0]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load catalog.';
    }
  });
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">Charts</h1>
  <p class="text-sm text-muted">A catalog of DCA, returns, ROI and rotation charts — computed from free market data.</p>
</header>

<!-- Mobile: collapsible catalog toggle (chart shows first on phones) -->
<button
  class="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-edge bg-panel px-4 py-2.5 text-sm font-medium text-soft lg:hidden"
  onclick={() => (browseOpen = !browseOpen)}
>
  <span class="flex min-w-0 items-center gap-2"><List class="h-4 w-4 shrink-0 text-muted" /> <span class="truncate">{selected ? selected.title : 'Browse charts'}</span></span>
  <ChevronDown class="h-4 w-4 shrink-0 transition {browseOpen ? 'rotate-180' : ''}" />
</button>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
  <!-- Search sidebar (collapsed on mobile, always shown on lg) -->
  <aside class="card p-0 min-w-0 {browseOpen ? '' : 'hidden'} lg:block">
    <div class="border-b border-edge p-3">
      <div class="flex items-center gap-2 rounded-lg border border-edge bg-panel-2 px-2">
        <Search class="h-4 w-4 text-muted" />
        <input class="w-full bg-transparent py-2 text-sm text-strong outline-none placeholder:text-muted" placeholder="Search charts…" bind:value={search} />
      </div>
    </div>
    <div class="max-h-[55vh] overflow-y-auto p-2 lg:max-h-[70vh]">
      {#each filtered as def}
        <button
          class="w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-panel-2"
          class:bg-panel-2={selected?.key === def.key}
          class:text-mint={selected?.key === def.key}
          class:text-soft={selected?.key !== def.key}
          onclick={() => select(def)}
        >
          {def.title}
          <span class="block text-xs text-muted">{def.category} · {def.asset}</span>
        </button>
      {:else}
        <p class="px-3 py-4 text-center text-xs text-muted">No charts match.</p>
      {/each}
    </div>
  </aside>

  <!-- Main panel -->
  <section class="card min-h-[360px] min-w-0">
    {#if error}
      <div class="text-danger">{error}</div>
    {:else if loadingChart || !chart}
      <div class="py-20 text-center text-muted">Loading chart…</div>
    {:else}
      <div class="mb-4">
        <h2 class="text-lg font-semibold text-strong">{selected?.title}</h2>
        <p class="text-sm text-muted">{selected?.description}</p>
      </div>

      {#if chart.render === 'dca'}
        <!-- Controls -->
        <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label class="stat-label" for="amt">Amount per buy (USD)</label>
            <input id="amt" class="input mt-1" type="number" min="1" bind:value={dcaAmount} oninput={reloadDca} />
          </div>
          <div>
            <label class="stat-label" for="from">From</label>
            <input id="from" class="input mt-1" type="date" min={chart.min_date} max={chart.max_date} bind:value={dcaFrom} onchange={reloadDca} />
          </div>
          <div>
            <label class="stat-label" for="to">To</label>
            <input id="to" class="input mt-1" type="date" min={chart.min_date} max={chart.max_date} bind:value={dcaTo} onchange={reloadDca} />
          </div>
        </div>

        {#if bestRow}
          <p class="mb-3 text-sm text-soft">
            Best weekday over this range: <span class="font-semibold text-mint">{bestRow.label}</span>
            ({fmtPct(bestRow.roi)} ROI, avg cost {fmtUsd(bestRow.avg_cost)}) {dcaBusy ? '· recomputing…' : ''}
          </p>
        {/if}

        <BarChart bars={chart.bars} unit="%" />

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[640px] text-sm">
            <thead>
              <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
                <th class="px-3 py-2">Day</th>
                <th class="px-3 py-2">Buys</th>
                <th class="px-3 py-2">Invested</th>
                <th class="px-3 py-2">BTC</th>
                <th class="px-3 py-2">Avg Cost</th>
                <th class="px-3 py-2">Value</th>
                <th class="px-3 py-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {#each chart.table as r}
                <tr class="border-b border-edge/60 last:border-0">
                  <td class="px-3 py-2 font-medium text-strong">{r.label}</td>
                  <td class="px-3 py-2 text-soft">{r.buys}</td>
                  <td class="px-3 py-2 text-soft">{fmtUsd(r.invested, { compact: true })}</td>
                  <td class="px-3 py-2 text-soft">{r.btc.toFixed(4)}</td>
                  <td class="px-3 py-2 text-soft">{fmtUsd(r.avg_cost)}</td>
                  <td class="px-3 py-2 text-soft">{fmtUsd(r.value, { compact: true })}</td>
                  <td class="px-3 py-2 {r.roi >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(r.roi)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if chart.render === 'multiline'}
        <!-- Year toggle chips -->
        <div class="mb-3 flex flex-wrap gap-2">
          {#each chart.series as s}
            <button
              class="pill border transition"
              style={visibleYears.has(s.year)
                ? `background:${colorByYear[s.year]}22;color:${colorByYear[s.year]};border-color:${colorByYear[s.year]}`
                : 'border-color:#222b39;color:#8b97a8'}
              onclick={() => toggleYear(s.year)}
            >
              {s.year}
            </button>
          {/each}
        </div>
        <MultiLineChart series={visibleSeries} unit="%" />
        <p class="mt-2 text-xs text-muted">Each line = one year’s cumulative ROI from Jan 1. Toggle years to compare.</p>
      {:else if chart.render === 'bar'}
        <BarChart bars={chart.bars} unit={chart.unit ?? ''} />
        {#if chart.note}<p class="mt-2 text-xs text-muted">{chart.note}</p>{/if}
      {:else if chart.render === 'line'}
        <p class="mb-2 text-sm text-muted">
          Cumulative ROI since {chart.from} ·
          <span class="font-semibold {chart.roi.at(-1) >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(chart.roi.at(-1))}</span>
        </p>
        <Sparkline points={chart.roi} height={200} />
      {:else if chart.render === 'heatmap'}
        <div class="overflow-x-auto">
          <table class="w-full min-w-[640px] text-center text-xs">
            <thead>
              <tr class="text-muted">
                <th class="px-2 py-1 text-left">Year</th>
                {#each MONTHS as m}<th class="px-1 py-1">{m}</th>{/each}
              </tr>
            </thead>
            <tbody>
              {#each [...chart.rows].reverse() as row}
                <tr>
                  <td class="px-2 py-1 text-left font-medium text-soft">{row.year}</td>
                  {#each row.months as v}
                    <td class="px-1 py-1">
                      <div class="rounded px-1 py-1.5 text-[11px] text-strong" style="background: {heatColor(v)}">
                        {v == null ? '' : v.toFixed(0)}
                      </div>
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if chart.render === 'index'}
        <!-- Robust Altcoin Season module (self-fetches the dedicated endpoint with
             timeframe + universe controls and relative-vs-absolute breakdown). -->
        <AltcoinSeason />
      {/if}

      {#if chart.render !== 'index'}<div class="mt-6"><Disclaimer /></div>{/if}
    {/if}
  </section>
</div>
