<script lang="ts">
  import { api } from '$lib/api';
  import EChart from '$lib/components/EChart.svelte';
  import Gauge from '$lib/components/Gauge.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';
  import { fmtPct, fmtUsd } from '$lib/format';

  interface RoiPoint {
    days_since_event: number;
    date: string;
    btc_price: number;
    roi_multiple: number;
    roi_percent: number;
  }
  interface CycleSeries {
    key: string;
    label: string;
    cycle: string;
    event_date: string;
    anchor_price: number;
    points: RoiPoint[];
  }
  interface RoiResponse {
    anchor: string;
    x_label: string;
    series: CycleSeries[];
  }
  interface RiskScore {
    btc_price: number;
    risk_score: number;
    risk_label: string;
    reason: string;
    distance_from_200ma: number | null;
    drawdown_from_ath: number;
    rsi: number | null;
    ytd_roi: number | null;
    dca_window: string;
  }

  type ChartType = 'cycle-low' | 'halving' | 'year-overlay';
  const ENDPOINT: Record<ChartType, string> = {
    'cycle-low': '/btc-cycle/roi-from-cycle-low',
    halving: '/btc-cycle/roi-from-halving',
    'year-overlay': '/btc-cycle/year-overlay'
  };
  const NON_CURRENT = ['#3B82F6', '#22C55E', '#EF4444', '#c084fc', '#22d3ee', '#f472b6', '#fb923c', '#34d399'];

  let chartType = $state<ChartType>('cycle-low');
  let scale = $state<'linear' | 'log'>('log');
  let mode = $state<'multiple' | 'percent'>('multiple');
  let data = $state<RoiResponse | null>(null);
  let hidden = $state<Set<string>>(new Set());
  let risk = $state<RiskScore | null>(null);
  let error = $state('');
  let loading = $state(true);

  const currentYear = String(new Date().getFullYear());
  const currentKey = $derived(
    chartType === 'cycle-low' ? 'current' : chartType === 'halving' ? '2024' : currentYear
  );
  const noun = $derived(chartType === 'year-overlay' ? 'year' : 'cycle');

  const colorMap = $derived.by(() => {
    const map: Record<string, string> = {};
    let i = 0;
    for (const s of data?.series ?? []) {
      map[s.key] = s.key === currentKey ? '#F59E0B' : NON_CURRENT[i++ % NON_CURRENT.length];
    }
    return map;
  });

  // Default visibility: hide the 2011 cycle (different liquidity era); for the
  // yearly view, show only the most recent ~6 years to keep it readable.
  const defaultHidden = (resp: RoiResponse): Set<string> => {
    if (chartType === 'cycle-low') return new Set(['2011']);
    if (chartType === 'year-overlay') {
      const keys = resp.series.map((s) => s.key);
      return new Set(keys.slice(0, Math.max(0, keys.length - 6)));
    }
    return new Set();
  };

  // BTC Cycle Lab is a Premium feature. Backend enforces too.
  const allowed = $derived($membershipReady ? hasFeature($membership, 'access_btc_cycle_lab') : null);

  const load = async () => {
    loading = true;
    error = '';
    try {
      const resp = await api<RoiResponse>(ENDPOINT[chartType], { auth: true });
      data = resp;
      hidden = defaultHidden(resp);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load cycle data.';
    } finally {
      loading = false;
    }
  };

  let started = false;
  $effect(() => {
    if (allowed && !started) {
      started = true;
      load().then(async () => {
        try {
          risk = await api<RiskScore>('/btc-cycle/risk-score', { auth: true });
        } catch {
          // risk card is optional; ignore failures
        }
      });
    }
  });

  const setType = (t: ChartType) => {
    if (t !== chartType) {
      chartType = t;
      load();
    }
  };

  const toggle = (key: string) => {
    const next = new Set(hidden);
    next.has(key) ? next.delete(key) : next.add(key);
    hidden = next;
  };

  const median = (xs: number[]): number => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  // ── ECharts option ──
  const option = $derived.by(() => {
    if (!data) return {};
    const useLog = scale === 'log';
    const valueKey: 'roi_multiple' | 'roi_percent' = useLog || mode === 'multiple' ? 'roi_multiple' : 'roi_percent';
    const isMultiple = valueKey === 'roi_multiple';
    const visible = data.series.filter((s) => !hidden.has(s.key));

    return {
      backgroundColor: 'transparent',
      grid: { left: 56, right: 18, top: 16, bottom: 44 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#0E1117',
        borderColor: '#1F2937',
        textStyle: { color: '#F9FAFB', fontSize: 11 },
        formatter: (params: any[]) => {
          const head = `Day ${params[0]?.axisValue}`;
          const lines = params
            .map((p) => `${p.marker} ${p.seriesName}: ${isMultiple ? p.value[1].toFixed(2) + '×' : p.value[1].toFixed(0) + '%'}`)
            .join('<br/>');
          return `${head}<br/>${lines}`;
        }
      },
      xAxis: {
        type: 'value',
        name: data.x_label,
        nameLocation: 'middle',
        nameGap: 26,
        nameTextStyle: { color: '#9CA3AF' },
        axisLabel: { color: '#9CA3AF' },
        axisLine: { lineStyle: { color: '#1F2937' } },
        splitLine: { lineStyle: { color: '#1F2937' } }
      },
      yAxis: {
        type: useLog ? 'log' : 'value',
        name: isMultiple ? 'ROI (×)' : 'ROI (%)',
        nameTextStyle: { color: '#9CA3AF' },
        axisLabel: { color: '#9CA3AF', formatter: (v: number) => (isMultiple ? `${v}×` : `${v}%`) },
        axisLine: { lineStyle: { color: '#1F2937' } },
        splitLine: { lineStyle: { color: '#1F2937' } }
      },
      series: visible.map((s) => ({
        name: s.label,
        type: 'line',
        showSymbol: false,
        z: s.key === currentKey ? 10 : 1,
        lineStyle: { width: s.key === currentKey ? 3 : 1.5, color: colorMap[s.key], opacity: s.key === currentKey ? 1 : 0.8 },
        data: s.points.map((p) => [p.days_since_event, p[valueKey]])
      }))
    };
  });

  // ── "Is the current cycle/year ahead/behind?" — median primary, mean secondary,
  //    over the VISIBLE peers (so toggling 2011 on includes it). ──
  const positioning = $derived.by(() => {
    if (!data) return null;
    const cur = data.series.find((s) => s.key === currentKey);
    if (!cur || !cur.points.length) return null;
    const lastDay = cur.points[cur.points.length - 1].days_since_event;
    const curVal = cur.points[cur.points.length - 1].roi_multiple;

    const peers = data.series.filter((s) => s.key !== currentKey && !hidden.has(s.key));
    const vals: number[] = [];
    for (const s of peers) {
      const p = [...s.points].reverse().find((pt) => pt.days_since_event <= lastDay);
      if (p) vals.push(p.roi_multiple);
    }
    if (!vals.length) return null;
    const med = median(vals);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const stance = curVal > med * 1.1 ? 'ahead of' : curVal < med * 0.9 ? 'behind' : 'in line with';
    return { lastDay, curVal, med, mean, stance, peers: vals.length };
  });
