<script lang="ts">
  import { api } from '$lib/api';
  import Gauge from '$lib/components/Gauge.svelte';
  import EChart from '$lib/components/EChart.svelte';
  import Disclaimer from '$lib/components/Disclaimer.svelte';
  import LockedFeature from '$lib/components/LockedFeature.svelte';
  import AiInterpret from '$lib/components/AiInterpret.svelte';
  import AiLabel from '$lib/components/AiLabel.svelte';
  import { membership, membershipReady, hasFeature } from '$lib/stores/membership';

  interface MetricRow {
    key: string;
    label: string;
    value: string | null;
    risk: number | null;
    status: string;
    meaning: string;
    source: string;
  }
  interface SocialData {
    as_of: string;
    social_risk_score: number | null;
    label: string;
    coverage_status: string;
    interpretation: string;
    source_status: Record<string, string>;
    metrics: MetricRow[];
  }
  interface HistPoint {
    date: string;
    trends_bitcoin: number | null;
    fear_greed: number | null;
    youtube_attention: number | null;
    social_risk_score: number | null;
    btc_price: number | null;
  }

  let data = $state<SocialData | null>(null);
  let hist = $state<HistPoint[]>([]);
  let error = $state('');
  let loading = $state(true);
  let innerWidth = $state(1200);
  const chartHeight = $derived(innerWidth < 640 ? 230 : 300);

  const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const riskColor = (r: number | null) =>
    r == null ? '#8b97a8' : r < 0.2 ? '#2fbf71' : r < 0.4 ? '#9acd3e' : r < 0.6 ? '#ffd23f' : r < 0.8 ? '#ff8c42' : '#ff5d6c';
  const srcColor = (s: string) =>
    s === 'Active' ? 'bg-mint/15 text-mint' : s.includes('Future') ? 'bg-edge text-muted' : s.includes('Pending') ? 'bg-warn/15 text-warn' : 'bg-danger/15 text-danger';

  const SOURCE_LABELS: Record<string, string> = {
    google_trends: 'Google Trends',
    wikipedia: 'Wikipedia',
    fear_greed: 'Fear & Greed',
    youtube: 'YouTube',
    x_twitter: 'X / Twitter',
    reddit: 'Reddit',
    telegram_discord: 'Telegram / Discord'
  };

  const takeaway = $derived.by(() => {
    if (data?.social_risk_score == null) return '';
    const r = data.social_risk_score;
    return r < 0.4
      ? 'Social risk is low. Public attention remains quiet, which supports the idea that the market is not yet in a crowded retail-hype phase.'
      : r < 0.6
        ? 'Social risk is moderate. The crowd is paying more attention than during quiet accumulation periods, but the data does not yet show full retail euphoria.'
        : 'Social risk is high. Retail attention and sentiment are elevated — if price metrics are also high, total risk should move closer to caution or distribution.';
  });

  // Map a 0–1 risk value to an AI-signal tone, mirroring the page's riskColor thresholds.
  const riskTone = (r: number | null) => (r == null ? 'neutral' : r < 0.4 ? 'good' : r < 0.6 ? 'warn' : 'danger');

  // Signals for the AI interpretation — built from values this page already computes/shows.
  const aiSignals = $derived(
    data
      ? [
          { name: 'social_risk_score', label: data.label, value: data.social_risk_score, tone: riskTone(data.social_risk_score) },
          ...data.metrics
            .filter((m) => m.value != null || m.risk != null)
            .slice(0, 4)
            .map((m) => ({ name: m.key, label: m.label, value: m.value ?? m.risk, meaning: m.meaning, tone: riskTone(m.risk) }))
        ]
      : []
  );

  // Access gating — Social Metrics is Mid+; the per-source breakdown + second
  // chart are "full" (Premium via advanced filters). Backend enforces too.
  const allowed = $derived($membershipReady ? hasFeature($membership, 'access_social_metrics') : null);
  const canFull = $derived(hasFeature($membership, 'access_advanced_filters'));

  const load = async () => {
    try {
      data = await api<SocialData>('/social-metrics/btc', { auth: true });
      hist = await api<{ series: HistPoint[] }>('/social-metrics/btc/history', { auth: true }).then((r) => r.series);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Social metrics not synced yet. Run a social-metrics sync from the Admin panel.';
    } finally {
      loading = false;
    }
  };

  let started = false;
  $effect(() => {
    if (allowed && !started) {
      started = true;
      load();
    }
  });

  const smooth = (vals: (number | null)[], win = 14) =>
    vals.map((_, i) => {
      const from = Math.max(0, i - win + 1);
      const slice = vals.slice(from, i + 1).filter((v): v is number => v != null);
      return slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : null;
    });

  const compact = (v: number) => '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const axisBase = (name: string) => ({ nameTextStyle: { color: '#9CA3AF' }, axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, name });

  const riskOption = $derived.by(() => {
    if (!hist.length) return {};
    const socialSm = smooth(hist.map((p) => p.social_risk_score));
    return {
      backgroundColor: 'transparent',
      grid: { left: 58, right: 48, top: 24, bottom: 30 },
      legend: { data: ['BTC price', 'Social risk'], textStyle: { color: '#9CA3AF' }, top: 0 },
      tooltip: { trigger: 'axis', backgroundColor: '#0E1117', borderColor: '#1F2937', textStyle: { color: '#F9FAFB', fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: [
        { type: 'log', position: 'left', scale: true, ...axisBase('BTC'), axisLabel: { color: '#9CA3AF', formatter: compact }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'value', min: 0, max: 1, position: 'right', ...axisBase('Risk'), splitLine: { show: false } }
      ],
      series: [
        { name: 'BTC price', type: 'line', yAxisIndex: 0, showSymbol: false, itemStyle: { color: '#37e0a6' }, lineStyle: { width: 1.2, color: '#37e0a6' }, data: hist.filter((p) => p.btc_price != null).map((p) => [ts(p.date), p.btc_price]) },
        { name: 'Social risk', type: 'line', yAxisIndex: 1, showSymbol: false, smooth: true, itemStyle: { color: '#F59E0B' }, lineStyle: { width: 2, color: '#F59E0B' }, data: hist.map((p, i) => [ts(p.date), socialSm[i]]).filter((d) => d[1] != null) }
      ]
    };
  });

  const sourcesOption = $derived.by(() => {
    if (!hist.length) return {};
    const line = (name: string, color: string, vals: (number | null)[]) => ({ name, type: 'line', yAxisIndex: 1, showSymbol: false, itemStyle: { color }, lineStyle: { width: 1.2, color }, data: hist.map((p, i) => [ts(p.date), vals[i]]).filter((d) => d[1] != null) });
    return {
      backgroundColor: 'transparent',
      grid: { left: 58, right: 48, top: 24, bottom: 30 },
      legend: { data: ['BTC price', 'Trends', 'Fear & Greed', 'YouTube'], textStyle: { color: '#9CA3AF' }, top: 0 },
      tooltip: { trigger: 'axis', backgroundColor: '#0E1117', borderColor: '#1F2937', textStyle: { color: '#F9FAFB', fontSize: 11 } },
      xAxis: { type: 'time', axisLabel: { color: '#9CA3AF' }, axisLine: { lineStyle: { color: '#1F2937' } }, splitLine: { show: false } },
      yAxis: [
        { type: 'log', position: 'left', scale: true, ...axisBase('BTC'), axisLabel: { color: '#9CA3AF', formatter: compact }, splitLine: { lineStyle: { color: '#1F2937' } } },
        { type: 'value', min: 0, max: 1, position: 'right', ...axisBase('0–1'), splitLine: { show: false } }
      ],
      series: [
        { name: 'BTC price', type: 'line', yAxisIndex: 0, showSymbol: false, itemStyle: { color: '#37e0a6' }, lineStyle: { width: 1.2, color: '#37e0a6' }, data: hist.filter((p) => p.btc_price != null).map((p) => [ts(p.date), p.btc_price]) },
        line('Trends', '#3B82F6', hist.map((p) => (p.trends_bitcoin == null ? null : p.trends_bitcoin / 100))),
        line('Fear & Greed', '#c084fc', hist.map((p) => (p.fear_greed == null ? null : p.fear_greed / 100))),
        line('YouTube', '#EF4444', hist.map((p) => (p.youtube_attention == null ? null : p.youtube_attention / 100)))
      ]
    };
  });
</script>

<svelte:window bind:innerWidth />

<header class="mb-4">
  <h1 class="text-xl font-semibold text-strong">Pastatrade Social Risk</h1>
  <p class="text-sm text-muted">Measure whether Bitcoin is in quiet accumulation, renewed attention, or retail-hype conditions.</p>
</header>

{#if allowed === false}
  <LockedFeature
    title="Social Metrics is a Mid &amp; Premium feature"
    plan="mid"
    bullets={['Social risk score (Trends, Fear & Greed, Wikipedia, YouTube)', 'Plain-language hype vs accumulation read', 'Premium: full per-source breakdown + history charts']}
  />
{:else if loading || allowed === null}
  <div class="card text-center text-muted">Loading social metrics…</div>
{:else if error}
  <div class="card border-danger/30 bg-danger/5 text-danger">{error}</div>
{:else if data}
  <!-- Gauge + interpretation + takeaway -->
  <div class="card mb-4 grid gap-4 md:grid-cols-[200px_1fr]">
    <div class="flex flex-col items-center">
      <Gauge value={data.social_risk_score} title="Social Risk" />
      <span class="mt-1 rounded-full px-3 py-1 text-xs font-semibold" style="background: {riskColor(data.social_risk_score)}22; color: {riskColor(data.social_risk_score)}">{data.label}</span>
    </div>
    <div>
      <p class="text-sm leading-relaxed text-soft">{data.interpretation}</p>
      <div class="ai-glow mt-2 rounded-lg border border-mint/30 bg-mint/5 px-3 py-2">
        <AiLabel />
        <p class="mt-1 text-xs leading-relaxed text-soft">{takeaway}</p>
      </div>
      <p class="mt-2 rounded-lg border border-edge bg-panel-2 px-3 py-1.5 text-xs text-muted">{data.coverage_status}</p>
    </div>
  </div>

  <!-- AI interpretation (self-gating: Premium button / free upsell) -->
  <div class="mb-4"><AiInterpret module="social" title="Social Signals" signals={aiSignals} /></div>

  <!-- Source status -->
  <div class="card mb-4">
    <h2 class="mb-2 text-sm font-semibold text-strong">Source status</h2>
    <div class="flex flex-wrap gap-2">
      {#each Object.entries(data.source_status) as [key, status]}
        <span class="pill {srcColor(status)}">{SOURCE_LABELS[key] ?? key}: {status}</span>
      {/each}
    </div>
  </div>

  <!-- Social metrics — per-source breakdown (Premium "full" view) -->
  {#if canFull}
  <div class="card mb-4 p-0">
    <div class="border-b border-edge px-4 py-3"><h2 class="text-sm font-semibold text-strong">Social metrics</h2></div>

    <!-- Mobile -->
    <div class="divide-y divide-edge/60 sm:hidden">
      {#each data.metrics as m}
        <div class="px-4 py-3">
          <div class="flex items-start justify-between gap-2">
            <span class="font-medium text-strong">{m.label}</span>
            <span class="pill {srcColor(m.status)} shrink-0 text-[10px]">{m.status}</span>
          </div>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <span class="text-soft">{m.value ?? '—'}</span>
            {#if m.risk != null}<span class="rounded px-2 py-0.5 font-mono text-xs font-semibold" style="background: {riskColor(m.risk)}22; color: {riskColor(m.risk)}">{m.risk.toFixed(2)}</span>{/if}
          </div>
          <p class="mt-1 text-xs text-muted">{m.meaning}</p>
        </div>
      {/each}
    </div>

    <!-- Larger screens -->
    <div class="hidden overflow-x-auto sm:block">
      <table class="w-full min-w-[640px] text-sm">
        <thead>
          <tr class="border-b border-edge text-left text-xs uppercase tracking-wider text-muted">
            <th class="px-4 py-2">Metric</th>
            <th class="px-4 py-2">Value</th>
            <th class="px-4 py-2">Risk</th>
            <th class="px-4 py-2">Status</th>
            <th class="px-4 py-2">Meaning</th>
          </tr>
        </thead>
        <tbody>
          {#each data.metrics as m}
            <tr class="border-b border-edge/60 last:border-0">
              <td class="px-4 py-2 font-medium text-strong">{m.label}</td>
              <td class="px-4 py-2 text-soft">{m.value ?? '—'}</td>
              <td class="px-4 py-2">{#if m.risk == null}<span class="text-muted">—</span>{:else}<span class="rounded px-2 py-0.5 font-mono text-xs font-semibold" style="background: {riskColor(m.risk)}22; color: {riskColor(m.risk)}">{m.risk.toFixed(2)}</span>{/if}</td>
              <td class="px-4 py-2"><span class="pill {srcColor(m.status)}">{m.status}</span></td>
              <td class="px-4 py-2 text-xs text-muted">{m.meaning}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
  {:else}
    <div class="card mb-4 flex flex-wrap items-center justify-between gap-2 border-accent/30 bg-accent/5">
      <p class="text-sm text-soft"><span class="font-medium text-strong">Premium:</span> unlock the full per-source breakdown (Trends, Wikipedia, Fear &amp; Greed, YouTube) and history charts.</p>
      <a href="/app/account" class="btn-primary px-3 py-1.5 text-xs">Go Premium</a>
    </div>
  {/if}

  <!-- Charts -->
  {#if hist.length}
    <div class="card mb-4">
      <h2 class="mb-1 text-sm font-semibold text-strong">Social Risk Score vs BTC price</h2>
      <EChart option={riskOption} height={chartHeight} />
    </div>
    {#if canFull}
      <div class="card mb-4">
        <h2 class="mb-1 text-sm font-semibold text-strong">Sources vs BTC price</h2>
        <p class="mb-1 text-xs text-muted">Google Trends, Fear &amp; Greed and YouTube (each 0–1) against BTC price.</p>
        <EChart option={sourcesOption} height={chartHeight} />
      </div>
    {/if}
  {/if}

  <!-- Disclaimers -->
  <div class="space-y-2 text-xs leading-relaxed text-muted">
    <p class="rounded-lg border border-edge bg-panel-2 px-3 py-2">Social Risk measures attention and sentiment, not guaranteed price direction. High social attention can signal hype, but it does not mean price must fall. Low social attention can support accumulation conditions, but it does not guarantee price will rise.</p>
    <p>Google Trends is normalized from 0 to 100 and does not represent raw search volume. Google Trends has an official API in limited/alpha access; until production access is approved it is treated as a pluggable optional source.</p>
    <p>Some social data sources may be unavailable due to API limits or quotas. When unavailable, the model automatically reweights active sources and shows a coverage note.</p>
  </div>

  <div class="mt-4"><Disclaimer /></div>
{/if}
