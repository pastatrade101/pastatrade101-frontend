<script lang="ts">
  import { untrack } from 'svelte';
  import { Maximize2, Info, Copy, Check } from '@lucide/svelte';
  import { api } from '$lib/api';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import EChart from '$lib/components/EChart.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import { fmtUsd } from '$lib/format';

  let { asset = 'BTC' }: { asset?: 'BTC' | 'ETH' } = $props();

  type Tab = 'total' | 'btc' | 'eth';
  let tab = $state<Tab>(untrack(() => asset).toLowerCase() as Tab);
  let range = $state('all');
  let scale = $state<'log' | 'linear'>('log');
  let viewMode = $state<'simple' | 'analyst'>('simple');
  let show = $state({ price: true, fit: true, lower: true, upper: true, bubbleLower: true, bubbleUpper: true });

  interface Point {
    date: string;
    price_usd: number;
    fit_price: number;
    lower_band: number;
    upper_band: number;
    bubble_lower_band: number;
    bubble_upper_band: number;
    distance_from_fit_percent: number;
    risk_score: number;
    zone_label: string;
  }
  interface Resp { asset: string; source: string; start_date: string | null; fit_valid: boolean; fit_note: string; history_years: number; range: string; is_paid: boolean; points: Point[]; latest: Point | null; takeaway: string }
  const isAdmin = $derived(!!$membership?.is_admin);

  let result = $state<Resp | null>(null);
  let loading = $state(false);
  let error = $state('');
  let chartWrap = $state<HTMLDivElement | null>(null);
  let copied = $state(false);

  const canView = $derived(hasFeature($membership, 'access_log_regression_charts'));
  const isPaid = $derived(!!$membership && ($membership.is_admin || $membership.plan === 'mid' || $membership.plan === 'premium'));
  const ASSET = $derived(tab.toUpperCase());

  const RANGES = ['all', '10y', '5y', '3y', '1y'];
  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const usd = (n: number | null | undefined) => (n == null ? '—' : fmtUsd(n, { compact: true }));

  // One colour per line, reused by the chart series, tooltip markers and chips.
  const C = { price: '#22D3EE', fit: '#34D399', lower: '#2DD4BF', upper: '#A3E635', bubbleLower: '#FB923C', bubbleUpper: '#EF4444' };

  const zoneTone = (z: string | null | undefined) => {
    if (!z) return 'bg-edge text-muted';
    if (z === 'Deep value' || z === 'Low-risk zone') return 'bg-mint/15 text-mint';
    if (z === 'Fair value') return 'bg-accent/15 text-accent';
    if (z === 'Moderate risk') return 'bg-warn/15 text-warn';
    return 'bg-danger/15 text-danger';
  };
  const riskTone = (s: number | null | undefined) => (s == null ? 'bg-edge text-muted' : s < 0.4 ? 'bg-mint/15 text-mint' : s < 0.65 ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger');

  // ── Plain-language helpers ──
  const ZONE_MEANING: Record<string, string> = {
    'Deep value': 'Price is below the lower value band. Historically lower-risk, but not guaranteed to reverse immediately.',
    'Low-risk zone': 'Price is below fair value but above the lower band.',
    'Fair value': 'Price is near the regression fit line.',
    'Moderate risk': 'Price is above fair value but below the upper band.',
    'Elevated risk': 'Price is above the upper band but not yet inside the bubble bands.',
    'Bubble risk': 'Price is inside the bubble band range.',
    'Extreme overheating': 'Price is above the bubble upper band.'
  };
  const whereWord = (d: number) => (d < -2 ? 'below' : d > 2 ? 'above' : 'near');
  const isValueZone = (z: string) => z === 'Deep value' || z === 'Low-risk zone';
  const isHighZone = (z: string) => z === 'Elevated risk' || z === 'Bubble risk' || z === 'Extreme overheating';

  const whyZone = (a: string, l: Point): string => {
    switch (l.zone_label) {
      case 'Deep value':
        return `${a} is labeled Deep Value because its current price (${usd(l.price_usd)}) is below the lower value band (${usd(l.lower_band)}).`;
      case 'Low-risk zone':
        return `${a} is labeled Low-risk because price is below the fair-value line (${usd(l.fit_price)}) but above the lower band (${usd(l.lower_band)}).`;
      case 'Fair value':
        return `${a} is labeled Fair Value because price is close to the regression fair-value line (${usd(l.fit_price)}).`;
      case 'Moderate risk':
        return `${a} is labeled Moderate Risk because price is above fair value (${usd(l.fit_price)}) but below the upper band (${usd(l.upper_band)}).`;
      case 'Elevated risk':
        return `${a} is labeled Elevated Risk because price is above the normal upper band (${usd(l.upper_band)}).`;
      case 'Bubble risk':
        return `${a} is labeled Bubble Risk because price is inside the model's overheated band range (${usd(l.bubble_lower_band)}–${usd(l.bubble_upper_band)}).`;
      default:
        return `${a} is labeled Extreme Overheating because price is above the bubble upper band (${usd(l.bubble_upper_band)}).`;
    }
  };

  const currentReading = $derived.by(() => {
    const l = result?.latest;
    if (!l) return null;
    const a = ASSET;
    const z = l.zone_label;
    const important = isValueZone(z)
      ? `This does not mean ${a} must pump now. It only means ${a} is not overheated compared with its long-term historical growth curve.`
      : isHighZone(z)
        ? `This is a long-term risk model, not a short-term timing signal — it does not call an exact top.`
        : `This is a long-term value/risk model, not a short-term timing signal.`;
    return {
      headline: `${a} is trading ${whereWord(l.distance_from_fit_percent)} its long-term regression fair-value line.`,
      meaning: `${a} is currently in a ${z} zone based on this model.`,
      why: whyZone(a, l),
      important
    };
  });

  const soWhat = $derived.by(() => {
    const l = result?.latest;
    if (!l) return '';
    const a = ASSET;
    const z = l.zone_label;
    if (z === 'Deep value' || z === 'Low-risk zone')
      return `${a} is below its ${z === 'Deep value' ? 'lower value band' : 'fair-value line'}, so this model sees ${a} as historically ${z === 'Deep value' ? 'cheap' : 'reasonably valued'} relative to its long-term growth curve. That can support accumulation-style thinking, but it does not guarantee immediate upside — price can stay undervalued for a long time.`;
    if (z === 'Fair value') return `${a} is near its fair-value line, so the model sees it as roughly neutral on a long-term basis — neither cheap nor overheated.`;
    if (z === 'Moderate risk') return `${a} is above its fair-value line, so the model sees long-term risk starting to rise. This is not a top, but aggressive buying becomes a little less attractive here.`;
    if (z === 'Elevated risk') return `${a} is above its upper band, so the model sees risk as elevated. This does not confirm a top, but aggressive buying becomes less attractive and risk management matters more.`;
    return `${a} is inside the model's overheated (bubble) zone. Historically this type of zone has carried higher downside risk. This does not call an exact top, but caution and risk management become more important.`;
  });

  const shareText = $derived.by(() => {
    const l = result?.latest;
    if (!l) return '';
    return `${ASSET} Regression Snapshot\nPrice: ${usd(l.price_usd)}\nFair Value: ${usd(l.fit_price)}\nDistance: ${l.distance_from_fit_percent}%\nZone: ${l.zone_label}\nRisk Score: ${l.risk_score.toFixed(2)}/1\n\n${result?.takeaway ?? ''}`;
  });
  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const COMBINE = [
    { href: '/app/risk', label: 'BTC Risk Dashboard' },
    { href: '/app/exit-strategy', label: 'Dynamic Exit Strategy' },
    { href: '/app/altcoin-btc-lab', label: 'Altcoin vs BTC Lab' },
    { href: '/app/social-metrics', label: 'Social Risk' },
    { href: '/app/reports', label: 'Reports' }
  ];

  const load = async () => {
    if (tab === 'total') return;
    if (tab === 'eth' && !isPaid) {
      result = null;
      return;
    }
    loading = true;
    error = '';
    try {
      result = await api<Resp>(`/charts/log-regression/${tab}?range=${range}`, { auth: true });
      if (result && !result.is_paid && range !== '1y') range = result.range as string;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load regression bands.';
      result = null;
    } finally {
      loading = false;
    }
  };

  $effect(() => {
    const _ = [tab, range, canView, isPaid];
    void _;
    if (!$membershipReady || !canView) return;
    void load();
  });

  const setTab = (t: Tab) => (tab = t);
  const goFullscreen = () => chartWrap?.requestFullscreen?.();

  const pointByDate = $derived.by(() => {
    const m = new Map<number, Point>();
    for (const p of result?.points ?? []) m.set(ts(p.date), p);
    return m;
  });

  const chartOption = $derived.by(() => {
    const pts = result?.points ?? [];
    if (!pts.length) return {};
    const priceMin = Math.min(...pts.map((p) => p.price_usd).filter((v) => v > 0));
    const line = (field: keyof Point, color: string, width: number, z: number, dashed = false, endLabel = '') => ({
      name: field,
      type: 'line' as const,
      showSymbol: false,
      smooth: false,
      z,
      lineStyle: { width, color, type: dashed ? ('dashed' as const) : ('solid' as const) },
      itemStyle: { color },
      endLabel: endLabel ? { show: true, formatter: endLabel, color, fontSize: 9, distance: 4 } : { show: false },
      data: pts.map((p) => [ts(p.date), p[field] as number])
    });
    const series: unknown[] = [];
    const valid = result?.fit_valid !== false;
    if (valid && show.bubbleUpper) series.push(line('bubble_upper_band', C.bubbleUpper, 1.6, 2, false, 'Bubble upper'));
    if (valid && show.bubbleLower) series.push(line('bubble_lower_band', C.bubbleLower, 1.3, 2, true, 'Bubble lower'));
    if (valid && show.upper) series.push(line('upper_band', C.upper, 1.3, 2, false, 'Upper'));
    if (valid && show.lower) series.push(line('lower_band', C.lower, 1.3, 2, true, 'Lower'));
    if (valid && show.fit) series.push(line('fit_price', C.fit, 1.9, 3, true, 'Fair value'));
    if (show.price) {
      const priceLine = line('price_usd', C.price, 2.2, 5);
      const last = pts[pts.length - 1];
      // @ts-expect-error markPoint is valid on a line series
      priceLine.markPoint = {
        symbol: 'circle',
        symbolSize: 9,
        data: [{ coord: [ts(last.date), last.price_usd], itemStyle: { color: '#22D3EE' } }],
        label: { show: true, position: 'top', color: '#22D3EE', fontSize: 10, formatter: `Now ${usd(last.price_usd)}` }
      };
      series.push(priceLine);
    }
    return {
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        formatter: (params: { axisValue: number }[]) => {
          const p = pointByDate.get(params?.[0]?.axisValue);
          if (!p) return '';
          const d = new Date(ts(p.date)).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
          const dot = (c: string) => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;vertical-align:middle"></span>`;
          const row = (c: string, label: string, val: string) => `${dot(c)}${label}: <b>${val}</b>`;
          const rows = [`<b>${d}</b>`];
          if (show.price) rows.push(row(C.price, `${result?.asset} price`, usd(p.price_usd)));
          if (result?.fit_valid !== false) {
            if (viewMode === 'analyst' && show.bubbleUpper) rows.push(row(C.bubbleUpper, 'Bubble upper', usd(p.bubble_upper_band)));
            if (viewMode === 'analyst' && show.bubbleLower) rows.push(row(C.bubbleLower, 'Bubble lower', usd(p.bubble_lower_band)));
            if (viewMode === 'analyst' && show.upper) rows.push(row(C.upper, 'Upper band', usd(p.upper_band)));
            if (show.fit) rows.push(row(C.fit, 'Regression fit', usd(p.fit_price)));
            if (show.lower) rows.push(row(C.lower, 'Lower band', usd(p.lower_band)));
            rows.push(`Distance from fit: <b>${p.distance_from_fit_percent}%</b>`);
            if (viewMode === 'analyst') rows.push(`Risk score: <b>${p.risk_score.toFixed(2)}</b>`);
            rows.push(`Zone: <b>${p.zone_label}</b>`);
          }
          return rows.join('<br/>');
        }
      },
      grid: { left: 8, right: viewMode === 'analyst' ? 64 : 48, top: 12, bottom: 8, containLabel: true },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' } },
      yAxis: {
        type: scale === 'log' ? 'log' : 'value',
        // On log scale, anchor the floor near the price range so the (meaningless)
        // sub-cent early-history fit doesn't squash everything into the top decade.
        ...(scale === 'log' ? { min: Math.max(0.01, priceMin * 0.5) } : {}),
        axisLabel: { color: '#9CA3AF', formatter: (v: number) => usd(v) },
        splitLine: { lineStyle: { color: '#1F2937' } }
      },
      series
    };
  });

  const BANDS: { key: keyof typeof show; label: string; color: string; dashed: boolean; tip: string }[] = [
    { key: 'price', label: 'Price', color: C.price, dashed: false, tip: 'Actual market price.' },
    { key: 'fit', label: 'Fit', color: C.fit, dashed: true, tip: "The model's estimated long-term growth curve (fair value)." },
    { key: 'lower', label: 'Lower', color: C.lower, dashed: true, tip: 'A historically lower-risk area below fair value.' },
    { key: 'upper', label: 'Upper', color: C.upper, dashed: false, tip: 'A higher-risk area above fair value.' },
    { key: 'bubbleLower', label: 'Bubble lower', color: C.bubbleLower, dashed: true, tip: 'The beginning of the historically overheated zone.' },
    { key: 'bubbleUpper', label: 'Bubble upper', color: C.bubbleUpper, dashed: false, tip: 'Extreme overheating zone in this model.' }
  ];