</script>

<header class="mb-5">
  <h1 class="text-xl font-semibold text-strong">BTC Cycle Lab</h1>
  <p class="text-sm text-muted">
    Compare Bitcoin’s current cycle against previous ones using ROI overlays. Historical comparison — not a price
    prediction.
  </p>
</header>

{#if allowed === false}
  <LockedFeature
    title="BTC Cycle Lab is a Premium feature"
    plan="premium"
    bullets={['ROI overlays vs previous cycles & halvings', 'Year-over-year and cycle-low comparisons', 'Cycle risk gauge & DCA framing']}
  />
{:else if allowed === null}
  <div class="card text-center text-muted">Loading…</div>
{:else}
<!-- Risk + DCA cards -->
{#if risk}
  <div class="mb-4 grid gap-4 md:grid-cols-2">
    <div class="card flex items-center gap-4">
      <Gauge value={risk.risk_score / 100} title="Cycle Risk" size={150} />
      <div class="min-w-0">
        <p class="text-sm font-semibold text-strong">{risk.risk_label}</p>
        <p class="mt-0.5 text-xs text-muted">{risk.reason}</p>
        <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <span class="text-muted">RSI <span class="text-body">{risk.rsi ?? '—'}</span></span>
          <span class="text-muted">vs 200D MA <span class="text-body">{fmtPct(risk.distance_from_200ma)}</span></span>
          <span class="text-muted">From ATH <span class="text-body">{fmtPct(risk.drawdown_from_ath)}</span></span>
          <span class="text-muted">YTD <span class="text-body">{fmtPct(risk.ytd_roi)}</span></span>
        </div>
      </div>
    </div>

    <div class="card">
      <p class="stat-label">DCA / Accumulation</p>
      <p class="mt-1 text-2xl font-semibold text-strong">{risk.dca_window}</p>
      <p class="mt-2 text-sm text-muted">
        With cycle risk at <span class="text-body">{risk.risk_score}/100</span> ({risk.risk_label.toLowerCase()}),
        BTC at {fmtUsd(risk.btc_price)} sits {risk.drawdown_from_ath.toFixed(0)}% from its ATH —
        {risk.risk_score <= 40
          ? 'historically a more favourable accumulation zone.'
          : risk.risk_score >= 70
            ? 'a higher-risk zone where adding aggressively has historically carried more downside.'
            : 'a neutral zone — neither cheap nor stretched.'}
      </p>
    </div>
  </div>
{/if}

<!-- Controls -->
<div class="card mb-4 flex flex-wrap items-center gap-4">
  <div class="flex rounded-lg border border-edge p-0.5">
    {#each [['cycle-low', 'Cycle Low'], ['halving', 'Halving'], ['year-overlay', 'Yearly ROI']] as [t, label]}
      <button
        class="rounded-md px-3 py-1.5 text-sm"
        class:bg-panel-2={chartType === t}
        class:text-strong={chartType === t}
        class:text-muted={chartType !== t}
        onclick={() => setType(t as ChartType)}
      >{label}</button>
    {/each}
  </div>

  <div class="flex items-center gap-1 text-sm">
    <span class="stat-label mr-1">Scale</span>
    <button class="rounded-md px-2 py-1" class:bg-panel-2={scale === 'log'} class:text-strong={scale === 'log'} class:text-muted={scale !== 'log'} onclick={() => (scale = 'log')}>Log</button>
    <button class="rounded-md px-2 py-1" class:bg-panel-2={scale === 'linear'} class:text-strong={scale === 'linear'} class:text-muted={scale !== 'linear'} onclick={() => (scale = 'linear')}>Linear</button>
  </div>

  <div class="flex items-center gap-1 text-sm" class:opacity-40={scale === 'log'}>
    <span class="stat-label mr-1">Mode</span>
    <button class="rounded-md px-2 py-1" class:bg-panel-2={mode === 'multiple'} class:text-strong={mode === 'multiple'} class:text-muted={mode !== 'multiple'} disabled={scale === 'log'} onclick={() => (mode = 'multiple')}>×</button>
    <button class="rounded-md px-2 py-1" class:bg-panel-2={mode === 'percent'} class:text-strong={mode === 'percent'} class:text-muted={mode !== 'percent'} disabled={scale === 'log'} onclick={() => (mode = 'percent')}>%</button>
  </div>
</div>

{#if loading}
  <div class="card text-center text-muted">Loading cycle data…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if data}
  {#if positioning}
    <div class="card mb-4">
      <p class="text-sm text-soft">
        At day <span class="font-semibold text-strong">{positioning.lastDay}</span>, the current {noun} is
        <span class="font-semibold" style="color: {positioning.stance === 'ahead of' ? '#22C55E' : positioning.stance === 'behind' ? '#EF4444' : '#9CA3AF'}">{positioning.stance}</span>
        previous {noun}s — {positioning.curVal.toFixed(2)}× vs
        <span class="font-semibold text-strong">{positioning.med.toFixed(2)}× median</span>
        <span class="text-muted">(mean {positioning.mean.toFixed(2)}×, {positioning.peers} {noun}s)</span> at the same day.
      </p>
    </div>
  {/if}

  <!-- Toggle chips -->
  <div class="mb-3 flex flex-wrap gap-2">
    {#each data.series as s}
      <button
        class="pill border transition"
        style={!hidden.has(s.key)
          ? `background:${colorMap[s.key]}22;color:${colorMap[s.key]};border-color:${colorMap[s.key]}`
          : 'border-color:#1F2937;color:#9CA3AF'}
        onclick={() => toggle(s.key)}
      >
        {s.label}
        <span class="opacity-60">· {fmtUsd(s.anchor_price, { compact: true })}</span>
      </button>
    {/each}
  </div>

  <div class="card">
    <EChart {option} height={460} />
  </div>

  <div class="mt-6"><Disclaimer /></div>
{/if}
{/if}
