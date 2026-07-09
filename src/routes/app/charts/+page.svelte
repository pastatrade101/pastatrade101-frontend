<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, List, ChevronDown, Copy, Check, Sparkles, Eye, AlertTriangle, Info, BookOpen } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { fmtPct, fmtUsd } from '$lib/format';
  import BarChart from '$lib/components/BarChart.svelte';
  import MultiLineChart from '$lib/components/MultiLineChart.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import AltcoinSeason from '$lib/components/AltcoinSeason.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';

  interface ChartDef { key: string; title: string; category: string; render: string; asset: string; description: string }

  const PALETTE = ['#37e0a6', '#5b8cff', '#ffb547', '#ff5d6c', '#c084fc', '#22d3ee', '#f472b6', '#a3e635', '#fb923c', '#34d399'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  let catalog = $state<ChartDef[]>([]);
  let search = $state('');
  let selected = $state<ChartDef | null>(null);
  let browseOpen = $state(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chart = $state<any>(null);
  let error = $state('');
  let loadingChart = $state(false);
  let copied = $state(false);

  let dcaAmount = $state(100);
  let dcaFrom = $state('');
  let dcaTo = $state('');
  let dcaBusy = $state(false);

  // Overlay state
  let visibleYears = $state<Set<number>>(new Set());
  let showMedian = $state(true);
  let showAverage = $state(false);
  let focusYear = $state<number | null>(null);

  const filtered = $derived(catalog.filter((c) => `${c.title} ${c.category} ${c.description}`.toLowerCase().includes(search.toLowerCase())));
  // Grouped catalog by category.
  const grouped = $derived.by(() => {
    const m = new Map<string, ChartDef[]>();
    for (const c of filtered) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return [...m.entries()];
  });
  // "Recommended today" — a curated subset by title/category.
  const recommended = $derived(catalog.filter((c) => /roi overlay|altcoin season|annual returns/i.test(c.title)).slice(0, 4));

  const colorByYear = $derived.by(() => {
    const map: Record<number, string> = {};
    if (chart?.render === 'multiline') chart.series.forEach((s: { year: number }, i: number) => (map[s.year] = PALETTE[i % PALETTE.length]));
    return map;
  });

  // ── Multiline (ROI overlay) intelligence ──
  type Pt = { x: number; y: number };
  const seriesByYear = $derived.by(() => {
    const m = new Map<number, Pt[]>();
    if (chart?.render === 'multiline') for (const s of chart.series) m.set(s.year, s.points);
    return m;
  });
  const yStrict = (pts: Pt[], day: number): number | null => {
    if (!pts.length || day > pts[pts.length - 1].x) return null;
    let v: number | null = null;
    for (const p of pts) {
      if (p.x <= day) v = p.y;
      else break;
    }
    return v;
  };
  const median = (a: number[]) => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const overlay = $derived.by(() => {
    if (chart?.render !== 'multiline') return null;
    const years = chart.series.map((s: { year: number }) => s.year).sort((a: number, b: number) => a - b);
    const curYear = years[years.length - 1];
    const curPts = seriesByYear.get(curYear) ?? [];
    const curDay = curPts.length ? curPts[curPts.length - 1].x : 0;
    const curROI = curPts.length ? curPts[curPts.length - 1].y : 0;
    const sel = [...visibleYears];
    const vals = sel
      .map((y) => ({ year: y, v: yStrict(seriesByYear.get(y) ?? [], curDay) }))
      .filter((d): d is { year: number; v: number } => d.v != null)
      .sort((a, b) => b.v - a.v);
    const med = median(vals.map((d) => d.v));
    const avg = vals.length ? vals.reduce((s, d) => s + d.v, 0) / vals.length : 0;
    const rank = vals.findIndex((d) => d.year === curYear) + 1;
    const best = vals[0] ?? null;
    const worst = vals[vals.length - 1] ?? null;
    const band = Math.max(8, Math.abs(med) * 0.15);
    let regime: string, tone: string;
    if (curROI > med + band * 3) (regime = 'Overheated yearly performance'), (tone = 'danger');
    else if (curROI > med + band) (regime = 'Strong yearly performance'), (tone = 'mint');
    else if (curROI >= med - band) (regime = 'Neutral'), (tone = 'blue');
    else if (curROI < med - band * 2 && curROI < 0) (regime = 'Weak yearly performance'), (tone = 'danger');
    else (regime = 'Below median'), (tone = 'warn');
    const conf = vals.length >= 5 && curDay >= 150 ? 'High' : vals.length >= 3 && curDay >= 45 ? 'Medium' : 'Low';
    const confReason = vals.length < 3 ? 'Fewer than 3 years selected.' : curDay < 45 ? 'The current year is only a few weeks in.' : curDay < 150 ? 'The current year is only partially complete; selected years include high-volatility outliers.' : 'Several full years selected with enough elapsed days.';
    return { curYear, curDay, curROI, vals, med, avg, rank, best, worst, regime, tone, conf, confReason };
  });

  // Median / average overlay line points (over the selected years).
  const statSeries = $derived.by(() => {
    if (chart?.render !== 'multiline' || !overlay) return [] as { year: string; points: Pt[]; color: string; dash: string; width: number; opacity: number }[];
    const sel = [...visibleYears];
    const out = [];
    const build = (fn: (a: number[]) => number, color: string, label: string, dash: string) => {
      const pts: Pt[] = [];
      for (let d = 1; d <= 366; d += 1) {
        const vs = sel.map((y) => yStrict(seriesByYear.get(y) ?? [], d)).filter((v): v is number => v != null);
        if (vs.length >= 2) pts.push({ x: d, y: fn(vs) });
      }
      return { year: label, points: pts, color, dash, width: 2.4, opacity: 1 };
    };
    if (showMedian) out.push(build(median, '#F59E0B', 'Median', '5 4'));
    if (showAverage) out.push(build((a) => a.reduce((s, v) => s + v, 0) / a.length, '#3B82F6', 'Average', '2 4'));
    return out;
  });

  const visibleSeries = $derived.by(() => {
    if (chart?.render !== 'multiline') return [];
    const cur = overlay?.curYear;
    const base = chart.series
      .filter((s: { year: number }) => visibleYears.has(s.year))
      .map((s: { year: number; points: Pt[] }) => ({
        year: s.year,
        points: s.points,
        color: colorByYear[s.year],
        width: s.year === cur ? 3.2 : 1.8,
        opacity: focusYear == null ? (s.year === cur ? 1 : 0.85) : focusYear === s.year ? 1 : 0.18
      }));
    return [...base, ...statSeries];
  });

  // Year preset groups (intersected with available years).
  const applyPreset = (list: number[]) => {
    const avail = new Set(chart.series.map((s: { year: number }) => s.year));
    visibleYears = new Set(list.filter((y) => avail.has(y)));
  };
  const allYears = $derived(chart?.render === 'multiline' ? chart.series.map((s: { year: number }) => s.year) : []);
  const PRESETS: [string, number[]][] = [
    ['Bull', [2013, 2017, 2021, 2025]],
    ['Bear', [2014, 2018, 2022]],
    ['Recovery', [2015, 2019, 2023]],
    ['Halving', [2012, 2016, 2020, 2024]],
    ['Post-halving', [2013, 2017, 2021, 2025]]
  ];

  // ── Per-chart guides (how to read / what it means / what to watch) ──
  const GUIDE: Record<string, { read: string; means: string; watch: string[] }> = {
    ROI: {
      read: 'Each line starts at 0% on Jan 1. If it rises, BTC is gaining from the start of that year; if it falls, BTC is losing. Comparing years shows whether the current year behaves like a strong, weak or neutral market year.',
      means: 'Below the median, BTC is not showing strong yearly momentum yet. Rising above the median and tracking strong bull years can signal improving cycle strength; moving far above historical ranges means risk may be elevated.',
      watch: ['Current year crossing above the selected-year median', 'Current year tracking closer to strong bull years', 'BTC risk staying low while ROI improves', 'Altcoin breadth improving alongside BTC strength']
    },
    Returns: {
      read: 'Each bar shows BTC’s return for that period (a month or a full year). Green bars are gains, red bars are losses.',
      means: 'A run of strong bars suggests a favorable return period; clusters of weak/negative bars suggest a weak period. Returns are historical, not a forecast.',
      watch: ['Whether recent bars are turning positive', 'How the latest period compares with the historical average', 'Confirmation from BTC risk and trend']
    },
    Seasonality: {
      read: 'Each bar shows BTC’s average return for that month across history. It hints at seasonal tendencies — not guarantees.',
      means: 'Stronger average months suggest historically favorable seasonality; weaker months suggest caution. Seasonality is a tendency, easily overridden by the cycle.',
      watch: ['Whether the current month is historically strong or weak', 'Whether the cycle/regime agrees with seasonality']
    },
    DCA: {
      read: 'The chart compares average DCA results by weekday over your selected range. It shows which day historically gave a better average cost — the effect is usually small.',
      means: 'Day-of-week differences are typically minor; consistency matters far more than timing. Use this as a curiosity, not a strategy.',
      watch: ['Whether the gap between best and worst day is meaningful', 'Longer ranges to reduce noise']
    },
    Altcoins: {
      read: 'Tracks whether altcoins are broadly outperforming Bitcoin. Higher = more alts beating BTC.',
      means: 'High readings point toward altcoin strength/season; low readings mean BTC is leading. Selective strength still needs broad positive breadth to confirm a full altcoin season.',
      watch: ['Positive-return breadth expanding', 'ETH/BTC and majors confirming', 'BTC dominance rolling over']
    }
  };
  const guide = $derived(selected ? GUIDE[selected.category] ?? null : null);

  // ── Takeaway + snapshot (copyable) ──
  const takeaway = $derived.by(() => {
    if (chart?.render === 'multiline' && overlay) {
      const o = overlay;
      const where = o.curROI >= o.med ? 'above' : 'below';
      const overheated = o.regime.startsWith('Overheated');
      return `${o.curYear} ROI is ${o.curROI.toFixed(0)}% to date — ${where} the selected-year median (${o.med.toFixed(0)}%), ranking ${o.rank} of ${o.vals.length}. ${o.best && o.worst ? `Strongest selected year is ${o.best.year} (${o.best.v.toFixed(0)}%), weakest ${o.worst.year} (${o.worst.v.toFixed(0)}%).` : ''} This suggests BTC is ${overheated ? 'in an overheated yearly ROI phase' : 'not yet in an overheated yearly ROI phase'}.`;
    }
    return selected?.description ?? '';
  });

  const snapshot = $derived.by(() => {
    if (chart?.render === 'multiline' && overlay) {
      const o = overlay;
      return `${selected?.title} — Snapshot\nCurrent year: ${o.curYear}\nROI to date: ${o.curROI.toFixed(1)}%\nSelected-year median: ${o.med.toFixed(1)}%\nRank: ${o.rank} / ${o.vals.length}\nRegime: ${o.regime}\nTakeaway: ${takeaway}`;
    }
    return `${selected?.title} — Pastatrade Charts\n${selected?.description ?? ''}`;
  });

  const toneClass: Record<string, string> = { mint: 'bg-mint/15 text-mint', blue: 'bg-accent/15 text-accent', warn: 'bg-warn/15 text-warn', danger: 'bg-danger/15 text-danger' };
  const confClass = (c: string) => (c === 'High' ? 'bg-mint/15 text-mint' : c === 'Low' ? 'bg-danger/15 text-danger' : 'bg-warn/15 text-warn');
  const yearStatus = (v: number) => (v >= 50 ? 'text-mint' : v >= 0 ? 'text-soft' : 'text-danger');
  const heatColor = (v: number | null): string => {
    if (v == null) return 'transparent';
    const a = Math.min(Math.abs(v) / 40, 1) * 0.8 + 0.05;
    return v >= 0 ? `rgba(55,224,166,${a})` : `rgba(255,93,108,${a})`;
  };

  const select = async (def: ChartDef) => {
    selected = def;
    browseOpen = false;
    loadingChart = true;
    error = '';
    chart = null;
    focusYear = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await api(`/charts/${def.key}`);
      chart = data;
      if (data.render === 'dca') {
        dcaAmount = data.amount;
        dcaFrom = data.from;
        dcaTo = data.to;
      }
      if (data.render === 'multiline') visibleYears = new Set(data.series.map((s: { year: number }) => s.year).slice(-6));
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
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(snapshot);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bestRow = $derived(chart?.render === 'dca' && chart.table?.length ? [...chart.table].sort((a: any, b: any) => b.roi - a.roi)[0] : null);
  const hasIntel = $derived(chart && chart.render !== 'index');

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

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Charts</h1>
  <p class="text-sm text-muted">Historical market charts with built-in interpretation — not just lines.</p>
</header>

<button class="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-edge bg-panel px-4 py-2.5 text-sm font-medium text-soft lg:hidden" onclick={() => (browseOpen = !browseOpen)}>
  <span class="flex min-w-0 items-center gap-2"><List class="h-4 w-4 shrink-0 text-muted" /> <span class="truncate">{selected ? selected.title : 'Browse charts'}</span></span>
  <ChevronDown class="h-4 w-4 shrink-0 transition {browseOpen ? 'rotate-180' : ''}" />
</button>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)]">
  <!-- Catalog -->
  <aside class="card p-0 min-w-0 {browseOpen ? '' : 'hidden'} lg:block">
    <div class="border-b border-edge p-3">
      <div class="flex items-center gap-2 rounded-lg border border-edge bg-panel-2 px-2">
        <Search class="h-4 w-4 text-muted" />
        <input class="w-full bg-transparent py-2 text-sm text-strong outline-none placeholder:text-muted" placeholder="Search by name or purpose…" bind:value={search} />
      </div>
    </div>
    <div class="max-h-[60vh] overflow-y-auto p-2 lg:max-h-[72vh]">
      {#if recommended.length && !search}
        <p class="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-mint">Recommended today</p>
        {#each recommended as def}
          <button class="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-panel-2 {selected?.key === def.key ? 'bg-panel-2' : ''}" onclick={() => select(def)}>
            <Sparkles class="h-3.5 w-3.5 shrink-0 text-mint" /><span class="truncate {selected?.key === def.key ? 'text-mint' : 'text-soft'}">{def.title}</span>
          </button>
        {/each}
        <div class="my-2 border-t border-edge/60"></div>
      {/if}
      {#each grouped as [cat, items]}
        <p class="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{cat}</p>
        {#each items as def}
          <button class="w-full rounded-lg px-3 py-2 text-left transition hover:bg-panel-2 {selected?.key === def.key ? 'bg-panel-2' : ''}" onclick={() => select(def)}>
            <span class="block text-sm {selected?.key === def.key ? 'text-mint' : 'text-soft'}">{def.title}</span>
            <span class="block text-[11px] leading-snug text-muted">{def.description}</span>
          </button>
        {:else}
          <p class="px-3 py-4 text-center text-xs text-muted">No charts match.</p>
        {/each}
      {/each}
    </div>
  </aside>

  <!-- Main -->
  <section class="min-w-0 space-y-4">
    {#if error}
      <div class="card border-danger/30 bg-danger/5 text-danger">{error} <span class="text-muted">— try refreshing or check the data sync.</span></div>
    {:else if loadingChart || !chart}
      <div class="card space-y-3"><div class="h-6 w-1/3 animate-pulse rounded bg-panel-2"></div><div class="h-20 animate-pulse rounded bg-panel-2"></div><div class="h-64 animate-pulse rounded bg-panel-2"></div></div>
    {:else}
      <!-- Chart header -->
      <div class="card">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-strong">{selected?.title}</h2>
            <p class="text-sm text-muted">{selected?.description}</p>
          </div>
          {#if overlay}
            <div class="flex shrink-0 flex-wrap gap-1.5">
              <span class="pill {toneClass[overlay.tone]}">{overlay.regime}</span>
              <span class="pill {confClass(overlay.conf)}" title={overlay.confReason}>{overlay.conf} confidence</span>
            </div>
          {/if}
        </div>

        <!-- Takeaway -->
        {#if hasIntel && takeaway}
          <div class="ai-glow mt-3 rounded-lg border border-mint/30 bg-mint/5 px-3 py-2">
            <AiLabel />
            <p class="mt-1 text-sm leading-relaxed text-soft">{takeaway}</p>
          </div>
        {/if}
      </div>

      <!-- Ranking cards (overlay only) -->
      {#if overlay}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="card p-3"><p class="text-[11px] uppercase tracking-wide text-muted">Current year</p><p class="text-lg font-bold text-strong">{overlay.curYear}</p><p class="text-xs {yearStatus(overlay.curROI)}">{fmtPct(overlay.curROI)} to date</p></div>
          <div class="card p-3"><p class="text-[11px] uppercase tracking-wide text-muted">Rank</p><p class="text-lg font-bold text-strong">{overlay.rank} / {overlay.vals.length}</p><p class="text-xs text-muted">vs selected years</p></div>
          <div class="card p-3"><p class="text-[11px] uppercase tracking-wide text-muted">Strongest</p><p class="text-lg font-bold text-mint">{overlay.best?.year ?? '—'}</p><p class="text-xs text-muted">{overlay.best ? fmtPct(overlay.best.v) : ''}</p></div>
          <div class="card p-3"><p class="text-[11px] uppercase tracking-wide text-muted">Weakest</p><p class="text-lg font-bold text-danger">{overlay.worst?.year ?? '—'}</p><p class="text-xs text-muted">{overlay.worst ? fmtPct(overlay.worst.v) : ''}</p></div>
        </div>
      {/if}

      <!-- Chart card -->
      <div class="card">
        {#if chart.render === 'dca'}
          <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label class="stat-label" for="amt">Amount per buy (USD)</label><input id="amt" class="input mt-1" type="number" min="1" bind:value={dcaAmount} oninput={reloadDca} /></div>
            <div><label class="stat-label" for="from">From</label><input id="from" class="input mt-1" type="date" min={chart.min_date} max={chart.max_date} bind:value={dcaFrom} onchange={reloadDca} /></div>
            <div><label class="stat-label" for="to">To</label><input id="to" class="input mt-1" type="date" min={chart.min_date} max={chart.max_date} bind:value={dcaTo} onchange={reloadDca} /></div>
          </div>
          {#if bestRow}<p class="mb-3 text-sm text-soft">Best weekday over this range: <span class="font-semibold text-mint">{bestRow.label}</span> ({fmtPct(bestRow.roi)} ROI, avg cost {fmtUsd(bestRow.avg_cost)}) {dcaBusy ? '· recomputing…' : ''}</p>{/if}
          <BarChart bars={chart.bars} unit="%" />
          <div class="mt-4 overflow-x-auto">
            <table class="w-full min-w-[640px] text-sm">
              <thead><tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted"><th class="px-3 py-2">Day</th><th class="px-3 py-2">Buys</th><th class="px-3 py-2">Invested</th><th class="px-3 py-2">BTC</th><th class="px-3 py-2">Avg Cost</th><th class="px-3 py-2">Value</th><th class="px-3 py-2">ROI</th></tr></thead>
              <tbody>
                {#each chart.table as r}
                  <tr class="border-b border-edge/60 last:border-0"><td class="px-3 py-2 font-medium text-strong">{r.label}</td><td class="px-3 py-2 text-soft">{r.buys}</td><td class="px-3 py-2 text-soft">{fmtUsd(r.invested, { compact: true })}</td><td class="px-3 py-2 text-soft">{r.btc.toFixed(4)}</td><td class="px-3 py-2 text-soft">{fmtUsd(r.avg_cost)}</td><td class="px-3 py-2 text-soft">{fmtUsd(r.value, { compact: true })}</td><td class="px-3 py-2 {r.roi >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(r.roi)}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if chart.render === 'multiline'}
          <!-- Presets + lines -->
          <div class="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <button class="rounded-md border border-edge px-2 py-1 font-medium text-muted hover:text-soft" onclick={() => applyPreset(allYears)}>All</button>
            <button class="rounded-md border border-edge px-2 py-1 font-medium text-muted hover:text-soft" onclick={() => (visibleYears = new Set())}>Clear</button>
            {#each PRESETS as [label, yrs]}
              <button class="rounded-md border border-edge px-2 py-1 font-medium text-muted hover:text-soft" onclick={() => applyPreset(yrs)}>{label}</button>
            {/each}
            <span class="mx-1 h-4 w-px bg-edge"></span>
            <button class="flex items-center gap-1 rounded-md border px-2 py-1 font-medium transition {showMedian ? 'border-edge bg-panel-2 text-strong' : 'border-edge/60 text-muted'}" onclick={() => (showMedian = !showMedian)}><span class="inline-block w-3" style="border-top:2px dashed #F59E0B"></span>Median</button>
            <button class="flex items-center gap-1 rounded-md border px-2 py-1 font-medium transition {showAverage ? 'border-edge bg-panel-2 text-strong' : 'border-edge/60 text-muted'}" onclick={() => (showAverage = !showAverage)}><span class="inline-block w-3" style="border-top:2px dotted #3B82F6"></span>Average</button>
          </div>
          <!-- Year chips (return to date + hover focus + current-year highlight) -->
          <div class="mb-3 flex flex-wrap gap-1.5">
            {#each chart.series as s}
              {@const v = yStrict(s.points, overlay?.curDay ?? 366)}
              {@const on = visibleYears.has(s.year)}
              <button
                class="pill border text-xs transition {s.year === overlay?.curYear ? 'ring-1 ring-mint/60' : ''}"
                style={on ? `background:${colorByYear[s.year]}22;color:${colorByYear[s.year]};border-color:${colorByYear[s.year]}` : 'border-color:#222b39;color:#8b97a8'}
                onclick={() => toggleYear(s.year)}
                onmouseenter={() => (focusYear = s.year)}
                onmouseleave={() => (focusYear = null)}
                title={`${s.year}${s.year === overlay?.curYear ? ' · current year' : ''}`}
              >
                {s.year}{#if on && v != null}<span class="ml-1 opacity-80">{v >= 0 ? '+' : ''}{v.toFixed(0)}%</span>{/if}
              </button>
            {/each}
          </div>
          <MultiLineChart series={visibleSeries} unit="%" />
          <p class="mt-2 text-xs text-muted">Each line = one year’s cumulative ROI from Jan 1. <span class="text-warn">Amber dashed = median</span> across selected years (less affected by outlier years). The current year is drawn bold; hover a year to focus it.</p>
        {:else if chart.render === 'bar'}
          <BarChart bars={chart.bars} unit={chart.unit ?? ''} />
          {#if chart.note}<p class="mt-2 text-xs text-muted">{chart.note}</p>{/if}
        {:else if chart.render === 'line'}
          <p class="mb-2 text-sm text-muted">Cumulative ROI since {chart.from} · <span class="font-semibold {chart.roi.at(-1) >= 0 ? 'text-mint' : 'text-danger'}">{fmtPct(chart.roi.at(-1))}</span></p>
          <Sparkline points={chart.roi} height={200} />
        {:else if chart.render === 'heatmap'}
          <div class="overflow-x-auto">
            <table class="w-full min-w-[640px] text-center text-xs">
              <thead><tr class="text-muted"><th class="px-2 py-1 text-left">Year</th>{#each MONTHS as m}<th class="px-1 py-1">{m}</th>{/each}</tr></thead>
              <tbody>
                {#each [...chart.rows].reverse() as row}
                  <tr><td class="px-2 py-1 text-left font-medium text-soft">{row.year}</td>{#each row.months as v}<td class="px-1 py-1"><div class="rounded px-1 py-1.5 text-[11px] text-strong" style="background: {heatColor(v)}">{v == null ? '' : v.toFixed(0)}</div></td>{/each}</tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if chart.render === 'index'}
          <AltcoinSeason />
        {/if}
      </div>

      {#if hasIntel}
        <!-- Snapshot + copy -->
        <div class="card">
          <div class="flex items-center justify-between gap-2">
            <p class="stat-label">Snapshot</p>
            <button class="btn-ghost px-2 py-1 text-xs" onclick={copySummary}>{#if copied}<Check class="h-3.5 w-3.5 text-mint" /> Copied{:else}<Copy class="h-3.5 w-3.5" /> Copy summary{/if}</button>
          </div>
          <pre class="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-soft">{snapshot}</pre>
        </div>

        <!-- How to read / what it means / what to watch -->
        {#if guide}
          <div class="grid gap-3 md:grid-cols-2">
            <div class="card">
              <p class="flex items-center gap-1.5 stat-label"><BookOpen class="h-3.5 w-3.5 text-accent" /> How to read this chart</p>
              <p class="mt-1 text-sm leading-relaxed text-soft">{guide.read}</p>
            </div>
            <div class="card">
              <p class="flex items-center gap-1.5 stat-label"><Info class="h-3.5 w-3.5 text-accent" /> What this means</p>
              <p class="mt-1 text-sm leading-relaxed text-soft">{guide.means}</p>
            </div>
          </div>
          <div class="card">
            <p class="flex items-center gap-1.5 stat-label text-warn"><Eye class="h-3.5 w-3.5" /> What to watch next</p>
            <ul class="mt-1.5 grid gap-1 text-sm text-muted sm:grid-cols-2">
              {#each guide.watch as w}<li class="flex items-start gap-1.5"><span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warn"></span>{w}</li>{/each}
            </ul>
          </div>
        {/if}

        <div class="flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
          <AlertTriangle class="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>These charts are historical analysis tools, not price predictions. Past performance does not guarantee future results. Use them together with risk, on-chain, social and relative-strength indicators.</span>
        </div>
      {/if}
    {/if}
  </section>
</div>