</script>

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Logarithmic Regression Bands</h1>
  <p class="text-sm text-muted">Understand whether BTC and ETH are trading near long-term value, fair value, elevated risk, or overheated zones — a historical model, not a price prediction.</p>
</header>

<!-- Asset tabs + view mode -->
<div class="mb-4 flex flex-wrap items-center justify-between gap-3">
  <div class="inline-flex overflow-hidden rounded-lg border border-edge text-sm">
    {#each [['total', 'Total'], ['btc', 'BTC'], ['eth', 'ETH']] as [k, lab]}
      <button class="px-4 py-1.5 font-medium transition-colors {tab === k ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-panel-2/60'}" onclick={() => setTab(k as Tab)}>{lab}</button>
    {/each}
  </div>
  <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs" title="Simple hides the technical numbers; Analyst shows risk score, distance and full tooltip.">
    {#each [['simple', 'Simple'], ['analyst', 'Analyst']] as [k, lab]}
      <button class="px-3 py-1.5 font-medium {viewMode === k ? 'bg-panel-2 text-strong' : 'text-muted'}" onclick={() => (viewMode = k as typeof viewMode)}>{lab}</button>
    {/each}
  </div>
</div>

{#if !$membershipReady}
  <p class="text-sm text-muted">Loading…</p>
{:else if !canView}
  <LockedFeature title="Logarithmic Regression Bands" plan="Free" bullets={['Long-term regression fair-value line for BTC and ETH', 'Value, fair, elevated and bubble-risk bands', 'Regression risk score and zone labels']} />
{:else if tab === 'total'}
  <div class="card text-center text-sm text-muted">
    <p class="font-medium text-soft">Total market-cap regression — coming soon</p>
    <p class="mt-1">Total crypto market-cap logarithmic regression bands will appear here. For now, use the BTC and ETH tabs.</p>
  </div>
{:else if tab === 'eth' && !isPaid}
  <LockedFeature
    title="ETH regression bands are a Mid / Premium feature"
    plan="Mid"
    bullets={['Full ETH logarithmic regression with all bands', 'Regression risk score, zones and fair value', 'BTC remains available on the free preview']}
  />
{:else}
  <!-- Insufficient / invalid fit notice -->
  {#if result && !result.fit_valid && result.points.length}
    <div class="card mb-4 border-warn/30 bg-warn/5">
      <p class="stat-label text-warn">Long-term regression not available yet</p>
      <p class="mt-1 text-sm text-soft">{result.fit_note}</p>
      <p class="mt-1 text-[12px] text-muted">Only the price line is shown — the value and bubble bands are hidden to avoid a misleading read. {result.history_years}y of history is loaded ({result.source === 'csv' ? 'imported' : 'platform series'}).</p>
      {#if isAdmin}<a href="/admin/data-import/log-regression" class="btn-primary mt-3 inline-flex text-sm">Import full {result.asset} history</a>{/if}
    </div>
  {/if}

  <!-- Summary cards -->
  {#if result?.latest && result.fit_valid}
    {@const l = result.latest}
    <div class="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 {viewMode === 'analyst' ? 'lg:grid-cols-6' : 'lg:grid-cols-4'}">
      <div class="card p-3" title="The current live market price."><p class="text-[11px] uppercase tracking-wide text-muted">Current price</p><p class="text-lg font-bold text-strong">{usd(l.price_usd)}</p></div>
      <div class="card p-3" title="The model's estimated long-term growth curve (where price would sit on the long-term trend)."><p class="text-[11px] uppercase tracking-wide text-muted">Fair value (fit)</p><p class="text-lg font-bold text-strong">{usd(l.fit_price)}</p></div>
      <div class="card p-3" title="How far current price is above (+) or below (−) the fair-value line."><p class="text-[11px] uppercase tracking-wide text-muted">Distance from fit</p><p class="text-lg font-bold {l.distance_from_fit_percent < 0 ? 'text-mint' : 'text-warn'}">{l.distance_from_fit_percent}%</p></div>
      <div class="card p-3" title="Plain-language label for where price sits relative to the bands."><p class="text-[11px] uppercase tracking-wide text-muted">Current zone</p><p class="mt-0.5"><span class="rounded px-2 py-0.5 text-xs font-medium {zoneTone(l.zone_label)}">{l.zone_label}</span></p></div>
      {#if viewMode === 'analyst'}
        <div class="card p-3" title="0–1 estimate of where price sits inside the bands. Lower = closer to value; higher = closer to overheated."><p class="text-[11px] uppercase tracking-wide text-muted">Risk score</p><p class="mt-0.5"><span class="rounded px-2 py-0.5 text-sm font-semibold {riskTone(l.risk_score)}">{l.risk_score.toFixed(2)} / 1</span></p></div>
        <div class="card p-3" title="A historically lower-risk area below fair value."><p class="text-[11px] uppercase tracking-wide text-muted">Lower value band</p><p class="text-lg font-bold text-strong">{usd(l.lower_band)}</p></div>
      {/if}
    </div>

    <!-- Current reading (the headline answer) -->
    {#if currentReading}
      <div class="card mb-4 border-l-4 {isValueZone(l.zone_label) ? 'border-l-mint' : isHighZone(l.zone_label) ? 'border-l-danger' : 'border-l-warn'}">
        <p class="stat-label">Current reading</p>
        <p class="mt-1 text-lg font-semibold text-strong">{currentReading.headline}</p>
        <div class="mt-2 space-y-1.5 text-sm">
          <p class="text-soft"><span class="font-medium text-muted">Meaning:</span> {currentReading.meaning}</p>
          <p class="text-soft"><span class="font-medium text-muted">Why this zone:</span> {currentReading.why}</p>
          <p class="text-muted"><span class="font-medium">Important:</span> {currentReading.important}</p>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Controls -->
  <div class="mb-3 flex flex-wrap items-center gap-3">
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      <button class="px-2.5 py-1.5 font-medium {scale === 'log' ? 'bg-panel-2 text-strong' : 'text-muted'}" onclick={() => (scale = 'log')}>Log</button>
      <button class="px-2.5 py-1.5 font-medium {scale === 'linear' ? 'bg-panel-2 text-strong' : 'text-muted'}" onclick={() => (scale = 'linear')}>Linear</button>
    </div>
    <div class="inline-flex overflow-hidden rounded-lg border border-edge text-xs">
      {#each RANGES as r}
        <button class="px-2.5 py-1.5 font-medium capitalize {range === r ? 'bg-panel-2 text-strong' : 'text-muted'} {!isPaid && r !== '1y' ? 'cursor-not-allowed opacity-40' : ''}" disabled={!isPaid && r !== '1y'} onclick={() => (range = r)}>{r}</button>
      {/each}
    </div>
    <div class="flex flex-wrap gap-1.5">
      {#each BANDS as bnd}
        <button class="flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition {show[bnd.key] ? 'border-edge bg-panel-2 text-strong' : 'border-edge/60 text-muted'}" title={bnd.tip} onclick={() => (show[bnd.key] = !show[bnd.key])}>
          <span class="inline-block w-4" style="border-top:2.5px {bnd.dashed ? 'dashed' : 'solid'} {bnd.color};opacity:{show[bnd.key] ? 1 : 0.3}"></span>{bnd.label}
        </button>
      {/each}
    </div>
    {#if isPaid}
      <button class="btn-ghost ml-auto px-2 py-1 text-xs" onclick={goFullscreen} title="Fullscreen"><Maximize2 class="h-4 w-4" /></button>
    {/if}
  </div>

  <!-- Chart -->
  <div class="card" bind:this={chartWrap}>
    {#if loading}
      <div class="flex h-[360px] items-center justify-center text-sm text-muted">Computing regression…</div>
    {:else if error}
      <div class="flex h-[360px] items-center justify-center text-sm text-danger">{error}</div>
    {:else if result?.points?.length}
      <EChart option={chartOption} height={400} />
      <p class="mt-2 text-[11px] text-muted">
        Cyan = {result.asset} price · teal (dashed) = lower value · green (dashed) = fair value · lime = upper value · orange (dashed) = bubble lower · red = bubble upper.
        {#if !isPaid}<span class="text-warn"> Free preview is limited to the last year — upgrade for full history.</span>{/if}
      </p>
    {:else}
      <div class="flex h-[360px] items-center justify-center px-4 text-center text-sm text-muted">No price history available yet. An admin can import a CSV in the admin panel.</div>
    {/if}
  </div>

  {#if result?.latest && result.fit_valid}
    {@const l = result.latest}
    <!-- How to read + So what -->
    <div class="mt-3 grid gap-3 md:grid-cols-2">
      <div class="card">
        <p class="stat-label">How to read this chart</p>
        <ul class="mt-1.5 space-y-1 text-sm text-muted">
          <li>• <span class="text-soft">Price line</span> — the actual {ASSET} market price.</li>
          <li>• <span class="text-soft">Fair value line</span> — the estimated long-term growth curve.</li>
          <li>• <span class="text-soft">Lower band</span> — value / low-risk area below fair value.</li>
          <li>• <span class="text-soft">Upper band</span> — elevated-risk area above fair value.</li>
          <li>• <span class="text-soft">Bubble bands</span> — historically overheated area.</li>
          <li>• Below the lower band → <span class="text-mint">Deep Value</span>; approaching bubble bands → risk is higher.</li>
        </ul>
      </div>
      <div class="card">
        <p class="stat-label">So what does this mean?</p>
        <p class="mt-1 text-sm leading-relaxed text-soft">{soWhat}</p>
      </div>
    </div>

    <!-- Not a timing signal + combine with -->
    <div class="mt-3 grid gap-3 md:grid-cols-2">
      <div class="card border-warn/30 bg-warn/5">
        <p class="stat-label text-warn">This is not a timing signal</p>
        <p class="mt-1 text-sm text-soft">Logarithmic regression bands show long-term value/risk zones. They do not predict exact tops, bottoms, or when price will move.</p>
      </div>
      <div class="card">
        <p class="stat-label">Combine with these modules</p>
        <p class="mt-1 text-[12px] text-muted">Regression tells you where price sits vs long-term value; these tell you whether market risk, crowd behavior and relative strength confirm it.</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          {#each COMBINE as c}<a href={c.href} class="rounded-md border border-edge px-2 py-1 text-[11px] text-soft transition hover:bg-panel-2">{c.label}</a>{/each}
        </div>
      </div>
    </div>

    <!-- Premium takeaway -->
    {#if result.takeaway}
      <div class="card mt-3">
        <p class="stat-label">Premium takeaway</p>
        <p class="mt-1 text-sm leading-relaxed text-soft">{result.takeaway}</p>
      </div>
    {/if}

    <!-- Share snapshot -->
    <div class="card mt-3">
      <div class="flex items-center justify-between gap-2">
        <p class="stat-label">{ASSET} regression snapshot</p>
        <button class="btn-ghost px-2 py-1 text-xs" onclick={copySummary}>{#if copied}<Check class="h-3.5 w-3.5 text-mint" /> Copied{:else}<Copy class="h-3.5 w-3.5" /> Copy summary{/if}</button>
      </div>
      <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-5">
        <div><span class="text-muted">Price</span> <span class="font-medium text-strong">{usd(l.price_usd)}</span></div>
        <div><span class="text-muted">Fair value</span> <span class="font-medium text-strong">{usd(l.fit_price)}</span></div>
        <div><span class="text-muted">Distance</span> <span class="font-medium text-strong">{l.distance_from_fit_percent}%</span></div>
        <div><span class="text-muted">Zone</span> <span class="font-medium text-strong">{l.zone_label}</span></div>
        <div><span class="text-muted">Risk</span> <span class="font-medium text-strong">{l.risk_score.toFixed(2)}/1</span></div>
      </div>
    </div>

    <!-- Model confidence note -->
    <div class="card mt-3">
      <p class="stat-label">Model confidence</p>
      {#if tab === 'btc'}
        <p class="mt-1 text-sm text-muted">BTC has the longest crypto price history, so logarithmic regression is more stable than for newer assets.</p>
      {:else}
        <p class="mt-1 text-sm text-muted">ETH has a shorter history and higher volatility than BTC. Treat ETH regression as a guide, and confirm with ETH/BTC strength and broader market conditions.</p>
      {/if}
      <p class="mt-1 text-[12px] text-muted/80">History loaded: {result.history_years}y ({result.source === 'csv' ? 'imported' : 'platform series'}).</p>
    </div>

    <!-- Beginner explanation -->
    <details class="card mt-3">
      <summary class="cursor-pointer text-sm font-medium text-strong">What is logarithmic regression?</summary>
      <div class="mt-2 space-y-2 text-sm text-muted">
        <p>It's a way to model long-term growth that slows down over time. Bitcoin and Ethereum have grown in cycles, but their percentage growth tends to get smaller as the market matures. This model draws a long-term curve and bands around it to estimate value and risk zones.</p>
        <p>Think of the fair-value line like the middle of a long-term road. When price moves far below the road, it may be in a value area; far above it, risk may be elevated.</p>
      </div>
    </details>

    <!-- Limitations -->
    <details class="card mt-3">
      <summary class="cursor-pointer text-sm font-medium text-strong">Limitations</summary>
      <ul class="mt-2 space-y-1 text-sm text-muted">
        <li>• Based on historical price behavior — it can fail if market structure changes.</li>
        <li>• It does not predict exact tops or bottoms.</li>
        <li>• ETH has a shorter history than BTC, so its bands are less stable.</li>
        <li>• Regression bands should not be used alone.</li>
        <li>• Always combine with risk, on-chain, social and relative-strength data.</li>
      </ul>
    </details>

    <!-- Admin model settings (analyst only) -->
    {#if viewMode === 'analyst' && isAdmin}
      <div class="card mt-3 border-accent/30 bg-accent/5">
        <p class="stat-label text-accent">Admin · model</p>
        <p class="mt-1 text-[12px] text-muted">Fitting method and band multipliers are configured per asset.</p>
        <a href="/admin/charts/log-regression-settings" class="btn-ghost mt-2 inline-flex text-xs">Open regression settings</a>
      </div>
    {/if}
  {/if}

  <!-- Disclaimer -->
  <div class="mt-3 flex items-start gap-2 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs leading-relaxed text-muted">
    <Info class="mt-0.5 h-3.5 w-3.5 shrink-0" />
    <span>Not financial advice. Pastatrade Logarithmic Regression Bands are historical models and not price predictions. They do not predict exact tops or bottoms. Always use multiple indicators and do your own research. Inspired by long-term regression analysis; they do not reproduce any proprietary external model.</span>
  </div>
{/if}
